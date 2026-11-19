import { beforeEach, expect, it, vi } from "vitest";
import { createSessionService } from "../../background/session";
import { createQueue } from "../../core/queue";
import { pdfViewerInjectionResult } from "../../core/messages";
import {
  emptyConfig,
  type Config,
  type ContentRequest,
  type TabState,
} from "../../core/schema";
import { draftKey } from "../../storage/drafts";

vi.mock("../../storage/migrations", () => ({ migrateStorage: async () => {} }));

vi.mock("../../storage/fonts", () => ({
  allFaces: async () => [],
  groupFamilies: () => [],
}));

const pageUrl = "https://example.test/article";
const frameUrl = "https://example.test/embed";
let session: Record<string, unknown>;
let local: Record<string, unknown>;
let frames: Map<number, TabState & { documentToken: string }>;
let commands: Array<{ frameId: number; request: ContentRequest }>;
let permitted: boolean;
const executeScript = vi.fn();
const getTab = vi.fn();
const config = (frameId = 8): Config => ({
  ...emptyConfig(),
  rules: [
    {
      id: "rule",
      selector: "h1",
      mode: "exact",
      handle: "old-handle",
      frameId,
      ...(frameId ? { frameUrl } : {}),
      enabled: true,
      properties: { "font-size": "41px" },
    },
  ],
});
const state = (frameId: number, url: string, documentToken: string) => ({
  config: emptyConfig(),
  frameId,
  url,
  title: "Page",
  documentToken,
});
function storage(values: Record<string, unknown>) {
  return {
    get: async (key: string | null) =>
      structuredClone(key ? { [key]: values[key] } : values),
    set: async (next: Record<string, unknown>) => {
      Object.assign(values, structuredClone(next));
    },
    remove: async (key: string) => {
      delete values[key];
    },
  };
}
beforeEach(() => {
  session = {};
  local = {};
  commands = [];
  permitted = true;
  frames = new Map([
    [0, state(0, pageUrl, "main-document")],
    [5, state(5, frameUrl, "first-document")],
    [8, state(8, frameUrl, "second-document")],
  ]);
  executeScript
    .mockReset()
    .mockImplementation(async () =>
      [...frames.keys()].map((frameId) => ({ frameId })),
    );
  getTab.mockReset().mockImplementation(async () => ({
    id: 1,
    url: frames.get(0)!.url,
  }));
  vi.stubGlobal("chrome", {
    storage: { session: storage(session), local: storage(local) },
    permissions: { contains: async () => permitted },
    tabs: {
      get: getTab,
      sendMessage: async (
        _tab: number,
        message: { frameId: number; request: ContentRequest },
      ) => {
        const { frameId, request } = message;
        const current = frames.get(frameId)!;
        if (request.type === "state")
          return { ok: true, data: structuredClone(current) };
        commands.push(structuredClone(message));
        if (request.type === "apply" || request.type === "restore") {
          current.config = structuredClone(request.config);
          if (request.type === "restore")
            for (const rule of current.config.rules)
              if (
                rule.frameId === frameId &&
                rule.mode === "exact" &&
                rule.enabled
              )
                rule.handle = `rebound-${current.documentToken}`;
        }
        return {
          ok: true,
          data:
            request.type === "restore"
              ? { config: structuredClone(current.config), warnings: [] }
              : request.type === "inspect"
                ? {
                    count: 1,
                    selection: {
                      handle: "inspected",
                      selector: request.selector,
                      tag: "p",
                      classes: [],
                      identity: "p",
                      width: 10,
                      height: 10,
                      computed: {},
                      frameId,
                      url: current.url,
                    },
                  }
                : true,
        };
      },
    },
    scripting: { executeScript },
  });
});

function saveLiveSession() {
  session["tab:1"] = {
    ...frames.get(0),
    config: config(),
    frameDocuments: {
      0: "main-document",
      5: "first-document",
      8: "second-document",
    },
  };
}
const service = () => createSessionService(createQueue(), async () => {});

it("restores a closed page with its active rule when its custom font file is gone", async () => {
  const saved = config(0);
  const rule = saved.rules[0]!;
  rule.font = { id: "custom:Example", family: "Example", provider: "custom" };
  Object.assign(rule.properties, {
    "font-family": "Example",
    "font-synthesis": "none",
    "font-variation-settings": '"wght" 450',
  });
  local[draftKey(pageUrl)] = { config: saved, activeRuleId: rule.id };
  const connected = await service().connect(1);
  expect(connected.activeRuleId).toBe(rule.id);
  expect(connected.selection?.selector).toBe(
    '[data-fontzie-target~="rebound-main-document"]',
  );
  expect(connected.config.rules).toEqual([
    {
      ...rule,
      font: undefined,
      handle: "rebound-main-document",
      properties: { "font-size": "41px" },
    },
  ]);
});

