import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref, toRaw, type EffectScope } from "vue";
import {
  emptyConfig,
  newRule,
  defaultSettings,
  type Config,
  type Inspection,
} from "../../core/schema";
import { useFontzie } from "../../composables/useFontzie";
import { useTypographyExport } from "../../composables/useTypographyExport";
import { usePresets } from "../../composables/usePresets";
import { useBackup } from "../../composables/useBackup";
import { useEditorPosition } from "../../composables/useEditorPosition";
import { engineCSS } from "../../core/css";
import { download } from "../../core/download";
import { findFont } from "../../providers/catalog";

const { mounted } = vi.hoisted(() => ({ mounted: [] as (() => unknown)[] }));
vi.mock("vue", async () => ({
  ...(await vi.importActual("vue")),
  onMounted: (callback: () => unknown) => mounted.push(callback),
  onUnmounted: () => {},
}));
vi.mock("../../composables/useAppearance", () => ({
  useAppearance: () => ({
    settings: ref(defaultSettings()),
    changeSettings: vi.fn(),
    updateSettings: vi.fn(),
    initialize: vi.fn(),
  }),
}));
vi.mock("../../core/download", () => ({ download: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const sendMessage = vi.fn();
let scope: EffectScope;
const makeConfig = (selector: string, size: number): Config => ({
  ...emptyConfig(),
  rules: [{ ...newRule(selector), properties: { "font-size": `${size}px` } }],
});
const tabConfigs = new Map<number, Config>();
function inspection(id: number, selector?: string): Inspection {
  const rule = tabConfigs
    .get(id)!
    .rules.find((r) => !selector || r.selector === selector)!;
  const size = parseFloat(rule?.properties["font-size"] ?? "20px");
  return {
    handle: `target-${id}-${(selector ?? rule.selector).replace(/[^a-zA-Z0-9-]/g, "")}`,
    selector: selector ?? rule.selector,
    tag: "H1",
    classes: [],
    identity: "Heading",
    width: 200,
    height: 100,
    frameId: 0,
    url: `https://site${id}.test/`,
    computed: { "font-size": `${size}px`, "line-height": `${size * 1.05}px` },
  };
}
const state = (id: number) => ({
  config: tabConfigs.get(id),
  selection: tabConfigs.get(id)!.rules.some((rule) => rule.selector)
    ? inspection(id)
    : undefined,
  url: `https://site${id}.test/`,
  title: `Tab ${id}`,
  frameId: 0,
  frames: [0],
});
const events = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
const respond = async (message: {
  type: string;
  tabId: number;
  request?: {
    type: string;
    config?: Config;
    selector?: string;
    previewOnly?: boolean;
  };
}) => {
  if (message.type === "connect")
    return { ok: true, data: state(message.tabId) };
  if (message.request?.type === "apply")
    tabConfigs.set(message.tabId, message.request.config!);
  return {
    ok: true,
    data:
      message.request?.type === "inspect"
        ? {
            count: 1,
            ...(message.request.previewOnly
              ? {}
              : {
                  selection: inspection(
                    message.tabId,
                    message.request.selector,
                  ),
                }),
          }
        : true,
  };
};
beforeEach(() => {
  mounted.length = 0;
  tabConfigs.clear();
  tabConfigs.set(1, makeConfig("h1", 20));
  tabConfigs.set(2, makeConfig("p", 15));
  sendMessage.mockReset().mockImplementation(respond);
  vi.stubGlobal("location", { search: "?tab=1" });
  vi.stubGlobal("chrome", {
    runtime: { sendMessage, onMessage: events() },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(true),
      onActivated: events(),
      onUpdated: events(),
    },
    windows: { getCurrent: vi.fn().mockResolvedValue({ id: 1 }) },
    permissions: {
      contains: vi.fn().mockResolvedValue(false),
      onAdded: events(),
      onRemoved: events(),
    },
    storage: { onChanged: events() },
  });
  scope = effectScope();
});
afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
});
const setup = () => scope.run(useFontzie)!;

it("keeps the active targets and undo/redo after deleting their custom font", async () => {
  const app = setup();
  await app.connect(1);
  const id = app.selectedId.value;
  const target = app.selection.value;
  const saved = makeConfig("h1", 20);
  saved.rules[0]!.id = id;
  saved.rules[0]!.font = {
    id: "custom:Example",
    family: "Example",
    provider: "custom",
  };
  saved.rules[0]!.properties["font-family"] = "Example";
  await app.commit(saved);
  await app.setProperties({ "font-size": "31px" });
  await app.setProperties({ "letter-spacing": "3px" });
  await app.undo();
  app.setSelectedRules([id]);
  app.reconcileFontHistory([]);
  app.syncCustomFontRules([]);
  expect(app.selectedId.value).toBe(id);
  expect(app.selectedRuleIds.value).toEqual([id]);
  expect(app.selection.value?.selector).toBe(target?.selector);
  expect(app.rule.value?.properties).toEqual({ "font-size": "31px" });
  expect(app.rule.value?.font).toBeUndefined();
  expect(await app.redo()).toBe(true);
  expect(app.rule.value?.properties).toEqual({
    "font-size": "31px",
    "letter-spacing": "3px",
  });
  expect(await app.undo()).toBe(true);
  expect(await app.undo()).toBe(true);
  expect(app.rule.value?.properties).toEqual({ "font-size": "20px" });
  expect(app.canUndo.value).toBe(false);
});

it("summarizes only currently unresolved paused rules and clears the notice after repair or deletion", async () => {
  const first = { ...newRule("div > span > em", "exact"), enabled: false };
  const second = { ...newRule(".old-target", "exact"), enabled: false };
  const hidden = { ...newRule("p"), enabled: false };
  tabConfigs.set(1, { ...emptyConfig(), rules: [first, second, hidden] });
  sendMessage.mockImplementationOnce(async () => ({
    ok: true,
    data: {
      ...state(1),
      restorationWarnings: ["Raw warning with div > span > em"],
    },
  }));
  const app = setup();
  await app.connect(1);
  expect(app.restorationNotice.value).toBe(
    "2 rules were paused because their saved targets couldn’t be identified. Select each rule and pick its target again.",
  );
  // A repaired exact pick has a current handle, even if kept disabled.
  expect(
    await app.commit({
      ...emptyConfig(),
      rules: [{ ...first, handle: "repaired-target" }, second, hidden],
    }),
  ).toBe(true);
  expect(app.restorationNotice.value).toBe(
    "1 rule was paused because its saved target couldn’t be identified. Select that rule and pick its target again.",
  );
  expect(await app.commit(emptyConfig())).toBe(true);
  expect(app.restorationNotice.value).toBe("");
});

it.each([{ rules: [] }, { rules: [newRule("")] }])(
  "hides stale restoration warnings when there are no affected rules: %j",
  async ({ rules }) => {
    tabConfigs.set(1, { ...emptyConfig(), rules });
    sendMessage.mockImplementationOnce(async () => ({
      ok: true,
      data: { ...state(1), restorationWarnings: ["Old selector warning"] },
    }));
    const app = setup();
    await app.connect(1);
    expect(app.connected.value).toBe(true);
    expect(app.restorationNotice.value).toBe("");
  },
);

