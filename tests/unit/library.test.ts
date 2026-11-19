import { beforeEach, expect, it, vi } from "vitest";
import { createLibraryService } from "../../background/library";
import { createPanelService } from "../../background/panel";
import type { SessionService } from "../../background/session";
import { createQueue } from "../../core/queue";
import {
  emptyConfig,
  type Config,
  type ContentRequest,
  type FontFamily,
  type Result,
} from "../../core/schema";
import { writePageDraft } from "../../storage/drafts";

vi.mock("../../storage/fonts", () => ({
  allFaces: async () => [],
  groupFamilies: () => families,
  clearFonts: async () => {},
}));
vi.mock("../../providers/catalog", () => ({
  loadCatalog: async () => {},
  findFont: (id: string, custom: FontFamily[]) =>
    custom.find((font) => font.id === id),
}));
vi.mock("../../storage/drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../storage/drafts")>()),
  writePageDraft: vi.fn(async () => {}),
}));

const send =
  vi.fn<
    (
      tabId: number,
      frameId: number,
      request: ContentRequest,
    ) => Promise<Result<true>>
  >();
let states: Record<string, unknown>;
let families: FontFamily[];
let onSnapshot: (() => void) | undefined;
let drafts: Record<string, unknown>;
const customConfig = (): Config => ({
  ...emptyConfig(),
  rules: [
    {
      id: "custom-rule",
      selector: "h1",
      mode: "selector",
      frameId: 0,
      enabled: true,
      font: { id: "custom:Example", family: "Example", provider: "custom" },
      properties: { "font-size": "20px" },
    },
  ],
});
const tab = (id: number) =>
  states[`tab:${id}`] as { url: string; config: Config };
const panelService = (inject = vi.fn<SessionService["inject"]>()) =>
  createPanelService(createQueue(), {
    // These tests exercise apply requests; content replies true after applying.
    send: send as SessionService["send"],
    connect: vi.fn<SessionService["connect"]>(),
    restoreTab: vi.fn<SessionService["restoreTab"]>(),
    inject,
  });

it("persists rule selection once and skips repeated selections of that rule", async () => {
  const panel = panelService();
  const command = {
    channel: "fontzie-panel" as const,
    type: "select-rule" as const,
    tabId: 1,
    pageUrl: "https://example.test/one",
    activeRuleId: "custom-rule",
  };
  await panel.handle(command);
  await panel.handle(command);
  expect(writePageDraft).toHaveBeenCalledTimes(1);
});

it("keeps main-page edits when an unrelated iframe disappears and pauses only its rules", async () => {
  const inject = vi
    .fn<SessionService["inject"]>()
    .mockResolvedValue([{ id: 0, url: tab(1).url, documentToken: "main" }]);
  const config = customConfig();
  delete config.rules[0]!.font;
  config.rules.push({
    ...config.rules[0]!,
    id: "child",
    frameId: 8,
    frameUrl: "https://example.test/embed",
  });
  states["frames:1"] = [0, 8];
  send.mockImplementation(async (_tab, frame) =>
    frame === 8
      ? {
          ok: false,
          error:
            "Could not establish connection. Receiving end does not exist.",
        }
      : { ok: true, data: true },
  );
  const response = await panelService(inject).handle({
    channel: "fontzie-panel",
    type: "request",
    tabId: 1,
    request: { type: "apply", config },
  });
  expect(response).toMatchObject({
    frames: [0],
    config: {
      rules: [
        { id: "custom-rule", enabled: true },
        { id: "child", enabled: false },
      ],
    },
  });
  expect(tab(1).config.rules[0]!.properties["font-size"]).toBe("20px");
});