it("does not restore cleared rules from a cached document", async () => {
  frames.get(0)!.config = config(0);
  session["tab:1"] = {
    ...state(0, pageUrl, "main-document"),
    siteClearId: "cleared",
  };
  const connected = await service().connect(1);
  expect(connected.siteClearId).toBe("cleared");
  expect(connected.config.rules).toEqual([]);
  expect(frames.get(0)!.config.rules).toEqual([]);
  expect(local[draftKey(pageUrl)]).toBeUndefined();
});

it.each([
  "chrome://newtab/",
  "https://chromewebstore.google.com/detail/test",
  "https://chrome.google.com/webstore?test",
])("blocks injection on %s", async (url) => {
  getTab.mockResolvedValueOnce({ url });
  await expect(service().connect(1)).rejects.toMatchObject({
    reason: "unsupported-page",
  });
  expect(executeScript).not.toHaveBeenCalled();
});

it("distinguishes a Chrome permission denial from an unexpected injection failure", async () => {
  executeScript
    .mockRejectedValueOnce(
      new Error(
        'Cannot access contents of url "https://example.test/article". Extension manifest must request permission to access this host.',
      ),
    )
    .mockRejectedValueOnce(new Error("Could not load file: inspector.js"));
  await expect(service().connect(1)).rejects.toMatchObject({
    reason: "access-required",
  });
  await expect(service().connect(1)).rejects.toThrow(
    "Could not load file: inspector.js",
  );
});

it("blocks a full-page PDF even when Chrome injects into the outer document", async () => {
  executeScript.mockResolvedValueOnce([
    { frameId: 0, result: pdfViewerInjectionResult },
  ]);
  await expect(service().connect(1)).rejects.toMatchObject({
    reason: "unsupported-page",
  });
  expect(session["frames:1"]).toBeUndefined();
});

it("keeps a rule on the second live iframe when two frames have the same URL", async () => {
  saveLiveSession();
  const connected = await service().connect(1);
  expect(connected.config.rules[0]).toMatchObject({
    frameId: 8,
    enabled: true,
    handle: "old-handle",
  });
  expect(connected.restorationWarnings).toEqual([]);
  expect(
    commands
      .filter(({ request }) => request.type !== "inspect")
      .every(({ request }) => request.type === "apply"),
  ).toBe(true);
  expect(commands.at(-1)).toMatchObject({
    frameId: 8,
    request: { type: "inspect" },
  });
});

it("pauses a duplicate-URL frame rule after a new top-level document", async () => {
  saveLiveSession();
  frames.get(0)!.documentToken = "new-main-document";
  const connected = await service().connect(1);
  expect(connected.config.rules[0]).toMatchObject({
    frameId: 2147483647,
    enabled: false,
  });
  expect(connected.restorationWarnings).toEqual([
    expect.stringContaining("matches more than one frame"),
  ]);
});

it("does not transfer a removed frame's rule to its surviving same-URL sibling", async () => {
  saveLiveSession();
  frames.delete(8);
  const connected = await service().connect(1);
  expect(connected.config.rules[0]).toMatchObject({
    frameId: 2147483647,
    enabled: false,
  });
  expect(connected.restorationWarnings).toEqual([
    expect.stringContaining("was not found"),
  ]);
  expect(frames.get(5)!.config.rules.every((rule) => rule.frameId !== 5)).toBe(
    true,
  );
});

it("rebinds a durable frame draft only when the frame URL is unique", async () => {
  local[draftKey(pageUrl)] = { config: config() };
  frames.delete(8);
  const connected = await service().connect(1);
  expect(connected.config.rules[0]).toMatchObject({
    frameId: 5,
    enabled: true,
  });
  expect(commands.find(({ frameId }) => frameId === 5)!.request.type).toBe(
    "restore",
  );
});

it("restores a replaced child document without moving its rule to an identical sibling", async () => {
  saveLiveSession();
  frames.get(8)!.documentToken = "replacement-document";
  await service().connect(1);
  expect(commands.find(({ frameId }) => frameId === 8)!.request.type).toBe(
    "restore",
  );
  expect(commands.find(({ frameId }) => frameId === 5)!.request.type).toBe(
    "apply",
  );
});