it("allows dismissing an unresolved restoration notice without altering rules", async () => {
  const paused = {
    ...newRule(".frame-target", "exact"),
    enabled: false,
    frameId: 2147483647,
  };
  tabConfigs.set(1, { ...emptyConfig(), rules: [paused] });
  sendMessage.mockImplementationOnce(async () => ({
    ok: true,
    data: { ...state(1), restorationWarnings: ["Missing frame"] },
  }));
  const app = setup();
  await app.connect(1);
  expect(app.restorationNotice.value).toContain("1 rule was paused");
  app.dismissRestorationNotice();
  expect(app.restorationNotice.value).toBe("");
  expect(app.config.value.rules).toEqual([paused]);
});

it("does not remember the same active rule again for ordinary typography edits", async () => {
  const app = setup();
  await mounted[0]!();
  await (await import("vue")).nextTick();
  sendMessage.mockClear();
  await app.setProperties({ "font-size": "24px" });
  await (await import("vue")).nextTick();
  expect(
    sendMessage.mock.calls.filter(
      ([message]) => message.type === "select-rule",
    ),
  ).toHaveLength(0);
  expect(
    sendMessage.mock.calls.filter(
      ([message]) => message.request?.type === "apply",
    ),
  ).toHaveLength(1);
  expect(
    sendMessage.mock.calls.find(
      ([message]) => message.request?.type === "inspect",
    )?.[0].request,
  ).toMatchObject({ selector: "h1", reuseRoots: true });
});

it.each([false, true])(
  "discards Undo and Redo after clearing the site (from another editor: %s)",
  async (anotherEditor) => {
    const app = setup();
    await mounted[0]!();
    await app.commitSelector("p");
    await app.commitSelector("h2");
    await app.undo();
    expect(app.canUndo.value).toBe(true);
    expect(app.canRedo.value).toBe(true);

    if (anotherEditor) {
      tabConfigs.set(1, emptyConfig());
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock
        .calls[0]![0];
      listener(
        { "tab:1": { newValue: { siteClearId: "cleared" } } },
        "session",
      );
      await vi.waitFor(() => expect(app.connected.value).toBe(true));
    } else {
      sendMessage.mockImplementation(async (message) => {
        if (message.type === "clear-site") tabConfigs.set(1, emptyConfig());
        return respond(message);
      });
      await app.resetSite("https://site1.test");
    }
    expect(app.config.value.rules).toEqual([]);
    expect(await app.undo()).toBe(false);
    expect(await app.redo()).toBe(false);

    await app.commitSelector("a");
    expect(await app.undo()).toBe(true);
    expect(app.config.value.rules).toEqual([]);
  },
);

async function emptyEditor() {
  tabConfigs.set(1, emptyConfig());
  const app = setup();
  await mounted[0]!();
  return app;
}
function pickerEvent(type: "selection" | "cancel", frameId = 0) {
  const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock
    .calls[0]![0];
  listener(
    {
      channel: "fontzie-event",
      tabId: 1,
      frameId,
      data:
        type === "selection"
          ? {
              type,
              selection: {
                ...inspection(1, "#hero"),
                frameId,
                ...(frameId ? { url: "https://embed.test/frame.html" } : {}),
              },
            }
          : { type },
    },
    {},
    () => {},
  );
}

it.each(["h2", "h1, h2, h3, h4, h5, h6", "p", "a", "body, body *", ".intro"])(
  "creates one selected zero-change rule for the first target %s",
  async (selector) => {
    const app = await emptyEditor();
    if (selector === "h2") {
      app.selector.value = selector;
      expect(app.config.value.rules).toHaveLength(0);
      await app.commitSelector(selector);
    } else await app.appendSelectors(selector);
    expect(app.config.value.rules).toHaveLength(1);
    const id = app.rule.value!.id;
    expect(app.selectedId.value).toBe(id);
    expect(app.rule.value).toMatchObject({ selector, properties: {} });
    expect(tabConfigs.get(1)!.rules[0]).toEqual(app.rule.value);
    await app.appendSelectors(".another");
    await app.setProperties({ "font-size": "28px" });
    expect(app.config.value.rules).toHaveLength(1);
    expect(app.rule.value!.id).toBe(id);
    expect(app.rule.value!.properties["font-size"]).toBe("28px");
  },
);

it("creates an exact picked rule before styling and preserves its handle", async () => {
  const app = await emptyEditor();
  await app.togglePick();
  pickerEvent("selection");
  await app.presetSnapshot();
  expect(app.config.value.rules).toHaveLength(1);
  expect(app.rule.value?.targets).toEqual([
    { kind: "exact", selector: "#hero", handle: "target-1-hero" },
  ]);
  const id = app.selectedId.value;
  expect(app.rule.value?.properties).toEqual({});
  await app.setProperties({ "font-size": "28px" });
  expect(app.config.value.rules).toHaveLength(1);
  expect(app.selectedId.value).toBe(id);
});

it.each([false, true])(
  "chooses a picked element's page automatically (blank rule: %s)",
  async (blank) => {
    const app = await emptyEditor();
    if (blank) await app.createRule();
    const id = app.selectedId.value;
    sendMessage.mockImplementation(async (message) =>
      message.request?.type === "inspect" && !message.request.previewOnly
        ? {
            ok: true,
            data: {
              count: 1,
              selection: {
                ...inspection(1, "#hero"),
                frameId: 7,
                url: "https://embed.test/frame.html",
              },
            },
          }
        : respond(message),
    );
    await app.togglePick();
    pickerEvent("selection", 7);
    await app.presetSnapshot();
    expect(app.config.value.rules).toHaveLength(1);
    expect(app.rule.value).toMatchObject({
      frameId: 7,
      frameUrl: "https://embed.test/frame.html",
      targets: [{ kind: "exact", selector: "#hero", handle: "target-1-hero" }],
    });
    if (blank) expect(app.selectedId.value).toBe(id);
    expect(
      sendMessage.mock.calls.find(
        ([message]) => message.request?.type === "inspect",
      )?.[0].frameId,
    ).toBe(7);
    expect(tabConfigs.get(1)!.rules[0]).toEqual(app.rule.value);
  },
);

it.each([false, true])(
  "saves the inspected frame URL when targeting an iframe (blank rule: %s)",
  async (blank) => {
    const app = await emptyEditor();
    app.frameId.value = 7;
    if (blank) await app.createRule();
    sendMessage.mockImplementation(async (message) =>
      message.request?.type === "inspect" && !message.request.previewOnly
        ? {
            ok: true,
            data: {
              count: 1,
              selection: {
                ...inspection(1, "#frame-heading"),
                frameId: 7,
                url: "https://embed.test/frame.html",
              },
            },
          }
        : respond(message),
    );
    await app.commitSelector("#frame-heading");
    expect(tabConfigs.get(1)!.rules[0]).toMatchObject({
      frameId: 7,
      frameUrl: "https://embed.test/frame.html",
      selector: "#frame-heading",
    });
  },
);

it("reuses an explicit blank rule and deliberately starts another with New", async () => {
  const app = await emptyEditor();
  await app.createRule();
  const first = app.selectedId.value;
  await app.commitSelector("p");
  expect(app.config.value.rules).toHaveLength(1);
  expect(app.rule.value?.id).toBe(first);
  await app.createRule();
  const second = app.selectedId.value;
  await app.appendSelectors("a");
  expect(app.config.value.rules).toHaveLength(2);
  expect(second).not.toBe(first);
  expect(app.rule.value).toMatchObject({ id: second, selector: "a" });
  expect(app.config.value.rules[1]).toMatchObject({ id: first, selector: "p" });
});

