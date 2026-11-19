import {
  refreshRoots,
  scheduleRootRefresh,
  watchRoots,
  disposeRoots,
} from "../content/roots";
import { Engine } from "../content/engine";
import { randomToken } from "../core/random-token";
import { Inspector, matches, roots } from "../content/inspector";
import { ruleTargets, withTargets } from "../core/targets";
import { TargetHighlight } from "../content/highlight";
import {
  pdfViewerInjectionResult,
  type PageEvent,
  type TargetElement,
} from "../core/messages";
import { requestSchema, targetSchema } from "../core/schema";
export default defineUnlistedScript(() => {
  if (!/^https?:$/.test(location.protocol)) return;
  // Chrome can run scripts in the outer document of its PDF viewer.
  if (document.contentType === "application/pdf")
    return pdfViewerInjectionResult;
  const global = globalThis as typeof globalThis & { __fontzie?: boolean };
  if (global.__fontzie) return;
  const engine = new Engine();
  const documentToken = randomToken();
  let frameId = 0;
  let selection: ReturnType<Inspector["inspect"]> | undefined;
  const notify = (data: PageEvent) =>
    chrome.runtime
      .sendMessage({ channel: "fontzie-content", type: "event", data })
      .catch(() => {});
  const inspector = new Inspector(
    (i) => {
      picking = false;
      selection = { ...i, frameId };
      void notify({ type: "selection", selection });
    },
    () => {
      picking = false;
      void notify({ type: "cancel" });
    },
  );
  let picking = false;
  const highlights = new Set<TargetHighlight>();
  const clearHighlights = () => {
    for (const highlight of highlights) highlight.clear();
  };
  chrome.runtime.onConnect.addListener((port) => {
    if (
      port.name !== "fontzie-highlight" ||
      port.sender?.id !== chrome.runtime.id
    )
      return;
    const highlight = new TargetHighlight();
    highlights.add(highlight);
    port.onMessage.addListener((message) => {
      const parsed = targetSchema.array().max(100).safeParse(message?.targets);
      if (!picking && parsed.success) highlight.show(parsed.data);
      else highlight.clear();
    });
    port.onDisconnect.addListener(() => {
      highlight.clear();
      highlights.delete(highlight);
    });
  });
  let activeSelector: string | undefined,
    lastCount = -1,
    matchTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleMatchCount() {
    if (!activeSelector || matchTimer !== undefined) return;
    matchTimer = setTimeout(() => {
      matchTimer = undefined;
      if (!activeSelector) return;
      try {
        const count = matches(activeSelector).length;
        if (count !== lastCount) {
          lastCount = count;
          void notify({ type: "matches", count, selector: activeSelector });
        }
        observeMatchRoots(activeSelector);
      } catch {}
    }, 250);
  }
  const countObserver = new MutationObserver(scheduleMatchCount);
  const stopCountRootWatch = watchRoots(() => {
    if (activeSelector) scheduleMatchCount();
  });
  function observeMatchRoots(selector: string) {
    countObserver.disconnect();
    for (const root of roots())
      countObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        // Attribute and state selectors can depend on more than class or ID.
        attributeFilter:
          selector.includes("[") || selector.includes(":")
            ? undefined
            : ["id", "class"],
      });
  }
  function watchMatches(selector: string, count: number) {
    activeSelector = selector;
    lastCount = count;
    observeMatchRoots(selector);
  }
  function stopWatchingMatches() {
    activeSelector = undefined;
    countObserver.disconnect();
    clearTimeout(matchTimer);
    matchTimer = undefined;
  }
  let work = Promise.resolve();
  chrome.runtime.onMessage.addListener((raw, _sender, respond) => {
    if (raw?.channel !== "fontzie-tab") return;
    const parsed = requestSchema.safeParse(raw.request);
    if (!parsed.success) {
      respond({ ok: false, error: "Invalid command." });
      return;
    }
    frameId = raw.frameId ?? 0;
    work = work
      .catch(() => {})
      .then(async () => {
        try {
          const r = parsed.data;
          if (
            r.type === "state" ||
            r.type === "restore" ||
            r.type === "target-element" ||
            (r.type === "inspect" && !r.previewOnly && !r.reuseRoots)
          )
            refreshRoots();
          if (r.type === "inspect" && r.reuseRoots) scheduleRootRefresh();
          let data: unknown;
          if (r.type === "locate-picks")
            data = inspector.locatePicks(r.handles);
          if (r.type === "state")
            data = {
              config: engine.config,
              documentToken,
              selection,
              url: location.href,
              title: document.title,
              frameId,
            };
          if (r.type === "pick") {
            picking = r.active;
            clearHighlights();
            if (r.active) inspector.start();
            else inspector.stop();
            data = true;
          }
          if (r.type === "clear-selection") {
            picking = false;
            clearHighlights();
            inspector.stop();
            selection = undefined;
            stopWatchingMatches();
            data = true;
          }
          if (r.type === "target-element") {
            const element = matches(r.selector)[0];
            if (!element)
              throw Error("This picked element is no longer on the page.");
            data = {
              tag: element.localName,
              classes: [...element.classList],
            } satisfies TargetElement;
          }
          if (r.type === "inspect") {
            const found = matches(r.selector);
            if (!r.previewOnly) {
              picking = false;
              clearHighlights();
              inspector.stop();
            }
            watchMatches(r.selector, found.length);
            if (found[0] && !r.previewOnly)
              selection = { ...inspector.inspect(found[0]), frameId };
            data = {
              count: found.length,
              selection: !r.previewOnly && found[0] ? selection : undefined,
            };
          }
          if (r.type === "before") {
            const base = engine.config;
            await engine.apply(
              { ...base, preview: r.active ? false : base.preview },
              frameId,
            );
            engine.config = base;
            data = true;
          }
          if (r.type === "restore") {
            const config = structuredClone(r.config);
            const warnings: string[] = [];
            for (const rule of config.rules.filter(
              (rule) => rule.frameId === frameId,
            )) {
              const targets = ruleTargets(rule);
              for (const target of targets.filter(
                (target) => target.kind === "exact",
              )) {
                if (target.kind !== "exact") continue;
                const found = matches(target.selector);
                target.handle = undefined;
                if (found.length === 1) {
                  const rebound = { ...inspector.inspect(found[0]!), frameId };
                  target.handle = rebound.handle;
                  if (!selection || r.selector === target.selector)
                    selection = rebound;
                } else {
                  rule.enabled = false;
                  warnings.push(
                    `“${target.selector}” ${found.length ? "matches more than one element" : "was not found"}. Its rule is paused; pick the target again.`,
                  );
                }
              }
              if (rule.targets || rule.mode === "exact")
                Object.assign(rule, withTargets(rule, targets));
            }
            if (r.selector) {
              const found = matches(r.selector);
              if (found.length)
                selection = { ...inspector.inspect(found[0]!), frameId };
            }
            await engine.apply(config, frameId);
            data = { config, selection, warnings };
          }
          if (r.type === "apply") {
            await engine.apply(r.config, frameId);
            data = true;
          }
          if (r.type === "clear") {
            picking = false;
            clearHighlights();
            await engine.apply(
              { version: 1, rules: [], preview: true },
              frameId,
            );
            inspector.dispose();
            engine.dispose();
            selection = undefined;
            stopWatchingMatches();
            data = true;
          }
          respond({ ok: true, data });
        } catch (e) {
          respond({
            ok: false,
            error: e instanceof Error ? e.message : "Page command failed.",
          });
        }
      });
    return true;
  });
  window.addEventListener("pagehide", (event) => {
    clearHighlights();
    inspector.stop();
    if (event.persisted) return;
    inspector.dispose();
    engine.dispose();
    disposeRoots();
    stopCountRootWatch();
    countObserver.disconnect();
    clearTimeout(matchTimer);
  });
  global.__fontzie = true;
});