it("clears an existing session on a SPA route with no draft and restores its saved route on return", async () => {
  saveLiveSession();
  local[draftKey(pageUrl)] = { config: config(0) };
  frames.get(0)!.selection = {
    handle: "old-pick",
    selector: "h1",
    tag: "h1",
    classes: [],
    identity: "h1",
    width: 200,
    height: 50,
    computed: {},
    frameId: 0,
    url: pageUrl,
  };
  frames.get(0)!.url = `${pageUrl}?next`;
  const sessions = service();
  await sessions.restoreTab({
    id: 1,
    url: frames.get(0)!.url,
  } as chrome.tabs.Tab);
  expect((session["tab:1"] as TabState).config).toEqual(emptyConfig());
  expect((session["tab:1"] as TabState).selection).toBeUndefined();
  expect(
    commands.filter(({ request }) => request.type === "clear-selection"),
  ).toHaveLength(3);
  frames.get(0)!.url = pageUrl;
  await sessions.restoreTab({ id: 1, url: pageUrl } as chrome.tabs.Tab);
  expect(
    (session["tab:1"] as TabState).config.rules[0]!.properties["font-size"],
  ).toBe("41px");
  expect(commands.some(({ request }) => request.type === "restore")).toBe(true);
});

it("restores a browser draft with fresh session storage only after existing site access is confirmed", async () => {
  local[draftKey(pageUrl)] = { config: config(0) };
  permitted = false;
  const sessions = service();
  await sessions.restoreTab({ id: 1, url: pageUrl } as chrome.tabs.Tab);
  expect(commands).toEqual([]);
  permitted = true;
  await sessions.restoreTab({ id: 1, url: pageUrl } as chrome.tabs.Tab);
  expect(
    (session["tab:1"] as TabState).config.rules[0]!.properties["font-size"],
  ).toBe("41px");
  expect(commands[0]!.request.type).toBe("restore");
});

it.each(["exact", "selector"] as const)(
  "restores a persisted %s rule with zero typography changes",
  async (mode) => {
    const saved = config(0);
    saved.rules[0]!.mode = mode;
    saved.rules[0]!.handle = undefined;
    saved.rules[0]!.properties = {};
    local[draftKey(pageUrl)] = { config: saved };
    const restored = await service().connect(1);
    expect(restored.config.rules).toHaveLength(1);
    expect(restored.config.rules[0]).toMatchObject({
      id: "rule",
      mode,
      selector: "h1",
      enabled: true,
      properties: {},
    });
    expect(restored.restorationWarnings).toEqual([]);
  },
);

it("keeps rebound iframe handles canonical across repeated reconnects", async () => {
  saveLiveSession();
  frames.get(8)!.documentToken = "replacement-document";
  const sessions = service();
  const restored = await sessions.connect(1);
  expect(restored.config.rules[0]!.handle).toBe("rebound-replacement-document");
  expect(frames.get(0)!.config).toEqual(restored.config);
  expect((await sessions.connect(1)).config).toEqual(restored.config);
  expect((await sessions.connect(1)).config).toEqual(restored.config);
});

it.each([false, true])(
  "restores the remembered rule ID from a page draft (live session: %s)",
  async (live) => {
    const saved = config(0);
    saved.rules.push({
      ...saved.rules[0]!,
      id: "active",
      selector: "p",
      mode: "selector",
      handle: undefined,
    });
    if (live) {
      saveLiveSession();
      Object.assign(session["tab:1"]!, {
        config: saved,
        activeRuleId: "active",
      });
    } else local[draftKey(pageUrl)] = { config: saved, activeRuleId: "active" };
    const connected = await service().connect(1);
    expect(connected.activeRuleId).toBe("active");
    expect(connected.selection?.selector).toBe("p");
    expect(
      commands.some(
        ({ request }) => request.type === "inspect" && request.selector === "p",
      ),
    ).toBe(true);
    expect(local[draftKey(pageUrl)]).toMatchObject({ activeRuleId: "active" });
  },
);

it("falls back to a saved rule when the remembered rule was deleted", async () => {
  local[draftKey(pageUrl)] = { config: config(0), activeRuleId: "deleted" };
  const connected = await service().connect(1);
  expect(connected.activeRuleId).toBe("rule");
});

it("does not restore an orphaned pick when there are no saved rules", async () => {
  frames.get(0)!.selection = {
    handle: "orphan",
    selector: ".skip-link",
    tag: "a",
    classes: [],
    identity: "a",
    width: 1,
    height: 1,
    computed: {},
    frameId: 0,
    url: pageUrl,
  };
  const connected = await service().connect(1);
  expect(connected.activeRuleId).toBeUndefined();
  expect(connected.selection).toBeUndefined();
});