it("keeps a typography edit queued behind first-target creation on the same rule", async () => {
  const app = await emptyEditor();
  const pending = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => pending.promise);
  const targeting = app.commitSelector("p");
  await vi.waitFor(() => expect(app.selectorCommitting.value).toBe(true));
  const styling = app.setProperties({ "font-size": "28px" });
  pending.resolve({
    ok: true,
    data: { count: 1, selection: inspection(1, "p") },
  });
  await targeting;
  expect(await styling).toBe(true);
  expect(app.config.value.rules).toHaveLength(1);
  expect(app.rule.value).toMatchObject({
    selector: "p",
    properties: { "font-size": "28px" },
  });
});

it("uses only the latest first selector when an older inspection finishes late", async () => {
  const app = await emptyEditor();
  const pending = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => pending.promise);
  const old = app.commitSelector("p");
  await vi.waitFor(() => expect(app.selectorCommitting.value).toBe(true));
  const latest = app.commitSelector("a");
  pending.resolve({
    ok: true,
    data: { count: 1, selection: inspection(1, "p") },
  });
  await old;
  await latest;
  expect(app.config.value.rules).toHaveLength(1);
  expect(app.rule.value).toMatchObject({ selector: "a", properties: {} });
});

it("saves valid selectors with no matches and retains the feedback", async () => {
  const app = await emptyEditor();
  sendMessage.mockImplementation(async (message) =>
    message.request?.type === "inspect"
      ? { ok: true, data: { count: 0 } }
      : respond(message),
  );
  await app.commitSelector(".not-here-yet");
  expect(app.rule.value).toMatchObject({
    selector: ".not-here-yet",
    properties: {},
  });
  await vi.waitFor(() => expect(app.matchCount.value).toBe(0));
  expect(app.status.value).toContain("No elements match. Check the selector.");
});

it.each(["inspect", "apply"])(
  "does not create a rule when the first target's %s fails",
  async (type) => {
    const app = await emptyEditor();
    sendMessage.mockImplementation(async (message) =>
      message.request?.type === type
        ? { ok: false, error: "Target failed" }
        : respond(message),
    );
    await app.commitSelector(type === "inspect" ? "[" : "p");
    expect(app.config.value.rules).toHaveLength(0);
    expect(app.selectedId.value).toBe("");
    expect(app.canUndo.value).toBe(false);
    expect(app.error.value).toBe("Target failed");
  },
);

it("does not create rules for empty, uncommitted or cancelled targets", async () => {
  const app = await emptyEditor();
  app.selector.value = "p";
  expect(app.config.value.rules).toHaveLength(0);
  await app.commitSelector(" ");
  await app.togglePick();
  pickerEvent("cancel");
  pickerEvent("selection");
  await app.presetSnapshot();
  expect(app.config.value.rules).toHaveLength(0);
});

it("allows a pending picker start to be cancelled without a stale failure resetting it", async () => {
  const app = await emptyEditor();
  const pending = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => pending.promise);
  const starting = app.togglePick();
  await vi.waitFor(() => expect(app.picking.value).toBe(true));
  await app.togglePick();
  expect(app.picking.value).toBe(false);
  pending.resolve({ ok: false, error: "Obsolete start failed" });
  await starting;
  expect(app.error.value).toBe("");
  expect(app.busy.value).toBe(false);
  expect(app.config.value.rules).toHaveLength(0);
});

it.each(["float", "dock", "close"] as const)(
  "cancels picking before the editor action %s",
  async (action) => {
    const app = await emptyEditor();
    const position = scope.run(() => useEditorPosition(app))!;
    await app.togglePick();
    sendMessage.mockClear();
    await position.editorAction(action);
    expect(app.picking.value).toBe(false);
    expect(sendMessage.mock.calls.map(([message]) => message)).toEqual([
      expect.objectContaining({ request: { type: "pick", active: false } }),
      { channel: "fontzie-editor", action, tabId: 1 },
    ]);
  },
);

it("cancels picking before minimizing the floating editor", async () => {
  vi.stubGlobal("location", { search: "?tab=1&floating=1", hash: "#token" });
  const postMessage = vi.fn();
  vi.stubGlobal("window", { parent: { postMessage } });
  const app = await emptyEditor();
  const position = scope.run(() => useEditorPosition(app))!;
  await app.togglePick();
  await position.minimizeFloating();
  expect(app.picking.value).toBe(false);
  expect(position.floatingMinimized.value).toBe(true);
  expect(postMessage).toHaveBeenCalledWith(
    {
      channel: "fontzie-floating-ui",
      token: "token",
      type: "minimize",
      value: true,
    },
    "*",
  );
});

it("stops the website picker when the editor document closes", async () => {
  vi.stubGlobal("window", new EventTarget());
  const app = await emptyEditor();
  await mounted[1]!();
  await app.togglePick();
  sendMessage.mockClear();
  window.dispatchEvent(new Event("pagehide"));
  expect(app.picking.value).toBe(false);
  expect(sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({ request: { type: "pick", active: false } }),
  );
});

it.each(["page", "frame"])(
  "discards the first target's inspection after its %s changes",
  async (scope) => {
    const app = await emptyEditor();
    const pending = deferred<unknown>();
    sendMessage.mockImplementationOnce(() => pending.promise);
    const updating = app.commitSelector("p");
    await vi.waitFor(() => expect(app.targetingBusy.value).toBe(true));
    if (scope === "page") await app.connect(2);
    else app.frameId.value = 3;
    pending.resolve({
      ok: true,
      data: { count: 1, selection: inspection(1, "p") },
    });
    await updating;
    expect(tabConfigs.get(1)!.rules).toHaveLength(0);
    expect(
      sendMessage.mock.calls.some(([m]) => m.request?.type === "apply"),
    ).toBe(false);
  },
);

it("does not attach an old picker event to a newer blank rule", async () => {
  const app = await emptyEditor();
  await app.togglePick();
  await app.createRule();
  const id = app.selectedId.value;
  pickerEvent("selection");
  await app.presetSnapshot();
  expect(app.config.value.rules).toHaveLength(1);
  expect(app.rule.value).toMatchObject({ id, selector: "", properties: {} });
});

it("undoes, redoes and reconnects a saved zero-change rule", async () => {
  const app = await emptyEditor();
  await app.commitSelector("p");
  const saved = structuredClone(tabConfigs.get(1)!);
  expect(await app.undo()).toBe(true);
  expect(app.config.value.rules).toHaveLength(0);
  expect(app.targets.value).toEqual([]);
  expect(app.selector.value).toBe("");
  expect(await app.redo()).toBe(true);
  expect(app.config.value).toEqual(saved);
  expect(app.targets.value).toEqual([{ kind: "selector", selector: "p" }]);
  expect(app.rule.value?.properties).toEqual({});
  await app.connect(1);
  expect(app.config.value).toEqual(saved);
  expect(app.rule.value?.id).toBe(saved.rules[0]!.id);
});

it("ignores an old tab's apply result and drops its queued property edits", async () => {
  const app = setup();
  await app.connect(1);
  const pending = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => pending.promise);
  const first = app.setProperties({ "font-size": "40px" });
  const queued = app.setProperties({ "letter-spacing": "2px" });
  await vi.waitFor(() =>
    expect(
      sendMessage.mock.calls.some(([m]) => m.request?.type === "apply"),
    ).toBe(true),
  );
  await app.connect(2);
  pending.resolve({ ok: true, data: true });
  expect(await first).toBe(false);
  expect(await queued).toBe(false);
  expect(app.tabId.value).toBe(2);
  expect(app.config.value.rules[0]!.selector).toBe("p");
  expect(app.canUndo.value).toBe(false);
  expect(app.busy.value).toBe(false);
  expect(
    sendMessage.mock.calls.some(
      ([m]) => m.tabId === 2 && m.request?.type === "apply",
    ),
  ).toBe(false);
});

