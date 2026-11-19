import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ref } from "vue";
import { emptyConfig } from "../../core/schema";
import { useTabConnection } from "../../composables/useTabConnection";
const lifecycle = vi.hoisted(() => ({
  mounted: [] as Array<() => void | Promise<void>>,
  unmounted: [] as Array<() => void>,
}));
vi.mock("vue", async () => ({
  ...(await vi.importActual("vue")),
  onMounted: (fn: () => void | Promise<void>) => lifecycle.mounted.push(fn),
  onUnmounted: (fn: () => void) => lifecycle.unmounted.push(fn),
}));
const sendMessage = vi.fn(),
  query = vi.fn(),
  getTab = vi.fn(),
  requestPermission = vi.fn(),
  containsPermission = vi.fn();
const events = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
let runtime: ReturnType<typeof events>,
  activated: ReturnType<typeof events>,
  updated: ReturnType<typeof events>,
  storageChanged: ReturnType<typeof events>,
  permissionAdded: ReturnType<typeof events>,
  permissionRemoved: ReturnType<typeof events>;
const state = (id: number) => ({
  config: emptyConfig(),
  url: `https://site${id}.test/`,
  title: `Tab ${id}`,
  frameId: 0,
  frames: [0],
});
function setup() {
  const error = ref(""),
    busy = ref(false),
    status = ref("");
  const onDisconnected = vi.fn(),
    onConnected = vi.fn(),
    onEvent = vi.fn(),
    initialize = vi.fn().mockResolvedValue(undefined);
  const connection = useTabConnection({
    error,
    busy,
    status,
    onDisconnected,
    onConnected,
    onEvent,
    initialize,
    report: (value) => {
      error.value = String(value);
    },
  });
  return {
    ...connection,
    error,
    busy,
    status,
    onDisconnected,
    onConnected,
    onEvent,
    initialize,
  };
}
beforeEach(() => {
  lifecycle.mounted.length = lifecycle.unmounted.length = 0;
  sendMessage.mockReset().mockImplementation(async (message) => ({
    ok: true,
    data: message.type === "connect" ? state(message.tabId) : { count: 1 },
  }));
  query.mockReset().mockResolvedValue([{ id: 1 }]);
  getTab
    .mockReset()
    .mockImplementation(async (id) => ({ id, url: `https://site${id}.test/` }));
  requestPermission.mockReset().mockResolvedValue(true);
  containsPermission.mockReset().mockResolvedValue(false);
  runtime = events();
  activated = events();
  updated = events();
  storageChanged = events();
  permissionAdded = events();
  permissionRemoved = events();
  vi.stubGlobal("location", { search: "?tab=1" });
  vi.stubGlobal("chrome", {
    runtime: { sendMessage, onMessage: runtime },
    tabs: { query, get: getTab, onActivated: activated, onUpdated: updated },
    storage: { onChanged: storageChanged },
    permissions: {
      request: requestPermission,
      contains: containsPermission,
      onAdded: permissionAdded,
      onRemoved: permissionRemoved,
    },
    windows: { getCurrent: vi.fn().mockResolvedValue({ id: 11 }) },
  });
});
afterEach(() => {
  lifecycle.unmounted.forEach((fn) => fn());
  vi.unstubAllGlobals();
});
it("initializes appearance before connecting and cleans up tab listeners", async () => {
  const app = setup();
  await lifecycle.mounted[0]!();
  expect(app.initialize).toHaveBeenCalledOnce();
  expect(app.connected.value).toBe(true);
  expect(app.url.value).toBe("https://site1.test/");
  expect(app.onConnected).toHaveBeenCalledWith(state(1));
  lifecycle.unmounted[0]!();
  expect(runtime.removeListener).toHaveBeenCalledWith(
    runtime.addListener.mock.calls[0]![0],
  );
  expect(activated.removeListener).toHaveBeenCalled();
  expect(updated.removeListener).toHaveBeenCalled();
  expect(storageChanged.removeListener).toHaveBeenCalled();
  expect(permissionAdded.removeListener).toHaveBeenCalled();
  expect(permissionRemoved.removeListener).toHaveBeenCalled();
});