it("clears saved data when another edited tab has left its page or cannot receive a clear", async () => {
  vi.spyOn(chrome.tabs, "get").mockImplementation(
    async (id) =>
      ({
        id,
        url: id === 1 ? "chrome://newtab/" : tab(2).url,
      }) as chrome.tabs.Tab,
  );
  send.mockResolvedValue({ ok: false, error: "Receiving end does not exist." });
  const wipe = vi.fn(async () => {
    drafts = {};
    states = {};
  });
  const result = await panelService().clearAllData(wipe);
  expect(wipe).toHaveBeenCalledOnce();
  expect(result.reloadTabs).toEqual([2]);
  expect(send.mock.calls.map(([id]) => id)).toEqual([2]);
});
function availableCustomFamily() {
  families = [
    {
      id: "custom:Example",
      family: "Example",
      provider: "custom",
      category: "custom",
      weights: [400],
      styles: ["normal"],
      axes: [],
    },
  ];
}
beforeEach(() => {
  families = [];
  onSnapshot = undefined;
  drafts = {};
  states = {
    "tab:1": {
      url: "https://example.test/one",
      config: customConfig(),
      title: "One",
      frameId: 0,
    },
    "tab:2": {
      url: "https://example.test/two",
      config: customConfig(),
      title: "Two",
      frameId: 0,
    },
  };
  send.mockReset().mockResolvedValue({ ok: true, data: true });
  vi.mocked(writePageDraft).mockClear();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => ({ ...drafts }),
        remove: async (keys: string[]) => {
          for (const key of keys) delete drafts[key];
        },
      },
      session: {
        get: async (key: string | null) => {
          const snapshot = structuredClone(
            key ? { [key]: states[key] } : states,
          );
          if (key === null) onSnapshot?.();
          return snapshot;
        },
        set: async (value: Record<string, unknown>) => {
          Object.assign(states, structuredClone(value));
        },
      },
    },
    tabs: {
      get: async (id: number) => ({ url: tab(id)?.url }),
    },
  });
});

it("clears all drafts and open tabs for the site and rejects queued edits from old history", async () => {
  const page = (url: string) => ({
    url,
    title: "Page",
    frameId: 0,
    config: customConfig(),
  });
  states = {
    "tab:1": page("https://example.test/one"),
    "tab:2": page("https://example.test/two"),
    "tab:3": page("https://other.test/"),
  };
  drafts = {
    "draft:page:https://example.test/one": true,
    "draft:page:https://example.test/closed?q=1": true,
    "draft:page:https://example.test:8443/": true,
    "draft:page:https://other.test/": true,
    settings: true,
  };
  const panel = panelService();
  const clearing = panel.handle({
    channel: "fontzie-panel",
    type: "clear-site",
    tabId: 1,
    siteOrigin: "https://example.test",
  });
  const staleUndo = panel.handle({
    channel: "fontzie-panel",
    type: "request",
    tabId: 2,
    request: { type: "apply", config: customConfig() },
  });
  await expect(staleUndo).rejects.toThrow("Site edits were cleared");
  await expect(clearing).resolves.toBe(true);
  expect(send.mock.calls).toEqual([
    [1, 0, { type: "clear" }],
    [2, 0, { type: "clear" }],
  ]);
  expect(tab(1).config).toEqual(emptyConfig());
  expect(tab(2).config).toEqual(emptyConfig());
  expect(tab(3).config.rules).toHaveLength(1);
  expect(drafts).toEqual({
    "draft:page:https://example.test:8443/": true,
    "draft:page:https://other.test/": true,
    settings: true,
  });
});

it("keeps affected rules, selections, and unrelated edits on open tabs and in page drafts", async () => {
  const original = tab(1).config.rules[0]!;
  const other = {
    ...original,
    id: "unrelated",
    selector: "p",
    font: undefined,
  };
  tab(1).config.rules.push(other);
  Object.assign(states["tab:1"]!, { activeRuleId: original.id });
  const expected = {
    ...customConfig(),
    rules: [{ ...original, font: undefined }, other],
  };
  expect(await createLibraryService(panelService()).reconcileFonts(1)).toEqual(
    expected,
  );
  expect(send.mock.calls.map(([tabId]) => tabId)).toEqual([1, 2]);
  expect(tab(1).config).toEqual(expected);
  expect(tab(2).config.rules).toEqual([expected.rules[0]]);
  expect(writePageDraft).toHaveBeenCalledWith(
    "https://example.test/one",
    expected,
    undefined,
    original.id,
  );
});