it("does not let an old failure clear a newer connection's busy state or error", async () => {
  const app = setup();
  await app.connect(1);
  const oldApply = deferred<unknown>();
  const newConnection = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => oldApply.promise);
  const applying = app.commit(makeConfig("h1", 40));
  sendMessage.mockImplementationOnce(() => newConnection.promise);
  const connecting = app.connect(2);
  oldApply.reject(new Error("Old page failed"));
  expect(await applying).toBe(false);
  expect(app.busy.value).toBe(true);
  expect(app.error.value).toBe("");
  newConnection.resolve({ ok: true, data: state(2) });
  await connecting;
  expect(app.busy.value).toBe(false);
});

it("lets a reconnected document edit without waiting for the previous document", async () => {
  const app = setup();
  await app.connect(1);
  const pending = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => pending.promise);
  const oldEdit = app.commit(makeConfig("h1", 40));
  tabConfigs.set(1, makeConfig("p", 18));
  await app.connect(1);
  expect(await app.setProperties({ "font-size": "32px" })).toBe(true);
  pending.resolve({ ok: true, data: true });
  expect(await oldEdit).toBe(false);
  expect(app.config.value.rules[0]!.selector).toBe("p");
  expect(app.config.value.rules[0]!.properties["font-size"]).toBe("32px");
  expect(app.busy.value).toBe(false);
});

it("applies a font to checked visible and hidden rules as one undoable operation", async () => {
  const font = findFont("system:serif");
  if (!font) throw Error("Missing system serif font");
  tabConfigs.set(1, {
    ...emptyConfig(),
    rules: [
      {
        ...newRule("h1"),
        properties: {
          "font-weight": "700",
          "font-style": "italic",
          "font-size": "32px",
        },
      },
      {
        ...newRule("p"),
        enabled: false,
        properties: {
          "font-weight": "400",
          "font-style": "normal",
          "letter-spacing": "2px",
        },
      },
    ],
  });
  const app = setup();
  await app.connect(1);
  const original = structuredClone(toRaw(app.config.value));
  const selected = app.selectedId.value;
  app.setSelectedRules(original.rules.map((rule) => rule.id));
  sendMessage.mockClear();
  expect(await app.chooseFont(font)).toBe(true);
  const applied = structuredClone(toRaw(app.config.value));
  expect(
    sendMessage.mock.calls.filter(([m]) => m.request?.type === "apply"),
  ).toHaveLength(1);
  expect(applied.rules.map((rule) => rule.font?.id)).toEqual([
    font.id,
    font.id,
  ]);
  expect(applied.rules.map((rule) => rule.properties["font-weight"])).toEqual([
    "700",
    "400",
  ]);
  expect(applied.rules.map((rule) => rule.properties["font-style"])).toEqual([
    "italic",
    "normal",
  ]);
  expect(applied.rules[1]!.enabled).toBe(false);
  expect(app.selectedId.value).toBe(selected);
  expect(await app.undo()).toBe(true);
  expect(app.config.value).toEqual(original);
  expect(tabConfigs.get(1)).toEqual(original);
  expect(app.canUndo.value).toBe(false);
  expect(await app.redo()).toBe(true);
  expect(app.config.value).toEqual(applied);
  expect(tabConfigs.get(1)).toEqual(applied);
});

it("keeps all rules and history intact when a batch font edit fails", async () => {
  const font = findFont("system:serif");
  if (!font) throw Error("Missing system serif font");
  tabConfigs.get(1)!.rules.push({ ...newRule("p"), enabled: false });
  const app = setup();
  await app.connect(1);
  const original = structuredClone(toRaw(app.config.value));
  app.setSelectedRules(original.rules.map((rule) => rule.id));
  sendMessage.mockRejectedValueOnce(new Error("Font delivery failed"));
  expect(await app.chooseFont(font)).toBe(false);
  expect(app.config.value).toEqual(original);
  expect(tabConfigs.get(1)).toEqual(original);
  expect(app.canUndo.value).toBe(false);
  expect(app.error.value).toBe("Font delivery failed");
});

it("edits one axis on checked rules in one undo and preserves each rule's other axes", async () => {
  const original: Config = {
    ...emptyConfig(),
    rules: [
      {
        ...newRule("h1"),
        properties: {
          "font-size": "32px",
          "font-variation-settings": '"opsz" 18, "GRAD" 10',
        },
      },
      {
        ...newRule("p"),
        enabled: false,
        properties: {
          "font-size": "20px",
          "font-variation-settings": '"opsz" 24, "GRAD" -15',
        },
      },
      { ...newRule("h2"), properties: { "font-size": "28px" } },
    ],
  };
  tabConfigs.set(1, original);
  const app = setup();
  await app.connect(1);
  app.setSelectedRules(original.rules.slice(0, 2).map((rule) => rule.id));
  sendMessage.mockClear();
  expect(
    await app.editSelectedTypography(
      { axis: "opsz", value: 30 },
      () => undefined,
    ),
  ).toBe(true);
  expect(app.config.value.rules.map((rule) => rule.properties)).toEqual([
    {
      "font-size": "32px",
      "font-optical-sizing": "none",
      "font-variation-settings": '"opsz" 30, "GRAD" 10',
    },
    {
      "font-size": "20px",
      "font-optical-sizing": "none",
      "font-variation-settings": '"opsz" 30, "GRAD" -15',
    },
    original.rules[2]!.properties,
  ]);
  expect(
    sendMessage.mock.calls.filter(([m]) => m.request?.type === "apply"),
  ).toHaveLength(1);
  expect(await app.undo()).toBe(true);
  expect(app.config.value).toEqual(original);
  expect(app.canUndo.value).toBe(false);
});

it("deletes specific visible, hidden and untargeted rules in one undoable edit", async () => {
  const original: Config = {
    ...emptyConfig(),
    rules: [
      { ...newRule("h1"), properties: { "font-size": "40px" } },
      { ...newRule("p"), enabled: false, properties: { "font-size": "16px" } },
      { ...newRule(""), properties: { "letter-spacing": "1px" } },
      { ...newRule("a"), properties: { "font-size": "18px" } },
    ],
  };
  tabConfigs.set(1, structuredClone(original));
  const app = setup();
  await app.connect(1);
  const edited = app.selectedId.value;
  sendMessage.mockClear();
  expect(
    await app.deleteRules(original.rules.slice(0, 3).map((rule) => rule.id)),
  ).toBe(true);
  expect(app.config.value.rules).toEqual([original.rules[3]]);
  expect(engineCSS(tabConfigs.get(1)!, 0)).not.toContain("40px");
  expect(app.targets.value).toEqual([]);
  expect(app.selection.value).toBeUndefined();
  expect(
    sendMessage.mock.calls.filter(
      ([message]) => message.request?.type === "apply",
    ),
  ).toHaveLength(1);
  expect(await app.undo()).toBe(true);
  expect(app.config.value).toEqual(original);
  expect(app.selectedId.value).toBe(edited);
  expect(app.rule.value?.selector).toBe("h1");
  expect(app.targets.value).toEqual([{ kind: "selector", selector: "h1" }]);
  expect(app.canUndo.value).toBe(false);
  expect(await app.redo()).toBe(true);
  expect(app.config.value.rules).toEqual([original.rules[3]]);
});