const broadAccess = { origins: ["http://*/*", "https://*/*"] };

it("connects an open tab after granting access to all websites", async () => {
  sendMessage.mockResolvedValueOnce({
    ok: false,
    error: "Access required",
    connectionBlock: "access-required",
  });
  const app = setup();
  await lifecycle.mounted[0]!();
  expect(app.connected.value).toBe(false);
  expect(app.allSitesAllowed.value).toBe(false);
  expect(requestPermission).not.toHaveBeenCalled();
  containsPermission.mockResolvedValue(true);
  await app.allowAllSites();
  expect(requestPermission).toHaveBeenCalledExactlyOnceWith(broadAccess);
  expect(app.allSitesAllowed.value).toBe(true);
  expect(app.connected.value).toBe(true);
});

it("keeps access off and reports when Chrome declines the grant", async () => {
  const app = setup();
  await lifecycle.mounted[0]!();
  requestPermission.mockResolvedValueOnce(false);
  await app.allowAllSites();
  expect(app.allSitesAllowed.value).toBe(false);
  expect(app.changingAllSites.value).toBe(false);
  expect(app.allSitesError.value).toBe("Access to all websites was declined.");
  expect(app.error.value).toBe("");
  expect(sendMessage).toHaveBeenCalledOnce();
});

it("rechecks the current tab when broad access is revoked in Chrome", async () => {
  containsPermission.mockResolvedValue(true);
  const app = setup();
  await lifecycle.mounted[0]!();
  expect(app.allSitesAllowed.value).toBe(true);
  containsPermission.mockResolvedValue(false);
  sendMessage.mockResolvedValueOnce({
    ok: false,
    error: "Access required",
    connectionBlock: "access-required",
  });
  permissionRemoved.addListener.mock.calls[0]![0](broadAccess);
  await vi.waitFor(() =>
    expect(app.connectionIssue.value).toBe("access-required"),
  );
  expect(app.allSitesAllowed.value).toBe(false);
});
it("ignores an older connection response after switching tabs", async () => {
  let finish!: (value: unknown) => void;
  sendMessage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const app = setup();
  const first = app.connect(1);
  await app.connect(2);
  finish({
    ok: false,
    error: "An obsolete connection failed",
    connectionBlock: "access-required",
  });
  await first;
  expect(app.tabId.value).toBe(2);
  expect(app.url.value).toBe("https://site2.test/");
  expect(app.onConnected).toHaveBeenCalledTimes(1);
  expect(app.connectionIssue.value).toBeUndefined();
  expect(app.busy.value).toBe(false);
});
it("ignores an older active-tab lookup after an explicit tab connection", async () => {
  let finish!: (value: unknown) => void;
  query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const app = setup();
  const first = app.connect();
  await app.connect(2);
  finish([{ id: 1 }]);
  await first;
  expect(app.tabId.value).toBe(2);
  expect(sendMessage).toHaveBeenCalledTimes(1);
});
it("routes page events only to the connected tab and preserves frame routing", async () => {
  const app = setup();
  await lifecycle.mounted[0]!();
  const listener = runtime.addListener.mock.calls[0]![0];
  listener({ channel: "fontzie-event", tabId: 2, data: { type: "cancel" } });
  expect(app.onEvent).not.toHaveBeenCalled();
  const message = {
    channel: "fontzie-event",
    tabId: 1,
    frameId: 0,
    data: { type: "cancel" },
  };
  listener(message);
  expect(app.onEvent).toHaveBeenCalledWith(message);
  app.frameId.value = 7;
  await app.request("request", { type: "inspect", selector: "h1" });
  expect(sendMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      tabId: 1,
      frameId: 7,
      request: { type: "inspect", selector: "h1" },
    }),
  );
});