it("reports an initiating-tab apply failure instead of returning an unapplied config", async () => {
  send.mockResolvedValue({ ok: false, error: "Page disconnected" });
  await expect(
    createLibraryService(panelService()).reconcileFonts(1),
  ).rejects.toThrow("Page disconnected");
  expect(tab(1).config.rules).toHaveLength(1);
  expect(writePageDraft).not.toHaveBeenCalled();
});

it("skips unchanged non-custom configs and tolerates an unavailable other tab", async () => {
  tab(1).config = emptyConfig();
  send.mockResolvedValue({ ok: false, error: "Tab closed" });
  expect(
    await createLibraryService(panelService()).reconcileFonts(1),
  ).toBeUndefined();
  expect(send.mock.calls.length).toBeGreaterThan(0);
  expect(send.mock.calls.every(([tabId]) => tabId === 2)).toBe(true);
});

it("reapplies unchanged custom rules in every tab without requesting an editor history reset", async () => {
  availableCustomFamily();
  const before = structuredClone(tab(1).config);
  expect(
    await createLibraryService(panelService()).reconcileFonts(1),
  ).toBeUndefined();
  expect(send.mock.calls.map(([tabId]) => tabId)).toEqual([1, 2]);
  for (const [, , request] of send.mock.calls)
    expect(request).toEqual({ type: "apply", config: before });
  expect(tab(1).config).toEqual(before);
});

it("leaves history alone after an unrelated upload when the current page has no custom rules", async () => {
  tab(1).config = emptyConfig();
  tab(2).config = emptyConfig();
  expect(
    await createLibraryService(panelService()).reconcileFonts(1),
  ).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});

it("preserves an in-flight edit when reconciliation queues behind it", async () => {
  availableCustomFamily();
  delete states["tab:2"];
  let release!: () => void, started!: () => void, snapshotted!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const snapshot = new Promise<void>((resolve) => {
    snapshotted = resolve;
  });
  onSnapshot = snapshotted;
  send.mockImplementationOnce(async () => {
    started();
    await hold;
    return { ok: true, data: true };
  });
  const panel = panelService();
  const edited = customConfig();
  edited.rules[0]!.properties["font-size"] = "40px";
  const edit = panel.handle({
    channel: "fontzie-panel",
    type: "request",
    tabId: 1,
    request: { type: "apply", config: edited },
  });
  await entered;
  const reconciliation = createLibraryService(panel).reconcileFonts(1);
  await snapshot;
  release();
  await edit;
  expect(await reconciliation).toBeUndefined();
  expect(tab(1).config.rules[0]!.properties["font-size"]).toBe("40px");
  expect(send).toHaveBeenLastCalledWith(1, 0, {
    type: "apply",
    config: edited,
  });
  expect(writePageDraft).toHaveBeenLastCalledWith(
    "https://example.test/one",
    edited,
    undefined,
    undefined,
  );
});

it("persists a selected rule without changing the applied config", async () => {
  await panelService().handle({
    channel: "fontzie-panel",
    type: "select-rule",
    tabId: 1,
    activeRuleId: "custom-rule",
    pageUrl: "https://example.test/one",
  });
  expect(states["tab:1"]).toMatchObject({ activeRuleId: "custom-rule" });
  expect(writePageDraft).toHaveBeenCalledWith(
    "https://example.test/one",
    customConfig(),
    undefined,
    "custom-rule",
  );
  expect(send).not.toHaveBeenCalled();
});

it("rejects remembering a rule for a page that has changed", async () => {
  await expect(
    panelService().handle({
      channel: "fontzie-panel",
      type: "select-rule",
      tabId: 1,
      activeRuleId: "custom-rule",
      pageUrl: "https://example.test/old",
    }),
  ).rejects.toThrow("website changed");
  expect(writePageDraft).not.toHaveBeenCalled();
});