it("deletes every rule and restores the edited rule with one Undo", async () => {
  const app = setup();
  await app.connect(1);
  const original = structuredClone(toRaw(app.config.value));
  const edited = app.selectedId.value;
  expect(await app.deleteRules(original.rules.map((rule) => rule.id))).toBe(
    true,
  );
  expect(app.config.value.rules).toEqual([]);
  expect(app.targets.value).toEqual([]);
  expect(app.selector.value).toBe("");
  expect(app.selection.value).toBeUndefined();
  expect(engineCSS(tabConfigs.get(1)!, 0)).toBe("");
  expect(await app.undo()).toBe(true);
  expect(app.config.value).toEqual(original);
  expect(app.selectedId.value).toBe(edited);
  expect(app.rule.value?.selector).toBe("h1");
});

it("preserves applied rules and history when batch deletion fails", async () => {
  const app = setup();
  await app.connect(1);
  const original = structuredClone(toRaw(app.config.value));
  sendMessage.mockImplementation(async (message) =>
    message.request?.type === "apply"
      ? { ok: false, error: "Could not delete the rules." }
      : respond(message),
  );
  expect(await app.deleteRules(original.rules.map((rule) => rule.id))).toBe(
    false,
  );
  expect(app.config.value).toEqual(original);
  expect(app.rule.value?.selector).toBe("h1");
  expect(app.canUndo.value).toBe(false);
  expect(app.error.value).toBe("Could not delete the rules.");
  sendMessage.mockImplementation(respond);
  expect(await app.deleteRules(original.rules.map((rule) => rule.id))).toBe(
    true,
  );
});

it("ignores absent IDs and does not record an empty deletion", async () => {
  const app = setup();
  await app.connect(1);
  sendMessage.mockClear();
  expect(await app.deleteRules([])).toBe(false);
  expect(await app.deleteRules(["missing"])).toBe(false);
  expect(app.canUndo.value).toBe(false);
  expect(sendMessage).not.toHaveBeenCalled();
  const id = app.config.value.rules[0]!.id;
  expect(await app.deleteRules([id, id, "missing"])).toBe(true);
  expect(app.config.value.rules).toEqual([]);
});

it("waits for pending typography and abandons deletion after a page change", async () => {
  const app = setup();
  await app.connect(1);
  const id = app.selectedId.value;
  const pending = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => pending.promise);
  const editing = app.setProperties({ "font-size": "36px" });
  await vi.waitFor(() =>
    expect(
      sendMessage.mock.calls.some(
        ([message]) => message.request?.type === "apply",
      ),
    ).toBe(true),
  );
  const deleting = app.deleteRules([id]);
  await app.connect(2);
  const current = structuredClone(toRaw(app.config.value));
  pending.resolve({ ok: true, data: true });
  await editing;
  expect(await deleting).toBe(false);
  expect(app.config.value).toEqual(current);
  expect(app.config.value.rules[0]?.selector).toBe("p");
  expect(app.canUndo.value).toBe(false);
});

it("keeps the latest queued typography in the snapshot restored after deletion", async () => {
  const app = setup();
  await app.connect(1);
  const id = app.selectedId.value;
  const pending = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => pending.promise);
  const editing = app.setProperties({ "font-size": "36px" });
  await vi.waitFor(() =>
    expect(
      sendMessage.mock.calls.some(
        ([message]) => message.request?.type === "apply",
      ),
    ).toBe(true),
  );
  const deleting = app.deleteRules([id]);
  expect(app.config.value.rules).toHaveLength(1);
  pending.resolve({ ok: true, data: true });
  expect(await editing).toBe(true);
  expect(await deleting).toBe(true);
  expect(app.config.value.rules).toEqual([]);
  expect(await app.undo()).toBe(true);
  expect(app.rule.value?.properties["font-size"]).toBe("36px");
});

it("keeps undo and redo available when applying their snapshots fails", async () => {
  const app = setup();
  await app.connect(1);
  await app.setProperties({ "font-size": "40px" });
  sendMessage.mockRejectedValueOnce(new Error("Page unavailable"));
  expect(await app.undo()).toBe(false);
  expect(app.config.value.rules[0]!.properties["font-size"]).toBe("40px");
  expect(app.canUndo.value).toBe(true);
  expect(app.canRedo.value).toBe(false);
  expect(await app.undo()).toBe(true);
  expect(app.config.value.rules[0]!.properties["font-size"]).toBe("20px");
  sendMessage.mockRejectedValueOnce(new Error("Page unavailable"));
  expect(await app.redo()).toBe(false);
  expect(app.canRedo.value).toBe(true);
  expect(app.config.value.rules[0]!.properties["font-size"]).toBe("20px");
  expect(await app.redo()).toBe(true);
  expect(app.config.value.rules[0]!.properties["font-size"]).toBe("40px");
});

it("refreshes inherited computed values after an edit and after undo", async () => {
  const app = setup();
  await app.connect(1);
  await app.setProperties({ "font-size": "32px" });
  expect(app.selection.value?.computed["line-height"]).toBe("33.6px");
  expect(app.rule.value?.properties["line-height"]).toBeUndefined();
  const displayed = parseFloat(app.selection.value!.computed["line-height"]!);
  await app.setProperties({ "line-height": `${displayed + 1}px` });
  expect(app.rule.value?.properties["line-height"]).toBe("34.6px");
  await app.undo();
  expect(app.selection.value?.computed["line-height"]).toBe("33.6px");
});

it("discards a computed-value refresh after another target is selected", async () => {
  const app = setup();
  const config = tabConfigs.get(1)!;
  config.rules.push(makeConfig("p", 15).rules[0]!);
  await app.connect(1);
  const pending = deferred<unknown>();
  const oldSelection = inspection(1, "h1");
  let refreshStarted = false;
  sendMessage.mockImplementation(async (message) => {
    if (
      message.request?.type === "inspect" &&
      message.request.selector === "h1" &&
      !message.request.previewOnly
    ) {
      refreshStarted = true;
      return pending.promise;
    }
    return respond(message);
  });
  const applying = app.setProperties({ "font-size": "40px" });
  await vi.waitFor(() => expect(refreshStarted).toBe(true));
  await app.editRule(config.rules[1]!.id, "select");
  pending.resolve({ ok: true, data: { count: 1, selection: oldSelection } });
  await applying;
  expect(app.selection.value?.selector).toBe("p");
  expect(app.selection.value?.computed["line-height"]).toBe("15.75px");
});

it("does not report a failed selection refresh as a failed committed edit", async () => {
  const app = setup();
  await app.connect(1);
  sendMessage.mockImplementation(async (message) => {
    if (message.request?.type === "inspect") throw Error("Target detached");
    return respond(message);
  });
  expect(await app.setProperties({ "font-size": "40px" })).toBe(true);
  expect(app.error.value).toBe("");
  expect(app.canUndo.value).toBe(true);
  expect(app.selection.value).toBeUndefined();
});

it("drops queued properties when another rule is selected before they run", async () => {
  const app = setup();
  const config = tabConfigs.get(1)!;
  config.rules.push(makeConfig("p", 15).rules[0]!);
  await app.connect(1);
  const pending = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => pending.promise);
  const first = app.setProperties({ "font-size": "40px" });
  const queued = app.setProperties({ "letter-spacing": "2px" });
  await vi.waitFor(() =>
    expect(
      sendMessage.mock.calls.some(([m]) => m.request?.type === "apply"),
    ).toBe(true),
  );
  await app.editRule(config.rules[1]!.id, "select");
  pending.resolve({ ok: true, data: true });
  await first;
  expect(await queued).toBe(false);
  expect(app.selectedId.value).toBe(config.rules[1]!.id);
  expect(app.rule.value?.properties["letter-spacing"]).toBeUndefined();
  expect(app.busy.value).toBe(false);
});