it("does not attach listeners if initialization finishes after the editor closes", async () => {
  let finish!: () => void;
  const app = setup();
  app.initialize.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const mounting = lifecycle.mounted[0]!();
  lifecycle.unmounted[0]!();
  finish();
  await mounting;
  expect(runtime.addListener).not.toHaveBeenCalled();
  expect(sendMessage).not.toHaveBeenCalled();
});

it("clears the previous page and frame details immediately when a tab switch fails", async () => {
  const app = setup();
  await app.connect(1);
  app.frameId.value = 7;
  app.frames.value = [0, 7];
  app.status.value = "Page edits restored.";
  let fail!: (reason: Error) => void;
  sendMessage.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const switching = app.connect(2);
  expect(app.connected.value).toBe(false);
  expect(app.tabId.value).toBe(2);
  expect(app.url.value).toBe("");
  expect(app.title.value).toBe("Choose a website");
  expect(app.frames.value).toEqual([0]);
  expect(app.frameId.value).toBe(0);
  expect(app.status.value).toBe("");
  expect(app.onDisconnected).toHaveBeenCalledTimes(2);
  fail(new Error("Site access required"));
  await switching;
  expect(app.url.value).toBe("");
  expect(app.error.value).toContain("Site access required");
  expect(app.busy.value).toBe(false);
  await app.connect(1);
  expect(app.connected.value).toBe(true);
  expect(app.url.value).toBe("https://site1.test/");
});

it("only requests persistent access for the connected origin", async () => {
  const app = setup();
  await app.connect(1);
  sendMessage.mockRejectedValueOnce(new Error("Site access required"));
  await app.connect(2);
  await app.allowSite();
  expect(requestPermission).not.toHaveBeenCalled();
  await app.connect(2);
  await app.allowSite();
  expect(getTab).toHaveBeenCalledWith(2);
  expect(requestPermission).toHaveBeenCalledWith({
    origins: ["https://site2.test/*"],
  });
  expect(app.tabId.value).toBe(2);
  expect(app.connected.value).toBe(true);
});

it("does not request access for a tab after switching away during its lookup", async () => {
  const app = setup();
  await app.connect(1);
  let finish!: (tab: unknown) => void;
  getTab.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const allowing = app.allowSite();
  await app.connect(2);
  finish({ id: 1, url: "https://site1.test/" });
  await allowing;
  expect(requestPermission).not.toHaveBeenCalled();
  expect(app.tabId.value).toBe(2);
  expect(app.url.value).toBe("https://site2.test/");
});

it("does not reconnect an old tab after its permission request completes", async () => {
  const app = setup();
  await app.connect(1);
  let finish!: (granted: boolean) => void;
  requestPermission.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const allowing = app.allowSite();
  await vi.waitFor(() => expect(requestPermission).toHaveBeenCalled());
  await app.connect(2);
  finish(true);
  await allowing;
  expect(app.tabId.value).toBe(2);
  expect(app.url.value).toBe("https://site2.test/");
});

it("does not reuse the previous tab when the active tab lookup is empty", async () => {
  const app = setup();
  await app.connect(1);
  query.mockResolvedValueOnce([]);
  sendMessage.mockClear();
  await app.connect();
  expect(app.tabId.value).toBeUndefined();
  expect(app.connected.value).toBe(false);
  expect(app.url.value).toBe("");
  expect(sendMessage).not.toHaveBeenCalled();
  expect(app.connectionIssue.value).toBe("unsupported-page");
  expect(app.error.value).toBe("");
});

it("does not request access if the tab's origin changes before the prompt", async () => {
  const app = setup();
  await app.connect(1);
  getTab.mockResolvedValueOnce({
    id: 1,
    url: state(1).url,
    pendingUrl: state(2).url,
  });
  await app.allowSite();
  expect(requestPermission).not.toHaveBeenCalled();
  expect(app.error.value).toContain("The website changed");
});

