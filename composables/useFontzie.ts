import { computed, onMounted, onScopeDispose, ref, watch } from "vue";
import {
  configSchema,
  emptyConfig,
  newRule,
  propertiesSchema,
  type Config,
  type Inspection,
  type Property,
  type FontFamily,
  type Rule,
  type Target,
} from "../core/schema";
import { splitSelectors } from "../core/selectors";
import {
  ruleTargets,
  ruleQuery,
  targetsQuery,
  targetQuery,
  withTargets,
} from "../core/targets";
import { useConfigHistory } from "./useConfigHistory";
import { errorMessage } from "../core/errors";
import { quote } from "../core/css";
import { useAppearance } from "./useAppearance";
import { useTabConnection, type ConnectedTab } from "./useTabConnection";
import { closestWeight } from "../core/fonts";
import { reconcileCustomFonts, validateFontRule } from "../core/font-rules";
import { restoreFontshareFonts } from "../providers/catalog";
import {
  applyFontToRule,
  applyTypographyToRule,
  type TypographyChange,
} from "../core/bulk-typography";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export function useFontzie() {
  const config = ref<Config>(emptyConfig());
  const { settings, changeSettings, updateSettings, initialize } =
    useAppearance();
  const targets = ref<Target[]>([]);
  function syncTargets(next: Target[], syncSelector = true) {
    targets.value = clone(next);
    if (!syncSelector) return;
    selector.value = next
      .filter((target) => target.kind === "selector")
      .map((target) => target.selector)
      .join(", ");
  }
  const selection = ref<Inspection>(),
    selector = ref(""),
    matchCount = ref<number>();
  const selectedId = ref(""),
    picking = ref(false),
    busy = ref(false),
    error = ref(""),
    status = ref("");
  const restorationWarnings = ref<string[]>([]);
  const restorationNotice = computed(() => {
    if (!restorationWarnings.value.length) return "";
    const count = config.value.rules.filter(
      (rule) =>
        !rule.enabled &&
        ((rule.frameId !== 0 && !frames.value.includes(rule.frameId)) ||
          ruleTargets(rule).some(
            (target) => target.kind === "exact" && !target.handle,
          )),
    ).length;
    const notices = restorationWarnings.value.filter((warning) =>
      warning.startsWith("The Fontshare font "),
    );
    if (count)
      notices.push(
        count === 1
          ? "1 rule was paused because its saved target couldn’t be identified. Select that rule and pick its target again."
          : `${count} rules were paused because their saved targets couldn’t be identified. Select each rule and pick its target again.`,
      );
    return notices.join(" ");
  });
  function dismissRestorationNotice() {
    restorationWarnings.value = [];
  }
  const pendingProperties = ref(0);
  const targetingBusy = ref(false);
  const selectorCommitting = ref(false);
  const controlsBusy = computed(
    () => busy.value || pendingProperties.value > 0 || targetingBusy.value,
  );
  const history = useConfigHistory();
  let documentToken: string | undefined;
  const { canUndo, canRedo } = history;
  let pageGeneration = 0;
  let ownsPick: (() => boolean) | undefined;
  let pickRequestGeneration = 0;
  let listeningForClose = false;
  const editorGeneration = ref(0);
  const selectedRuleIds = ref<string[]>([]);
  function setSelectedRules(ids: string[]) {
    if (
      ids.length === selectedRuleIds.value.length &&
      ids.every((id) => selectedRuleIds.value.includes(id))
    )
      return;
    selectedRuleIds.value = ids;
    editorGeneration.value++;
  }
  function captureOwner(scope: "page" | "target" = "page") {
    const page = pageGeneration;
    const target = editorGeneration.value;
    return () =>
      connected.value &&
      page === pageGeneration &&
      (scope === "page" || target === editorGeneration.value);
  }
  onScopeDispose(() => {
    if (listeningForClose)
      window.removeEventListener("pagehide", cancelPickingOnClose);
    cancelPickingOnClose();
    pageGeneration++;
  });
  const report = (value: unknown) => {
    error.value = errorMessage(value);
  };
  const {
    tabId,
    url,
    title,
    frames,
    listFrames,
    frameId,
    connected,
    connectionIssue,
    siteOrigin,
    allowingSite,
    allSitesAllowed,
    changingAllSites,
    allSitesError,
    request,
    rememberRule,
    connect,
    clearSite,
    retry,
    allowSite,
    allowAllSites,
  } = useTabConnection({
    busy,
    error,
    status,
    report,
    initialize,
    onDisconnected,
    onConnected,
    onEvent,
  });
  function cancelPickingOnClose() {
    if (!picking.value || !connected.value) return;
    picking.value = false;
    ownsPick = undefined;
    // Send before the editor document disappears; teardown is best effort.
    void request("request", { type: "pick", active: false }).catch(() => {});
  }
  onMounted(() => {
    listeningForClose = true;
    window.addEventListener("pagehide", cancelPickingOnClose);
  });
  function onDisconnected() {
    documentToken = undefined;
    // Reset the editor's view; saved page edits stay in the background session.
    pageGeneration++;
    selectorGeneration++;
    countGeneration++;
    configWork = Promise.resolve(false);
    selectorWork = Promise.resolve();
    propertyWork = Promise.resolve(false);
    pendingProperties.value = 0;
    targetingBusy.value = false;
    selectorCommitting.value = false;
    config.value = emptyConfig();
    setSelectedRules([]);
    newTarget();
    picking.value = false;
    ownsPick = undefined;
    restorationWarnings.value = [];
    history.reset(emptyConfig());
  }
  watch(
    frameId,
    () => {
      editorGeneration.value++;
      selectorGeneration++;
      targetingBusy.value = false;
      selectorCommitting.value = false;
    },
    { flush: "sync" },
  );
  function onConnected(state: ConnectedTab) {
    config.value = state.config;
    selection.value = state.selection;
    documentToken = state.documentToken;
    history.reset(state.config, state.history);
    const selected = state.selection;
    selectedId.value =
      state.config.rules.find((rule) => rule.id === state.activeRuleId)?.id ??
      state.config.rules.find(
        (r) =>
          r.frameId === selected?.frameId &&
          ruleTargets(r).some((target) =>
            target.kind === "exact"
              ? target.handle === selected?.handle
              : target.selector === selected?.selector,
          ),
      )?.id ??
      state.config.rules[0]?.id ??
      "";
    const active = rule.value;
    syncTargets(active ? ruleTargets(active) : []);
    frameId.value = active?.frameId ?? 0;
    if (
      !active ||
      !active.selector ||
      (!state.activeRuleId &&
        !ruleTargets(active).some((target) =>
          target.kind === "exact"
            ? target.handle === selected?.handle
            : target.selector === selected?.selector,
        ))
    )
      selection.value = undefined;
    matchCount.value = selection.value ? 1 : undefined;
    restorationWarnings.value = state.restorationWarnings ?? [];
  }

  const rule = computed(() =>
    config.value.rules.find((r) => r.id === selectedId.value),
  );
  watch([connected, () => rule.value?.id], () => {
    if (!connected.value) return;
    // A newly created rule is remembered only after its config has committed.
    if (selectedId.value && !rule.value) return;
    const ownsTarget = captureOwner("target");
    void rememberRule(rule.value?.id).catch((error: unknown) => {
      if (ownsTarget()) report(error);
    });
  });
  const selectedRules = computed(() =>
    config.value.rules.filter((rule) =>
      selectedRuleIds.value.includes(rule.id),
    ),
  );
  let configWork: Promise<boolean> = Promise.resolve(false);
  function commit(
    next: Config,
    record = true,
    group?: string,
    persist?: () => Promise<void>,
  ) {
    const work = applyConfig(next, record, group, captureOwner(), persist);
    configWork = work;
    return work;
  }
  async function refreshSelection(
    ownsTarget: () => boolean,
    removedSelected = false,
  ) {
    if (!ownsTarget()) return;
    if (removedSelected || !scopeQuery.value) {
      // Removed/untargeted rules must not return as pending exact picks.
      try {
        await request("request", { type: "clear-selection" });
      } catch {
        // The config edit succeeded; selection cleanup is best effort.
      }
      if (ownsTarget()) {
        selection.value = undefined;
        matchCount.value = undefined;
      }
      return;
    }
    const query = scopeQuery.value;
    const frame = scopeFrame.value;
    try {
      const result = await request(
        "request",
        { type: "inspect", selector: query, reuseRoots: true },
        frame,
      );
      if (
        ownsTarget() &&
        query === scopeQuery.value &&
        frame === scopeFrame.value
      ) {
        selection.value = result.selection;
        matchCount.value = result.count;
      }
    } catch {
      // The edit already succeeded. A detached target must not turn it into a failed edit.
      if (ownsTarget()) selection.value = undefined;
    }
  }
  async function applyConfig(
    next: Config,
    record: boolean,
    group: string | undefined,
    ownsPage: () => boolean,
    persist?: () => Promise<void>,
  ) {
    if (!ownsPage() || busy.value) return false;
    const ownsTarget = captureOwner("target");
    busy.value = true;
    error.value = "";
    try {
      next = configSchema.parse(clone(next));
      const applied = await request("request", { type: "apply", config: next });
      if (!ownsPage()) return false;
      if (persist) {
        try {
          await persist();
        } catch (error) {
          // A combined backup advances page history only after its library write.
          if (ownsPage())
            await request("request", {
              type: "apply",
              config: clone(config.value),
            });
          throw error;
        }
        if (!ownsPage()) return false;
      }
      if (applied !== true) {
        next = applied.config;
        frames.value = applied.frames;
        restorationWarnings.value = applied.warnings;
      }
      const removedSelected =
        !!rule.value &&
        !next.rules.some((item) => item.id === selectedId.value);
      config.value = next;
      if (record) history.record(next, group);
      status.value = "Applied to the website.";
      await refreshSelection(ownsTarget, removedSelected);
      return ownsPage();
    } catch (e) {
      if (ownsPage() && ownsTarget()) {
        report(e);
        editorGeneration.value++;
      }
      return false;
    } finally {
      if (ownsPage()) busy.value = false;
    }
  }
  let selectorWork = Promise.resolve();
  let selectorGeneration = 0;
  function updateTargets(nextTargets: Target[], pickedFrame?: number) {
    if (!connected.value) return selectorWork;
    editorGeneration.value++;
    const generation = ++selectorGeneration;
    const ownsTarget = captureOwner("target");
    const owner = selectedId.value;
    const draft = selector.value;
    const targetFrame = pickedFrame ?? rule.value?.frameId ?? frameId.value;
    selectorWork = selectorWork
      .catch(() => {})
      .then(async () => {
        if (
          !ownsTarget() ||
          generation !== selectorGeneration ||
          owner !== selectedId.value
        )
          return;
        selectorCommitting.value = true;
        targetingBusy.value = true;
        error.value = "";
        try {
          await configWork;
          if (!ownsTarget()) return;
          const nextRule = withTargets(
            rule.value ?? {
              ...newRule(""),
              frameId: targetFrame,
              frameUrl: targetFrame ? selection.value?.url : undefined,
            },
            clone(nextTargets),
          );
          if (pickedFrame !== undefined) {
            nextRule.frameId = pickedFrame;
            nextRule.frameUrl = pickedFrame ? selection.value?.url : undefined;
          }
          const editingRule = !!rule.value;
          if (!nextRule.selector && !editingRule) {
            await request("request", { type: "clear-selection" });
            if (!ownsTarget()) return;
            syncTargets([]);
            selection.value = undefined;
            matchCount.value = undefined;
            picking.value = false;
            status.value = "Targets cleared.";
            return;
          }
          // Validate readable selectors too, before touching the applied rule.
          configSchema.parse({ ...config.value, rules: [nextRule] });
          const result: { count: number; selection?: Inspection } =
            nextRule.selector
              ? await request(
                  "request",
                  { type: "inspect", selector: ruleQuery(nextRule) },
                  targetFrame,
                )
              : { count: 0 };
          if (!ownsTarget() || generation !== selectorGeneration) return;
          if (targetFrame && result.selection)
            nextRule.frameUrl = result.selection.url;
          const next = clone(config.value);
          if (editingRule) {
            next.rules[next.rules.findIndex((item) => item.id === owner)] =
              nextRule;
          } else next.rules.unshift(nextRule);
          if (!(await commit(next)) || !ownsTarget()) return;
          selectedId.value = nextRule.id;
          syncTargets(ruleTargets(nextRule), selector.value === draft);
          matchCount.value = nextRule.selector ? result.count : undefined;
          if (!editingRule || !nextRule.selector)
            selection.value = result.selection;
          picking.value = false;
          status.value = !nextRule.selector
            ? "Targets cleared from this rule. Add a selector or pick an element."
            : (!editingRule ? "Rule created. " : "") +
              (result.count
                ? `Target ready: ${result.count} ${result.count === 1 ? "element" : "elements"}.`
                : "No elements match. Check the selector.");
        } catch (e) {
          if (ownsTarget() && generation === selectorGeneration) report(e);
        } finally {
          if (ownsTarget() && generation === selectorGeneration) {
            selectorCommitting.value = false;
            targetingBusy.value = false;
          }
        }
      });
    return selectorWork;
  }
  function commitSelector(value: string) {
    const exact = targets.value.filter((target) => target.kind === "exact");
    if (!value.trim() && !exact.length) return clearTarget();
    return updateTargets([
      ...exact,
      ...splitSelectors(value).map((selector): Target => ({
        kind: "selector",
        selector,
      })),
    ]);
  }
  function getTargetElement(target: Target) {
    return request(
      "request",
      {
        type: "target-element",
        selector: targetQuery(target),
      },
      rule.value?.frameId ?? frameId.value,
    );
  }
  async function appendSelectors(value: string) {
    const ownsTarget = captureOwner("target");
    await selectorWork;
    if (!ownsTarget()) return;
    return updateTargets([
      ...targets.value,
      ...splitSelectors(value).map((selector): Target => ({
        kind: "selector",
        selector,
      })),
    ]);
  }
  async function removeExactTarget(handle?: string) {
    const ownsTarget = captureOwner("target");
    await selectorWork;
    if (!ownsTarget()) return;
    const next = targets.value.filter(
      (target) => target.kind !== "exact" || target.handle !== handle,
    );
    return next.length ? updateTargets(next) : clearTarget();
  }
  async function togglePick() {
    const ownsPage = captureOwner();
    const ownsTarget = captureOwner("target");
    await selectorWork;
    if (!ownsTarget()) return;
    const generation = ++pickRequestGeneration;
    const active = !picking.value;
    busy.value = true;
    try {
      picking.value = active;
      ownsPick = picking.value ? ownsTarget : undefined;
      await request("request", { type: "pick", active });
      if (
        !ownsTarget() ||
        generation !== pickRequestGeneration ||
        picking.value !== active
      )
        return;
      status.value = picking.value
        ? "Click an element on the website. Escape cancels."
        : "Picking cancelled.";
    } catch (e) {
      if (
        ownsTarget() &&
        generation === pickRequestGeneration &&
        picking.value === active
      ) {
        picking.value = false;
        report(e);
      }
    } finally {
      if (ownsPage() && generation === pickRequestGeneration)
        busy.value = false;
    }
  }
  const scopeSelector = computed(
    () =>
      rule.value?.selector ??
      targets.value.map((target) => target.selector).join(", "),
  );
  const scopeFrame = computed(() => rule.value?.frameId ?? frameId.value);
  const scopeQuery = computed(() =>
    rule.value ? ruleQuery(rule.value) : targetsQuery(targets.value),
  );
  watch(rule, (next, previous) => {
    if (next && !selectorCommitting.value) syncTargets(ruleTargets(next));
    else if (!next && previous) {
      // Undoing creation removes the target from the editor too. Retain its ID
      // so redo can restore the selected rule and its targets together.
      syncTargets([]);
      selection.value = undefined;
      matchCount.value = undefined;
    }
  });
  let countGeneration = 0;
  watch(
    [connected, scopeQuery, scopeFrame],
    ([ready, query, frame], _old, cleanup) => {
      const generation = ++countGeneration;
      const ownsPage = captureOwner();
      matchCount.value = undefined;
      if (!ready || !query) return;
      const timer = setTimeout(async () => {
        if (!ownsPage() || generation !== countGeneration) return;
        try {
          const result = await request(
            "request",
            { type: "inspect", selector: query, previewOnly: true },
            frame,
          );
          if (generation === countGeneration) matchCount.value = result.count;
        } catch {
          /* Selector commits and targeting changes report inspection errors. */
        }
      }, 100);
      cleanup(() => clearTimeout(timer));
    },
  );
  function draftRule() {
    return clone(
      rule.value ??
        withTargets(
          {
            ...newRule(""),
            frameId: frameId.value,
            frameUrl: frameId.value ? selection.value?.url : undefined,
          },
          targets.value,
        ),
    );
  }
  async function createRule() {
    const ownsPage = captureOwner();
    await selectorWork;
    if (!ownsPage() || controlsBusy.value) return;
    targetingBusy.value = true;
    error.value = "";
    try {
      await request("request", { type: "clear-selection" });
      if (!ownsPage()) return;
      picking.value = false;
      const created = {
        ...newRule(""),
        frameId: frameId.value,
        frameUrl: frameId.value ? selection.value?.url : undefined,
      };
      const next = clone(config.value);
      next.rules.unshift(created);
      if (!(await commit(next)) || !ownsPage()) return;
      editorGeneration.value++;
      selectedId.value = created.id;
      syncTargets([]);
      selection.value = undefined;
      selector.value = "";
      matchCount.value = undefined;
      status.value = "Blank rule created. Add a selector or pick an element.";
    } catch (e) {
      if (ownsPage()) report(e);
    } finally {
      if (ownsPage()) targetingBusy.value = false;
    }
  }
  let propertyWork: Promise<boolean> = Promise.resolve(false);
  function setProperties(
    patch: Partial<Record<Property, string | undefined>>,
    font?: FontFamily,
  ) {
    return queuePropertyEdit((ownsTarget) =>
      applyProperties(patch, font, ownsTarget),
    );
  }
  function queuePropertyEdit(
    edit: (ownsTarget: () => boolean) => Promise<boolean>,
  ) {
    const ownsPage = captureOwner();
    const ownsTarget = captureOwner("target");
    if (!ownsTarget()) return Promise.resolve(false);
    pendingProperties.value++;
    propertyWork = propertyWork
      .catch(() => false)
      .then(async () => {
        // A rule transaction may still be saving. Build this
        // patch from its committed configuration, rather than the old rule.
        await configWork;
        await selectorWork;
        return ownsTarget() ? edit(ownsTarget) : false;
      })
      .finally(() => {
        if (ownsPage()) pendingProperties.value--;
      });
    return propertyWork;
  }
  function editSelectedRules(edit: (rule: Rule) => void, group?: string) {
    const ids = [...selectedRuleIds.value];
    if (!ids.length) return Promise.resolve(false);
    return queuePropertyEdit(async (ownsTarget) => {
      try {
        const next = clone(config.value);
        for (const rule of next.rules) {
          if (ids.includes(rule.id)) edit(rule);
        }
        if (JSON.stringify(next) === JSON.stringify(config.value)) return false;
        return await commit(
          next,
          true,
          group ? `rules:${editorGeneration.value}:${group}` : undefined,
        );
      } catch (e) {
        if (ownsTarget()) report(e);
        return false;
      }
    });
  }
  function editSelectedTypography(
    change: TypographyChange,
    fontFor: (rule: Rule) => FontFamily | undefined,
  ) {
    return editSelectedRules(
      (rule) => {
        const font = fontFor(rule);
        applyTypographyToRule(rule, change, font);
        if (font) validateFontRule(rule, font);
      },
      change.value === undefined
        ? undefined
        : "axis" in change
          ? change.axis
          : change.property,
    );
  }
  async function applyProperties(
    patch: Partial<Record<Property, string | undefined>>,
    font?: FontFamily,
    ownsTarget = captureOwner("target"),
  ) {
    try {
      if (!scopeQuery.value)
        throw Error("Choose a target before changing typography.");
      const next = clone(config.value);
      const edit = draftRule();
      const props = edit.properties;
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "") delete props[key as Property];
        else (props as Record<string, string>)[key] = value;
      }
      propertiesSchema.parse(props);
      if (!font && Object.hasOwn(patch, "font-family")) {
        const first = props["font-family"]
          ?.split(",")[0]
          ?.trim()
          .replace(/^["']|["']$/g, "");
        if (first !== edit.font?.family) edit.font = undefined;
      }
      if (font)
        edit.font = {
          id: font.id,
          family: font.family,
          provider: font.provider,
        };
      const index = next.rules.findIndex((r) => r.id === edit.id);
      if (index < 0) next.rules.unshift(edit);
      else next.rules[index] = edit;
      selectedId.value = edit.id;
      return await commit(
        next,
        true,
        font || Object.values(patch).some((v) => v === undefined)
          ? undefined
          : edit.id + ":" + Object.keys(patch).join(","),
      );
    } catch (e) {
      if (ownsTarget()) report(e);
      return false;
    }
  }
  async function chooseFont(font: FontFamily) {
    const ownsTarget = captureOwner("target");
    const style = rule.value?.properties["font-style"] ?? "normal";
    const nextStyle = font.styles.includes(style)
      ? style
      : (font.styles[0] ?? "normal");
    const current = Number(
      rule.value?.properties["font-weight"] ??
        selection.value?.computed["font-weight"] ??
        400,
    );
    const weight = closestWeight(font, current, nextStyle);
    const applied = selectedRuleIds.value.length
      ? await editSelectedRules((rule) => applyFontToRule(rule, font))
      : await setProperties(
          {
            "font-family":
              font.provider === "system"
                ? `${font.family}`
                : `${quote(font.family)}, sans-serif`,
            "font-weight": String(weight),
            "font-style": nextStyle,
            "font-synthesis": "none",
            "font-variation-settings": undefined,
          },
          font,
        );
    if (applied && ownsTarget()) {
      try {
        await updateSettings({ type: "settings.recent", id: font.id });
      } catch (e) {
        if (ownsTarget()) report(e);
      }
      return ownsTarget();
    }
    return false;
  }
  async function editRule(
    id: string,
    action: "toggle" | "delete" | "duplicate" | "up" | "down" | "select",
  ) {
    const ownsPage = captureOwner();
    await selectorWork;
    if (!ownsPage()) return false;
    const next = clone(config.value),
      index = next.rules.findIndex((r) => r.id === id);
    const item = next.rules[index];
    if (!item) return;
    if (action === "select") {
      editorGeneration.value++;
      selectedId.value = id;
      syncTargets(ruleTargets(item));
      frameId.value = item.frameId;
      const ownsTarget = captureOwner("target");
      try {
        if (item.frameId !== 0 && !frames.value.includes(item.frameId)) {
          selection.value = undefined;
          matchCount.value = undefined;
          return;
        }
        if (!item.selector) {
          await request("request", { type: "clear-selection" });
          if (!ownsTarget()) return false;
          selection.value = undefined;
          matchCount.value = undefined;
          error.value = "";
          return;
        }
        const result = await request("request", {
          type: "inspect",
          selector: ruleQuery(item),
        });
        if (!ownsTarget()) return false;
        selection.value = result.selection;
        matchCount.value = result.count;
      } catch (e) {
        if (ownsTarget()) report(e);
      }
      return;
    }
    if (action === "toggle") item.enabled = !item.enabled;
    if (action === "delete") next.rules.splice(index, 1);
    if (action === "duplicate") {
      next.rules.splice(index + 1, 0, {
        ...clone(item),
        id: crypto.randomUUID(),
      });
    }
    if (action === "up" && index > 0) {
      next.rules.splice(index, 1);
      next.rules.splice(index - 1, 0, item);
    }
    if (action === "down" && index < next.rules.length - 1) {
      next.rules.splice(index, 1);
      next.rules.splice(index + 1, 0, item);
    }
    return commit(next);
  }
  async function reorderRule(
    id: string,
    targetId: string,
    position: "before" | "after",
  ) {
    const ownsPage = captureOwner();
    await selectorWork;
    await propertyWork;
    await configWork;
    if (!ownsPage() || controlsBusy.value || id === targetId) return;
    const next = clone(config.value);
    const from = next.rules.findIndex((item) => item.id === id);
    if (from < 0 || !next.rules.some((item) => item.id === targetId)) return;
    const [moved] = next.rules.splice(from, 1);
    if (!moved) return;
    const target = next.rules.findIndex((item) => item.id === targetId);
    next.rules.splice(target + (position === "after" ? 1 : 0), 0, moved);
    if (
      next.rules.every(
        (item, index) => item.id === config.value.rules[index]?.id,
      )
    )
      return;
    if (await commit(next))
      status.value = "Rule moved. Rules at the top take priority.";
  }
  async function deleteRules(ids: string[]) {
    const ownsPage = captureOwner();
    const removing = new Set(ids);
    await selectorWork;
    await propertyWork;
    await configWork;
    if (!ownsPage() || controlsBusy.value || picking.value) return false;
    const next = clone(config.value);
    next.rules = next.rules.filter((item) => !removing.has(item.id));
    if (next.rules.length === config.value.rules.length) return false;
    // One config transaction gives the entire batch one history entry. Keep
    // selectedId so Undo can restore the edited rule and its targets too.
    return commit(next);
  }
  async function undo() {
    const ownsPage = captureOwner();
    await selectorWork;
    await propertyWork;
    await configWork;
    if (!ownsPage()) return false;
    const next = history.peekUndo();
    if (next && (await commit(next, false))) {
      history.undo();
      return true;
    }
    return false;
  }
  async function redo() {
    const ownsPage = captureOwner();
    await selectorWork;
    await propertyWork;
    await configWork;
    if (!ownsPage()) return false;
    const next = history.peekRedo();
    if (next && (await commit(next, false))) {
      history.redo();
      return true;
    }
    return false;
  }
  async function presetSnapshot() {
    const ownsPage = captureOwner();
    await selectorWork;
    await propertyWork;
    await configWork;
    if (!ownsPage())
      throw Error("The active page changed. Try again on this page.");
    if (error.value) throw Error(error.value);
    return clone(config.value);
  }
  async function loadPreset(saved: Config) {
    const ownsPage = captureOwner();
    try {
      await presetSnapshot();
      if (!ownsPage()) return false;
      targetingBusy.value = true;
      const next = configSchema.parse({
        ...clone(saved),
        rules: saved.rules.map((rule) => ({
          ...clone(rule),
          id: crypto.randomUUID(),
          frameId: frameId.value,
          frameUrl: frameId.value ? selection.value?.url : undefined,
        })),
      });
      const warnings = new Set<string>();
      const config = await restoreFontshareFonts(next, warnings);
      if (!ownsPage()) return false;
      const restored = await request("request", {
        type: "restore",
        config,
      });
      if (!ownsPage() || !(await commit(restored.config))) return false;
      restorationWarnings.value = [...warnings, ...restored.warnings];
      await selectFirstRule();
      if (!ownsPage()) return false;
      status.value = "Preset applied";
      return true;
    } catch (e) {
      if (ownsPage()) report(e);
      return false;
    } finally {
      if (ownsPage()) targetingBusy.value = false;
    }
  }
  async function resetPage() {
    const ownsPage = captureOwner();
    try {
      await selectorWork;
      await propertyWork;
      await configWork;
      if (!ownsPage() || !(await commit(emptyConfig()))) return false;
      await request("request", { type: "clear-selection" });
      if (!ownsPage()) return false;
      newTarget();
      return true;
    } catch (e) {
      if (ownsPage()) report(e);
      return false;
    }
  }
  async function resetSite(origin: string | undefined) {
    const ownsPage = captureOwner();
    await selectorWork;
    await propertyWork;
    await configWork;
    if (!ownsPage())
      throw Error("The website changed. Open Clear site edits again.");
    await clearSite(origin);
  }
  function newTarget() {
    editorGeneration.value++;
    selectedId.value = "";
    syncTargets([]);
    selector.value = "";
    selection.value = undefined;
    matchCount.value = undefined;
  }
  async function selectFirstRule() {
    setSelectedRules([]);
    newTarget();
    const first = config.value.rules[0];
    if (first) await editRule(first.id, "select");
    else frameId.value = 0;
  }
  function clearTarget() {
    return updateTargets([]);
  }
  function onEvent(message: import("../core/messages").EditorEvent) {
    const data = message.data;
    if (data?.type === "selection") {
      // A picker started for an older page, frame or rule cannot edit this one.
      if (!picking.value || !ownsPick?.()) return;
      picking.value = false;
      ownsPick = undefined;
      const picked = data.selection;
      const targetFrame = rule.value?.frameId ?? frameId.value;
      if (targets.value.length && message.frameId !== targetFrame) {
        error.value =
          "These targets belong to another frame. Create a new rule to add this element.";
      } else {
        selection.value = picked;
        frameId.value = message.frameId;
        void updateTargets(
          [
            ...targets.value,
            { kind: "exact", selector: picked.selector, handle: picked.handle },
          ],
          message.frameId,
        );
      }
      for (const f of frames.value)
        if (f !== frameId.value)
          void chrome.tabs
            .sendMessage(
              tabId.value!,
              {
                channel: "fontzie-tab",
                frameId: f,
                request: { type: "pick", active: false },
              },
              { frameId: f },
            )
            .catch(() => {});
    }
    if (data?.type === "cancel") {
      if (!picking.value || !ownsPick?.()) return;
      picking.value = false;
      ownsPick = undefined;
      void request("request", { type: "pick", active: false }).catch(() => {});
    }
    if (
      data?.type === "matches" &&
      message.frameId === scopeFrame.value &&
      (!data.selector || data.selector === scopeQuery.value)
    )
      matchCount.value = data.count;
  }
  return {
    historyForMove() {
      if (documentToken && (canUndo.value || canRedo.value))
        return { documentToken, url: url.value, snapshot: history.snapshot() };
    },
    reconcileFontHistory(families: FontFamily[]) {
      history.reconcile((snapshot) => reconcileCustomFonts(snapshot, families));
    },
    syncCustomFontRules(families: FontFamily[]) {
      config.value = reconcileCustomFonts(config.value, families);
    },
    captureOwner,
    editorGeneration,
    targets,
    presetSnapshot,
    loadPreset,
    appendSelectors,
    getTargetElement,
    locatePicks: async (frame: number, handles: string[]) =>
      (await request("request", { type: "locate-picks", handles }, frame))
        .locations,
    removeExactTarget,
    config,
    settings,
    tabId,
    url,
    title,
    frames,
    listFrames,
    frameId,
    selection,
    selector,
    matchCount,
    scopeSelector,
    selectedRuleIds,
    selectedRules,
    setSelectedRules,
    editSelectedTypography,
    targetingBusy,
    selectorCommitting,
    createRule,
    rule,
    selectedId,
    connected,
    connectionIssue,
    siteOrigin,
    allowingSite,
    allSitesAllowed,
    changingAllSites,
    allSitesError,
    picking,
    busy: controlsBusy,
    error,
    restorationNotice,
    restorationWarnings,
    dismissRestorationNotice,
    status,
    canUndo,
    canRedo,
    changeSettings,
    updateSettings,
    connect,
    retry,
    allowSite,
    allowAllSites,
    commit,
    commitSelector,
    togglePick,
    setProperties,
    chooseFont,
    editRule,
    selectFirstRule,
    reorderRule,
    deleteRules,
    undo,
    redo,
    resetPage,
    resetSite,
    clearTarget,
    report,
  };
}
export type Fontzie = ReturnType<typeof useFontzie>;