it("does not label an unapplied or stale preset as selected", async () => {
  const app = setup();
  await app.connect(1);
  const presets = scope.run(() => usePresets(app))!;
  presets.presets.value = [{ name: "Example", config: makeConfig("h1", 48) }];
  const load = vi.spyOn(app, "loadPreset").mockResolvedValueOnce(false);
  await presets.loadPreset("Example");
  expect(presets.selectedPreset.value).toBe("");
  const pending = deferred<boolean>();
  load.mockImplementationOnce(() => pending.promise);
  const applying = presets.loadPreset("Example");
  await app.connect(2);
  pending.resolve(true);
  await applying;
  expect(presets.selectedPreset.value).toBe("");
  expect(presets.presetUndoConfig.value).toBeUndefined();
});

it("keeps a new page busy until its own queued edit finishes", async () => {
  const app = setup();
  await app.connect(1);
  const old = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => old.promise);
  const oldEdit = app.setProperties({ "font-size": "40px" });
  await vi.waitFor(() =>
    expect(
      sendMessage.mock.calls.some(([m]) => m.request?.type === "apply"),
    ).toBe(true),
  );
  await app.connect(2);
  const current = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => current.promise);
  const newEdit = app.setProperties({ "font-size": "32px" });
  await vi.waitFor(() =>
    expect(
      sendMessage.mock.calls.some(
        ([m]) => m.tabId === 2 && m.request?.type === "apply",
      ),
    ).toBe(true),
  );
  old.resolve({ ok: true, data: true });
  await oldEdit;
  expect(app.busy.value).toBe(true);
  current.resolve({ ok: true, data: true });
  expect(await newEdit).toBe(true);
  expect(app.busy.value).toBe(false);
  expect(app.rule.value?.properties["font-size"]).toBe("32px");
});

it("preserves successive queued changes for the same target", async () => {
  const app = setup();
  await app.connect(1);
  const first = app.setProperties({ "font-size": "32px" });
  const second = app.setProperties({ "letter-spacing": "2px" });
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(app.rule.value?.properties).toEqual({
    "font-size": "32px",
    "letter-spacing": "2px",
  });
  expect(app.busy.value).toBe(false);
});

it("preserves newer selector input while a previous commit refreshes its selection", async () => {
  const app = setup();
  await app.connect(1);
  const pending = deferred<unknown>();
  let inspections = 0;
  sendMessage.mockImplementation(async (message) => {
    if (
      message.request?.type === "inspect" &&
      message.request.selector === "p, a" &&
      !message.request.previewOnly &&
      ++inspections === 2
    )
      return pending.promise;
    return respond(message);
  });
  app.selector.value = "p, a";
  const updating = app.commitSelector(app.selector.value);
  await vi.waitFor(() => expect(inspections).toBe(2));
  expect(app.selectorCommitting.value).toBe(true);
  app.selector.value = "p, a, h2";
  app.selector.value = "p, a, h";
  pending.resolve({
    ok: true,
    data: { count: 1, selection: inspection(1, "p, a") },
  });
  await updating;
  expect(app.selector.value).toBe("p, a, h");
  expect(app.targets.value).toEqual([
    { kind: "selector", selector: "p" },
    { kind: "selector", selector: "a" },
  ]);
  expect(app.rule.value?.selector).toBe("p, a");
  await app.commitSelector(app.selector.value);
  expect(app.rule.value?.selector).toBe("p, a, h");
  expect(app.busy.value).toBe(false);
});

it("updates the selector draft when a shortcut finishes without newer input", async () => {
  const app = setup();
  await app.connect(1);
  await app.appendSelectors("p, a");
  expect(app.selector.value).toBe("h1, p, a");
  expect(app.rule.value?.selector).toBe("h1, p, a");
});

it("clears every target from the selected rule while preserving its identity and typography", async () => {
  const other = newRule("p");
  tabConfigs.get(1)!.rules.push(other);
  const app = setup();
  await app.connect(1);
  await app.appendSelectors("h2, h3");
  const id = app.selectedId.value;
  const before = structuredClone(toRaw(app.rule.value));
  await app.clearTarget();
  expect(app.selectedId.value).toBe(id);
  expect(app.config.value.rules).toHaveLength(2);
  expect(app.rule.value).toMatchObject({
    id,
    selector: "",
    mode: "selector",
    properties: before?.properties,
  });
  expect(app.rule.value?.targets).toBeUndefined();
  expect(app.targets.value).toEqual([]);
  expect(app.selector.value).toBe("");
  expect(app.selection.value).toBeUndefined();
  expect(app.config.value.rules[1]).toEqual(other);
  expect(engineCSS(tabConfigs.get(1)!, 0)).not.toContain("font-size");
  await app.commitSelector("a");
  expect(app.selectedId.value).toBe(id);
  expect(app.rule.value?.selector).toBe("a");
  expect(app.rule.value?.properties).toEqual(before?.properties);
});

it("removing the final selector updates the same rule and supports undo and redo", async () => {
  const app = setup();
  await app.connect(1);
  const original = structuredClone(toRaw(app.config.value));
  const id = app.selectedId.value;
  await app.commitSelector("");
  expect(app.rule.value?.selector).toBe("");
  expect(app.selectedId.value).toBe(id);
  expect(await app.undo()).toBe(true);
  expect(app.config.value).toEqual(original);
  expect(app.selector.value).toBe("h1");
  expect(await app.redo()).toBe(true);
  expect(app.rule.value?.selector).toBe("");
  expect(app.targets.value).toEqual([]);
  expect(app.selection.value).toBeUndefined();
});

it("removing the final exact pick leaves its rule untargeted and preserves its font", async () => {
  const exact = {
    ...newRule("h1", "exact", inspection(1)),
    font: {
      id: "system:sans",
      family: "system-ui",
      provider: "system" as const,
    },
    properties: { "font-size": "25px" },
  };
  tabConfigs.set(1, { ...emptyConfig(), rules: [exact] });
  const app = setup();
  await app.connect(1);
  await app.removeExactTarget(exact.handle);
  expect(app.rule.value).toMatchObject({
    id: exact.id,
    selector: "",
    font: exact.font,
    properties: exact.properties,
  });
  expect(app.rule.value?.handle).toBeUndefined();
  expect(app.targets.value).toEqual([]);
  expect(engineCSS(tabConfigs.get(1)!, 0)).toBe("");
  await app.commitSelector("p");
  expect(app.rule.value).toMatchObject({
    id: exact.id,
    selector: "p",
    font: exact.font,
  });
});

it("failed target clearing leaves the applied rule and targets intact", async () => {
  const app = setup();
  await app.connect(1);
  const original = structuredClone(toRaw(app.config.value));
  sendMessage.mockImplementation(async (message) =>
    message.request?.type === "apply"
      ? { ok: false, error: "Could not apply." }
      : respond(message),
  );
  await app.clearTarget();
  expect(app.config.value).toEqual(original);
  expect(app.rule.value?.selector).toBe("h1");
  expect(app.targets.value).toEqual([{ kind: "selector", selector: "h1" }]);
  expect(app.error.value).toBe("Could not apply.");
});

it("typography cannot be edited until an untargeted rule is targeted again", async () => {
  const app = setup();
  await app.connect(1);
  await app.clearTarget();
  expect(await app.setProperties({ "font-size": "32px" })).toBe(false);
  expect(app.rule.value?.properties["font-size"]).toBe("20px");
  expect(app.error.value).toContain("Choose a target");
});