it.each(["unsupported-page", "access-required"])(
  "treats %s as guidance without a retry or permission request",
  async (connectionBlock) => {
    sendMessage.mockResolvedValueOnce({
      ok: false,
      connectionBlock,
      error: "The wording does not determine the reason.",
    });
    const app = setup();
    await app.connect(1);
    await app.retry();
    await app.allowSite();
    expect(app.connectionIssue.value).toBe(connectionBlock);
    expect(app.error.value).toBe("");
    expect(app.siteOrigin.value).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
  },
);

it("can retry a transient failure once while another attempt is in progress", async () => {
  sendMessage.mockRejectedValueOnce(new Error("Inspector did not respond"));
  const app = setup();
  await app.connect(1);
  expect(app.connectionIssue.value).toBe("failed");
  expect(app.error.value).toContain("Inspector did not respond");
  const retrying = app.retry();
  expect(app.busy.value).toBe(true);
  expect(app.connectionIssue.value).toBeUndefined();
  await app.retry();
  await retrying;
  expect(sendMessage).toHaveBeenCalledTimes(2);
  expect(app.connected.value).toBe(true);
  expect(app.siteOrigin.value).toBe("https://site1.test");
});

it("keeps temporary access when persistent access is declined", async () => {
  const app = setup();
  await app.connect(1);
  requestPermission.mockResolvedValueOnce(false);
  await app.allowSite();
  expect(app.connected.value).toBe(true);
  expect(app.allowingSite.value).toBe(false);
  expect(app.error.value).toContain("Site access was declined");
  expect(sendMessage).toHaveBeenCalledOnce();
});

it("keeps a docked editor in its owning window for activation and toolbar events", async () => {
  vi.stubGlobal("location", { search: "" });
  getTab.mockImplementation(async (id) => ({
    id,
    windowId: id === 3 ? 22 : 11,
    url: `https://site${id}.test/`,
  }));
  const app = setup();
  await lifecycle.mounted[0]!();
  expect(query).toHaveBeenLastCalledWith({ active: true, windowId: 11 });
  const activate = activated.addListener.mock.calls[0]![0];
  const message = runtime.addListener.mock.calls[0]![0];
  sendMessage.mockClear();
  activate({ tabId: 3, windowId: 22 });
  message({ channel: "fontzie-action", tabId: 3 });
  await Promise.resolve();
  expect(sendMessage).not.toHaveBeenCalled();
  expect(app.tabId.value).toBe(1);
  activate({ tabId: 2, windowId: 11 });
  await vi.waitFor(() => expect(app.url.value).toBe("https://site2.test/"));
  message({ channel: "fontzie-action", tabId: 1 });
  await vi.waitFor(() => expect(app.url.value).toBe("https://site1.test/"));
});

it("does not retarget a pinned editor when another tab's toolbar is clicked", async () => {
  const app = setup();
  await lifecycle.mounted[0]!();
  sendMessage.mockClear();
  runtime.addListener.mock.calls[0]![0]({
    channel: "fontzie-action",
    tabId: 2,
  });
  expect(sendMessage).not.toHaveBeenCalled();
  expect(app.tabId.value).toBe(1);
});

it("invalidates the previous document as soon as navigation starts", async () => {
  const app = setup();
  await lifecycle.mounted[0]!();
  const update = updated.addListener.mock.calls[0]![0];
  update(1, { status: "loading" }, { id: 1, status: "loading" });
  expect(app.connected.value).toBe(false);
  expect(app.busy.value).toBe(true);
  expect(app.onDisconnected).toHaveBeenCalledTimes(2);
  update(1, { status: "complete" }, { id: 1, status: "complete" });
  await vi.waitFor(() => expect(app.connected.value).toBe(true));
});
