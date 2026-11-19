import {
  emptyConfig,
  type Config,
  type Inspection,
  type ContentRequest,
  type Result,
} from "../core/schema";
import {
  ConnectionBlocked,
  parseCommandResult,
  pdfViewerInjectionResult,
  type CommandResult,
} from "../core/messages";
import { ruleTargets, ruleQuery } from "../core/targets";
import { resolveFrame, restoreRuleFrames } from "../core/frames";
import { inspectableWebsite } from "../core/site-access";
import type { createQueue } from "../core/queue";
import { reconcileCustomFonts } from "../core/font-rules";
import { restoreFontshareFonts } from "../providers/catalog";
import { allFaces, groupFamilies } from "../storage/fonts";
import { draftKey, readPageDraft, writePageDraft } from "../storage/drafts";
import { migrateStorage } from "../storage/migrations";
export function createSessionService(
  serial: ReturnType<typeof createQueue>,
  showFloating: (tabId: number) => Promise<void>,
) {
  async function send<R extends ContentRequest>(
    tabId: number,
    frameId: number,
    request: R,
  ): Promise<Result<CommandResult<R>>> {
    try {
      const result = await chrome.tabs.sendMessage(
        tabId,
        { channel: "fontzie-tab", frameId, request },
        { frameId },
      );
      return { ok: true, data: parseCommandResult(request, result) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  async function inject(tabId: number) {
    const tab = await chrome.tabs.get(tabId);
    // Without a grant, Chrome can hide the URL altogether.
    if (!inspectableWebsite(tab.url))
      throw new ConnectionBlocked("unsupported-page");
    const results = await chrome.scripting
      .executeScript({
        target: { tabId, allFrames: true },
        files: ["inspector.js"],
      })
      .catch((error: unknown) => {
        // Chrome exposes injection denials as text. Translate them here so
        // the panel can make decisions from stable reasons.
        if (error instanceof Error) {
          if (
            /^Cannot access contents of (?:the page\.|url ")/.test(
              error.message,
            )
          )
            throw new ConnectionBlocked("access-required");
          if (
            /^Cannot access a chrome(?:-extension)?:\/\//.test(error.message) ||
            /^The (?:New Tab Page|extensions gallery) cannot be scripted\./.test(
              error.message,
            )
          )
            throw new ConnectionBlocked("unsupported-page");
        }
        throw error;
      });
    const frames = (
      await Promise.all(
        results.map(async (x) => {
          if (x.result === pdfViewerInjectionResult) {
            if (x.frameId === 0)
              throw new ConnectionBlocked("unsupported-page");
            return undefined;
          }
          const state = await send(tabId, x.frameId, { type: "state" });
          if (!state.ok || !/^https?:/.test(state.data?.url ?? ""))
            return undefined;
          return {
            id: x.frameId,
            url: state.data.url,
            documentToken: state.data.documentToken,
          };
        }),
      )
    ).filter((frame) => frame !== undefined);
    await chrome.storage.session.set({
      [`frames:${tabId}`]: frames.map((f) => f.id),
    });
    return frames;
  }
  async function connect(tabId: number) {
    await migrateStorage();
    const frames = await inject(tabId);
    const result = await send(tabId, 0, { type: "state" });
    if (!result.ok) throw Error(result.error);
    const state = result.data;
    const old = (await chrome.storage.session.get(`tab:${tabId}`))[
      `tab:${tabId}`
    ] as
      | {
          url?: string;
          config?: Config;
          activeRuleId?: string;
          selection?: Inspection;
          documentToken?: string;
          frameDocuments?: Record<number, string | undefined>;
          restorationWarnings?: string[];
          siteClearId?: string;
        }
      | undefined;
    const samePage = !!old?.url && draftKey(old.url) === draftKey(state.url);
    const freshDocument =
      (old as { documentToken?: string } | undefined)?.documentToken !==
      state.documentToken;
    const draft = samePage ? undefined : await readPageDraft(state.url);
    // A cached document may still have rules if it was unreachable during the clear.
    const staleClearedPage =
      samePage &&
      !!old?.siteClearId &&
      old.config?.rules.length === 0 &&
      state.config.rules.length > 0;
    let config: Config = samePage
      ? ((state.config.rules.length && !staleClearedPage
          ? state.config
          : old?.config) ?? state.config)
      : (draft?.config ?? state.config);
    // Route changes get their own configuration, including SPA navigations.
    if (old?.url && !samePage) config = draft?.config ?? emptyConfig();
    // A draft or a previously unreachable tab can outlive a custom font file.
    if (config.rules.some((rule) => rule.font?.provider === "custom"))
      config = reconcileCustomFonts(config, groupFamilies(await allFaces()));
    const restorationWarnings = new Set(
      samePage && !freshDocument ? (old?.restorationWarnings ?? []) : [],
    );
    const sameDocument = samePage && !freshDocument;
    config = await restoreFontshareFonts(config, restorationWarnings);
    config = restoreRuleFrames(
      config,
      frames,
      sameDocument,
      restorationWarnings,
    );
    const clearSelection = (!!old?.url && !samePage) || staleClearedPage;
    let selection: Inspection | undefined = clearSelection
      ? undefined
      : state.selection;
    const savedSelection = samePage
      ? old?.selection && {
          selector: old.selection.selector,
          frameId: old.selection.frameId,
          frameUrl: old.selection.url,
        }
      : draft?.selection && {
          ...draft.selection,
          frameId: draft.selection.frameUrl ? 2147483647 : 0,
        };
    const selectionFrame = savedSelection
      ? resolveFrame(
          frames,
          savedSelection.frameId,
          savedSelection.frameUrl,
          sameDocument,
        )
      : undefined;
    const previousSelection =
      savedSelection && selectionFrame
        ? { selector: savedSelection.selector, frameId: selectionFrame.id }
        : undefined;
    if (savedSelection && !selectionFrame) selection = undefined;
    let restored = false;
    for (const frame of frames) {
      if (clearSelection) {
        const result = await send(tabId, frame.id, { type: "clear-selection" });
        if (!result.ok) throw Error(result.error);
      }
      const restoring =
        (!samePage ||
          freshDocument ||
          old?.frameDocuments?.[frame.id] !== frame.documentToken) &&
        (config.rules.length > 0 || !!previousSelection);
      if (restoring) {
        restored = true;
        const result = await send(tabId, frame.id, {
          type: "restore",
          config,
          selector:
            previousSelection?.frameId === frame.id
              ? previousSelection.selector
              : undefined,
        });
        if (!result.ok) throw Error(result.error);
        config = result.data.config;
        result.data.warnings.forEach((warning) =>
          restorationWarnings.add(warning),
        );
        if (
          result.data.selection &&
          (!selection || previousSelection?.frameId === frame.id)
        )
          selection = result.data.selection;
      } else {
        const result = await send(tabId, frame.id, { type: "apply", config });
        if (!result.ok) throw Error(result.error);
      }
    }
    // A later frame may rebind exact targets after earlier engines received
    // the config. Keep their copies canonical for the next state/reconnect.
    if (restored)
      for (const frame of frames.slice(0, -1)) {
        const result = await send(tabId, frame.id, { type: "apply", config });
        if (!result.ok) throw Error(result.error);
      }
    const rememberedId = samePage ? old?.activeRuleId : draft?.activeRuleId;
    const activeRule =
      config.rules.find((rule) => rule.id === rememberedId) ??
      config.rules.find(
        (rule) =>
          rule.frameId === selection?.frameId &&
          ruleTargets(rule).some((target) =>
            target.kind === "exact"
              ? target.handle === selection?.handle
              : target.selector === selection?.selector,
          ),
      ) ??
      config.rules[0];
    // Inspection is only context for the restored rule, never an independent draft target.
    selection = undefined;
    if (
      activeRule?.selector &&
      frames.some((frame) => frame.id === activeRule.frameId)
    ) {
      const inspected = await send(tabId, activeRule.frameId, {
        type: "inspect",
        selector: ruleQuery(activeRule),
      });
      if (inspected.ok) selection = inspected.data.selection;
    }
    const data = {
      ...state,
      activeRuleId: activeRule?.id,
      config,
      selection,
      restorationWarnings: [...restorationWarnings],
      siteClearId: old?.siteClearId,
      frames: frames.map((f) => f.id),
      frameDocuments: Object.fromEntries(
        frames.map((frame) => [frame.id, frame.documentToken]),
      ),
    };
    await chrome.storage.session.set({ [`tab:${tabId}`]: data });
    if (draft || config.rules.length)
      await writePageDraft(state.url, config, selection, activeRule?.id);
    return data;
  }
  async function restoreTab(tab: chrome.tabs.Tab) {
    const tabId = tab.id;
    if (tabId === undefined || !tab.url || !/^https?:/.test(tab.url)) return;
    const old = (await chrome.storage.session.get(`tab:${tabId}`))[
      `tab:${tabId}`
    ] as { url?: string; config?: Config } | undefined;
    const samePage = !!old?.url && draftKey(old.url) === draftKey(tab.url!);
    // Existing sessions also need reconnecting after SPA navigation, so the
    // previous route's styles are cleared when the destination has no draft.
    // Chrome enforces the current grant; no extra permission is requested.
    if (old?.url) {
      const key = `floating:${tabId}`;
      if (!samePage) await chrome.storage.session.remove(key);
      await serial(`tab:${tabId}`, () => connect(tabId));
      if (
        samePage &&
        (await chrome.storage.session.get(key))[key] === draftKey(tab.url)
      )
        await showFloating(tabId);
      return;
    }
    await chrome.storage.session.remove(`floating:${tabId}`);
    if (!(await readPageDraft(tab.url))) return;
    const u = new URL(tab.url!);
    if (await chrome.permissions.contains({ origins: [`${u.origin}/*`] }))
      await serial(`tab:${tabId}`, () => connect(tabId));
  }

  return { send, connect, restoreTab, inject };
}
export type SessionService = ReturnType<typeof createSessionService>;