it("changes editor generation only when its page or target changes", async () => {
  const app = setup();
  await app.connect(1);
  const originalRule = app.rule.value!.id;
  await app.clearTarget();
  await app.commitSelector("h2");
  const draftGeneration = app.editorGeneration.value;
  expect(await app.setProperties({ "font-size": "32px" })).toBe(true);
  expect(app.rule.value?.selector).toBe("h2");
  expect(app.editorGeneration.value).toBe(draftGeneration);
  expect(await app.setProperties({ "font-size": "34px" })).toBe(true);
  expect(app.editorGeneration.value).toBe(draftGeneration);

  await app.editRule(originalRule, "select");
  expect(app.editorGeneration.value).toBeGreaterThan(draftGeneration);
  const selectedGeneration = app.editorGeneration.value;
  await app.connect(2);
  expect(app.editorGeneration.value).toBeGreaterThan(selectedGeneration);
});

it.each([
  { connecting: false, text: "{", expected: "JSON" },
  { connecting: true, text: "{", expected: "JSON" },
  { connecting: false, text: '{"version":2}', expected: "invalid" },
  { connecting: true, text: '{"version":2}', expected: "invalid" },
])(
  "reports invalid imported files before a page is connected: %j",
  async ({ connecting, text, expected }) => {
    const app = setup();
    const manager = scope.run(() => usePresets(app))!;
    const backup = useBackup(app, manager);
    const pending = deferred<unknown>();
    sendMessage.mockImplementationOnce(() => pending.promise);
    const connection = connecting ? app.connect(1) : undefined;
    await backup.importJSON(new File([text], "invalid.json"));
    expect(app.error.value).toContain(expected);
    expect(
      sendMessage.mock.calls.some(
        ([message]) => message.request?.type === "apply",
      ),
    ).toBe(false);
    pending.resolve({ ok: true, data: state(1) });
    await connection;
    expect(app.error.value).toContain(expected);
  },
);

it("exports presets without including an empty page configuration", async () => {
  const app = setup();
  const manager = scope.run(() => usePresets(app))!;
  const presets = [{ name: "Headings", config: makeConfig("h1", 36) }];
  manager.presets.value = presets;
  useBackup(app, manager).downloadJSON();
  const [name, blob] = vi.mocked(download).mock.lastCall!;
  expect(name).toBe("fontzie-presets.json");
  expect(JSON.parse(await blob.text())).toEqual({ version: 1, presets });
});

it.each([
  { connected: false, page: undefined, scope: undefined },
  { connected: true, page: undefined, scope: undefined },
  { connected: true, page: emptyConfig(), scope: undefined },
  { connected: false, page: makeConfig("p", 32), scope: undefined },
  { connected: true, page: makeConfig("p", 32), scope: "presets" as const },
])(
  "imports presets without applying page edits: %j",
  async ({ connected, page, scope: importScope }) => {
    const app = setup();
    if (connected) await app.connect(1);
    const original = structuredClone(toRaw(app.config.value));
    const manager = scope.run(() => usePresets(app))!;
    const presets = [{ name: "Headings", config: makeConfig("h1", 36) }];
    const get = vi.fn(async (key: string) => ({
      [key]: key === "presets" ? presets : true,
    }));
    vi.stubGlobal("chrome", {
      ...chrome,
      storage: { ...chrome.storage, local: { get } },
    });
    await useBackup(app, manager).importJSON(
      new File(
        [JSON.stringify({ version: 1, config: page, presets })],
        "backup.json",
      ),
      importScope,
    );
    expect(sendMessage).toHaveBeenCalledWith({
      channel: "fontzie-storage",
      command: { type: "preset.import", presets },
    });
    expect(manager.presets.value).toEqual(presets);
    expect(app.status.value).toMatch(/^Presets imported\./);
    expect(app.config.value).toEqual(original);
    expect(
      sendMessage.mock.calls.some(
        ([message]) => message.request?.type === "apply",
      ),
    ).toBe(false);
  },
);

it("explains that importing page edits requires a connected page", async () => {
  const app = setup();
  const manager = scope.run(() => usePresets(app))!;
  const backup = useBackup(app, manager);
  await backup.importJSON(
    new File([JSON.stringify(makeConfig("h1", 48))], "valid.json"),
  );
  expect(app.error.value).toBe(
    "Connect a website before importing a configuration.",
  );
  expect(sendMessage).not.toHaveBeenCalled();
});

it("imports its own large preset backup, including old indented copies", async () => {
  const app = setup();
  const manager = scope.run(() => usePresets(app))!;
  const config = {
    ...emptyConfig(),
    rules: Array.from({ length: 60 }, (_, i) =>
      newRule(`.name-${"a".repeat(420)}-${i}`),
    ),
  };
  manager.presets.value = Array.from({ length: 90 }, (_, i) => ({
    name: `Saved ${i}`,
    config,
  }));
  vi.stubGlobal("chrome", {
    ...chrome,
    storage: {
      ...chrome.storage,
      local: {
        get: async (key: string) => ({ [key]: key === "presets" ? [] : true }),
      },
    },
  });
  const backup = useBackup(app, manager);
  backup.downloadJSON();
  const blob = vi.mocked(download).mock.lastCall![1];
  expect(blob.size).toBeGreaterThan(2 * 1024 * 1024);
  const pretty = JSON.stringify(JSON.parse(await blob.text()), null, 2);
  for (const contents of [blob, pretty]) {
    await backup.importJSON(new File([contents], "presets.json"));
    expect(app.error.value).toBe("");
    expect(app.status.value).toBe("Presets imported.");
    const imported = sendMessage.mock.lastCall?.[0].command?.presets;
    expect(imported).toHaveLength(90);
    expect(imported[89].config.rules).toHaveLength(60);
  }
});

it("restores portable rules to a unique iframe and pauses ambiguous frames", async () => {
  const app = setup();
  await app.connect(1);
  const manager = scope.run(() => usePresets(app))!;
  const url = "https://site1.test/embed";
  const other = "https://site1.test/repeated";
  sendMessage.mockImplementation(async (message) =>
    message.type === "list-frames"
      ? {
          ok: true,
          data: [
            { id: 0, url: state(1).url },
            { id: 5, url },
            { id: 8, url: other },
            { id: 9, url: other },
          ],
        }
      : respond(message),
  );
  const rules = [
    newRule("h1"),
    { ...newRule("p"), frameId: 12, frameUrl: url },
    { ...newRule("h2"), frameId: 14, frameUrl: other },
  ];
  await useBackup(app, manager).importJSON(
    new File([JSON.stringify({ ...emptyConfig(), rules })], "frames.json"),
  );
  expect(
    app.config.value.rules.map((rule) => [rule.frameId, rule.enabled]),
  ).toEqual([
    [0, true],
    [5, true],
    [2147483647, false],
  ]);
  expect(app.restorationNotice.value).toContain("1 rule was paused");
  expect(app.selectedId.value).toBe(rules[0]!.id);
  expect(app.selector.value).toBe("h1");
  expect(app.frames.value).toContain(5);
  await app.editRule(rules[2]!.id, "select");
  expect(app.selection.value).toBeUndefined();
  expect(app.error.value).toBe("");
});

it("restores page edits and history if the preset write in a combined import fails", async () => {
  const app = setup();
  await app.connect(1);
  const previous = structuredClone(toRaw(app.config.value));
  const manager = scope.run(() => usePresets(app))!;
  vi.stubGlobal("chrome", {
    ...chrome,
    storage: {
      ...chrome.storage,
      local: {
        get: async (key: string) => ({ [key]: key === "presets" ? [] : true }),
      },
    },
  });
  sendMessage.mockImplementation(async (message) =>
    message.channel === "fontzie-storage"
      ? { ok: false, error: "Unable to save the preset." }
      : respond(message),
  );
  const config = makeConfig("p", 31);
  const backup = { version: 1, config, presets: [{ name: "Draft", config }] };
  await useBackup(app, manager).importJSON(
    new File([JSON.stringify(backup)], "backup.json"),
  );
  expect(app.error.value).toBe("Unable to save the preset.");
  expect(tabConfigs.get(1)).toEqual(previous);
  expect(app.config.value).toEqual(previous);
  expect(app.canUndo.value).toBe(false);
});

it("does not start an import chosen before the page finished connecting", async () => {
  const app = setup();
  const manager = scope.run(() => usePresets(app))!;
  const backup = useBackup(app, manager);
  const pendingConnection = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => pendingConnection.promise);
  const connecting = app.connect(1);
  const pendingFile = deferred<string>();
  const file = new File([], "valid.json");
  vi.spyOn(file, "text").mockReturnValue(pendingFile.promise);
  const importing = backup.importJSON(file);
  pendingConnection.resolve({ ok: true, data: state(1) });
  await connecting;
  pendingFile.resolve(JSON.stringify(makeConfig("h1", 48)));
  await importing;
  expect(app.error.value).toBe(
    "Connect a website before importing a configuration.",
  );
  expect(
    sendMessage.mock.calls.some(
      ([message]) => message.request?.type === "apply",
    ),
  ).toBe(false);
});

it("explains when an import must wait for a pending page edit", async () => {
  const app = setup();
  await app.connect(1);
  const manager = scope.run(() => usePresets(app))!;
  const backup = useBackup(app, manager);
  const pending = deferred<unknown>();
  sendMessage.mockImplementationOnce(() => pending.promise);
  const editing = app.commit(makeConfig("h1", 40));
  await backup.importJSON(
    new File([JSON.stringify(makeConfig("h1", 48))], "valid.json"),
  );
  expect(app.error.value).toContain("Wait for the current edit to finish");
  expect(
    sendMessage.mock.calls.filter(
      ([message]) => message.request?.type === "apply",
    ),
  ).toHaveLength(1);
  pending.resolve({ ok: true, data: true });
  await editing;
  expect(app.config.value.rules[0]!.properties["font-size"]).toBe("40px");
});

it("does not apply an imported file to a page selected while the file was being read", async () => {
  const app = setup();
  await app.connect(1);
  const manager = scope.run(() => usePresets(app))!;
  const backup = useBackup(app, manager);
  const pending = deferred<string>();
  const file = new File([], "valid.json");
  vi.spyOn(file, "text").mockReturnValue(pending.promise);
  const importing = backup.importJSON(file);
  await app.connect(2);
  pending.resolve(JSON.stringify(makeConfig("h1", 48)));
  await importing;
  expect(app.config.value).toEqual(tabConfigs.get(2));
  expect(app.error.value).toBe("");
  expect(
    sendMessage.mock.calls.some(
      ([message]) => message.request?.type === "apply",
    ),
  ).toBe(false);
  expect(manager.presets.value).toEqual([]);
});

it("restores the remembered rule and all its targets instead of an unrelated inspection", async () => {
  const first = newRule("h1");
  const active = newRule("p, a");
  tabConfigs.set(1, { ...emptyConfig(), rules: [first, active] });
  sendMessage.mockImplementation(async (message) =>
    message.type === "connect"
      ? {
          ok: true,
          data: { ...state(1), activeRuleId: active.id, selection: undefined },
        }
      : respond(message),
  );
  const app = setup();
  await mounted[0]!();
  expect(app.selectedId.value).toBe(active.id);
  expect(app.targets.value.map((target) => target.selector)).toEqual([
    "p",
    "a",
  ]);
  expect(app.selection.value).toBeUndefined();
  await app.setProperties({ "font-size": "31px" });
  expect(app.config.value.rules).toHaveLength(2);
  expect(app.rule.value?.id).toBe(active.id);
  expect(app.rule.value?.properties["font-size"]).toBe("31px");
});

it("discards an orphaned inspection in a legacy connection", async () => {
  sendMessage.mockImplementation(async (message) =>
    message.type === "connect"
      ? {
          ok: true,
          data: { ...state(1), selection: inspection(1, ".skip-link") },
        }
      : respond(message),
  );
  const app = setup();
  await mounted[0]!();
  expect(app.selectedId.value).toBe(tabConfigs.get(1)!.rules[0]!.id);
  expect(app.targets.value.map((target) => target.selector)).toEqual(["h1"]);
  expect(app.selection.value).toBeUndefined();
});

it("restores an active blank rule without inheriting the old pick", async () => {
  const blank = newRule("");
  tabConfigs.get(1)!.rules.push(blank);
  sendMessage.mockImplementation(async (message) =>
    message.type === "connect"
      ? { ok: true, data: { ...state(1), activeRuleId: blank.id } }
      : respond(message),
  );
  const app = setup();
  await mounted[0]!();
  expect(app.selectedId.value).toBe(blank.id);
  expect(app.targets.value).toEqual([]);
  expect(app.selection.value).toBeUndefined();
});

it("remembers switching rules without requiring a typography edit", async () => {
  const other = newRule("p");
  tabConfigs.get(1)!.rules.push(other);
  const app = setup();
  await mounted[0]!();
  await app.editRule(other.id, "select");
  await vi.waitFor(() =>
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "select-rule",
        activeRuleId: other.id,
        pageUrl: "https://site1.test/",
        tabId: 1,
      }),
    ),
  );
});

it("ignores stale pick and clipboard results after the export changes", async () => {
  const app = setup();
  await app.connect(1);
  const pick = (handle: string) => ({
    ...newRule(".title", "exact"),
    handle,
    properties: { "font-size": "22px" },
  });
  const first = pick("first");
  const second = pick("second");
  app.config.value = { ...emptyConfig(), rules: [first, second] };
  app.selectedId.value = second.id;
  const pending = deferred<Record<string, { selector: string }>>();
  const lookup = vi
    .spyOn(app, "locatePicks")
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ second: { selector: "#current .title" } });
  const exporter = scope.run(() =>
    useTypographyExport(app, ref([]), ref([]), ref([]), ref(true)),
  )!;
  exporter.format.value = "prompt";
  await nextTick();
  expect(lookup).toHaveBeenCalledWith(0, ["first", "second"]);
  expect(exporter.canExport.value).toBe(false);
  exporter.exportScope.value = "selected";
  await vi.waitFor(() =>
    expect(exporter.exportCode.value).toContain("#current .title"),
  );
  expect(exporter.canExport.value).toBe(true);
  pending.resolve({ second: { selector: "#obsolete .title" } });
  await pending.promise;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(exporter.exportCode.value).toContain("#current .title");
  expect(exporter.exportCode.value).not.toContain("#obsolete");
  const writing = deferred<void>();
  const writeText = vi.fn(() => writing.promise);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const copy = exporter.copyCode();
  expect(writeText).toHaveBeenCalledWith(exporter.exportCode.value);
  exporter.format.value = "css";
  await nextTick();
  writing.resolve();
  await copy;
  expect(exporter.copied.value).toBe(false);
});
