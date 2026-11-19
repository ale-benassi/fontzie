import { computed, onMounted, onUnmounted, ref, type Ref } from "vue";
import type { ContentRequest } from "../core/schema";
import {
  connectedTabSchema,
  frameLocationsSchema,
  ConnectionBlocked,
  parseCommandResult,
  unwrapResponse,
  editorEventSchema,
  actionEventSchema,
  type ConnectedTab,
  type EditorEvent,
  type CommandResult,
} from "../core/messages";
import { errorMessage } from "../core/errors";
import { allWebsiteOrigins, inspectableWebsite } from "../core/site-access";
export type { ConnectedTab } from "../core/messages";
interface ConnectionOptions {
  busy: Ref<boolean>;
  error: Ref<string>;
  status: Ref<string>;
  report: (error: unknown) => void;
  initialize: () => Promise<void>;
  onDisconnected: () => void;
  onConnected: (state: ConnectedTab) => void;
  onEvent: (message: EditorEvent) => void;
}
export function useTabConnection({
  busy,
  error,
  status,
  report,
  initialize,
  onDisconnected,
  onConnected,
  onEvent,
}: ConnectionOptions) {
  const tabId = ref<number>(),
    url = ref(""),
    title = ref("Choose a website"),
    frames = ref<number[]>([0]),
    frameId = ref(0);
  const connected = ref(false);
  const connectionIssue = ref<ConnectionBlocked["reason"] | "failed">();
  const siteOrigin = computed(() =>
    connected.value ? inspectableWebsite(url.value)?.origin : undefined,
  );
  const allowingSite = ref(false);
  const allSitesAllowed = ref<boolean>();
  const changingAllSites = ref(false);
  const allSitesError = ref("");
  const allSitesPermission = { origins: allWebsiteOrigins };
  let connectionGeneration = 0;
  let permissionRevision = 0;
  let disposed = false;
  let ownerWindowId: number | undefined;
  let siteClearId: string | undefined;
  const pinnedTabId = () => {
    const id = new URLSearchParams(location.search).get("tab");
    return id === null ? undefined : Number(id);
  };
  function request(type: "connect"): Promise<ConnectedTab>;
  function request<R extends ContentRequest>(
    type: "request",
    command: R,
    targetFrame?: number,
  ): Promise<CommandResult<R>>;
  async function request(
    type: "connect" | "request",
    command?: ContentRequest,
    targetFrame = frameId.value,
  ) {
    if (tabId.value === undefined) throw Error("Choose a website first.");
    const result = await chrome.runtime.sendMessage({
      channel: "fontzie-panel",
      type,
      tabId: tabId.value,
      frameId: targetFrame,
      request: command ? JSON.parse(JSON.stringify(command)) : undefined,
      siteClearId,
    });
    return type === "connect"
      ? connectedTabSchema.parse(unwrapResponse(result))
      : parseCommandResult(command!, result);
  }

  function disconnect(id?: number) {
    connectionGeneration++;
    busy.value = true;
    error.value = "";
    connected.value = false;
    connectionIssue.value = undefined;
    allowingSite.value = false;
    tabId.value = id;
    url.value = "";
    title.value = "Choose a website";
    frames.value = [0];
    frameId.value = 0;
    status.value = "";
    onDisconnected();
    return connectionGeneration;
  }
  async function listFrames() {
    if (tabId.value === undefined) throw Error("Choose a website first.");
    const generation = connectionGeneration;
    const reply = await chrome.runtime.sendMessage({
      channel: "fontzie-panel",
      type: "list-frames",
      tabId: tabId.value,
    });
    const live = frameLocationsSchema.parse(unwrapResponse(reply));
    if (generation === connectionGeneration)
      frames.value = live.map((frame) => frame.id);
    return live;
  }
  async function connect(id?: number) {
    if (disposed) return;
    const generation = disconnect(id);
    try {
      if (id === undefined) {
        const [tab] = await chrome.tabs.query({
          active: true,
          ...(ownerWindowId === undefined
            ? { currentWindow: true }
            : { windowId: ownerWindowId }),
        });
        if (generation !== connectionGeneration) return;
        if (tab?.id) tabId.value = tab.id;
      }
      if (tabId.value === undefined) {
        connectionIssue.value = "unsupported-page";
        return;
      }
      const state = await request("connect");
      if (generation !== connectionGeneration) return;
      url.value = state.url;
      title.value = state.title;
      frames.value = state.frames;
      frameId.value = state.frameId;
      siteClearId = state.siteClearId;
      onConnected(state);
      connected.value = true;
    } catch (e) {
      if (generation !== connectionGeneration) return;
      connectionIssue.value =
        e instanceof ConnectionBlocked ? e.reason : "failed";
      if (connectionIssue.value === "failed") report(e);
    } finally {
      if (generation === connectionGeneration) busy.value = false;
    }
  }
  async function rememberRule(activeRuleId: string | undefined) {
    if (!connected.value || tabId.value === undefined) return;
    unwrapResponse(
      await chrome.runtime.sendMessage({
        channel: "fontzie-panel",
        type: "select-rule",
        tabId: tabId.value,
        pageUrl: url.value,
        activeRuleId,
      }),
    );
  }
  async function clearSite(origin: string | undefined) {
    const id = tabId.value;
    if (!origin || origin !== siteOrigin.value || id === undefined)
      throw Error("The website changed. Open Clear site edits again.");
    const generation = connectionGeneration;
    unwrapResponse(
      await chrome.runtime.sendMessage({
        channel: "fontzie-panel",
        type: "clear-site",
        tabId: id,
        siteOrigin: origin,
      }),
    );
    if (generation === connectionGeneration) await connect(id);
  }
  function sessionChanged(
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) {
    if (area !== "session" || tabId.value === undefined) return;
    const change = changes[`tab:${tabId.value}`];
    const next = change?.newValue as { siteClearId?: string } | undefined;
    if (next?.siteClearId && next.siteClearId !== siteClearId) {
      siteClearId = next.siteClearId;
      void connect(tabId.value);
    }
  }
  function retry() {
    if (connectionIssue.value === "failed" && !busy.value)
      return connect(tabId.value);
  }
  async function allowSite() {
    const owner = tabId.value;
    const origin = siteOrigin.value;
    if (owner === undefined || !origin || busy.value || allowingSite.value)
      return;
    const generation = connectionGeneration;
    allowingSite.value = true;
    try {
      const tab = await chrome.tabs.get(owner);
      if (generation !== connectionGeneration || disposed) return;
      if (
        inspectableWebsite(tab.url)?.origin !== origin ||
        (tab.pendingUrl &&
          inspectableWebsite(tab.pendingUrl)?.origin !== origin) ||
        (pinnedTabId() === undefined && tab.active === false)
      )
        throw Error("The website changed. Try again once Fontzie connects.");
      const granted = await chrome.permissions.request({
        origins: [`${origin}/*`],
      });
      if (generation !== connectionGeneration || disposed) return;
      if (!granted)
        throw Error("Site access was declined. You can keep editing this tab.");
      await connect(owner);
    } catch (e) {
      if (generation === connectionGeneration && !disposed) report(e);
    } finally {
      if (generation === connectionGeneration) allowingSite.value = false;
    }
  }
  async function refreshAllSitesAccess() {
    const revision = ++permissionRevision;
    try {
      const allowed = await chrome.permissions.contains(allSitesPermission);
      if (disposed || revision !== permissionRevision) return;
      const previous = allSitesAllowed.value;
      allSitesAllowed.value = allowed;
      if (previous !== allowed) allSitesError.value = "";
      if (
        previous !== undefined &&
        previous !== allowed &&
        (!allowed || !connected.value) &&
        tabId.value !== undefined
      )
        await connect(tabId.value);
    } catch (e) {
      if (!disposed && revision === permissionRevision)
        allSitesError.value = errorMessage(e);
    }
  }
  function permissionsChanged({ origins }: chrome.permissions.Permissions) {
    if (origins?.length) void refreshAllSitesAccess();
  }
  async function allowAllSites() {
    if (disposed || changingAllSites.value || allSitesAllowed.value !== false)
      return;
    changingAllSites.value = true;
    allSitesError.value = "";
    try {
      // Call request directly from the Settings button's user gesture.
      const granted = await chrome.permissions.request(allSitesPermission);
      if (disposed) return;
      if (!granted) throw Error("Access to all websites was declined.");
      await refreshAllSitesAccess();
    } catch (e) {
      if (!disposed) allSitesError.value = errorMessage(e);
    } finally {
      changingAllSites.value = false;
    }
  }
  const listener = (message: unknown) => {
    const action = actionEventSchema.safeParse(message);
    if (action.success) {
      const pinned = pinnedTabId();
      if (pinned !== undefined) {
        if (action.data.tabId === pinned) void connect(pinned);
      } else {
        const generation = connectionGeneration;
        void chrome.tabs
          .get(action.data.tabId)
          .then((tab) => {
            if (
              !disposed &&
              generation === connectionGeneration &&
              ownerWindowId !== undefined &&
              tab.windowId === ownerWindowId
            )
              void connect(action.data.tabId);
          })
          .catch(() => {});
      }
      return;
    }
    const event = editorEventSchema.safeParse(message);
    if (event.success && event.data.tabId === tabId.value) onEvent(event.data);
  };
  const activated = (info: { tabId: number; windowId: number }) => {
    if (pinnedTabId() !== undefined || info.windowId !== ownerWindowId) return;
    void connect(info.tabId);
  };
  const updated = (
    id: number,
    info: { status?: string; url?: string },
    tab: chrome.tabs.Tab,
  ) => {
    if (disposed || id !== tabId.value) return;
    if (info.status === "loading" || (info.url && tab.status !== "complete")) {
      disconnect(id);
      return;
    }
    if (info.status === "complete" || (info.url && tab.status === "complete"))
      void connect(id);
  };
  onMounted(async () => {
    try {
      await initialize();
      if (disposed) return;
      ownerWindowId = (await chrome.windows.getCurrent()).id;
      if (disposed) return;
      chrome.runtime.onMessage.addListener(listener);
      chrome.tabs.onActivated.addListener(activated);
      chrome.tabs.onUpdated.addListener(updated);
      chrome.storage.onChanged.addListener(sessionChanged);
      chrome.permissions.onAdded.addListener(permissionsChanged);
      chrome.permissions.onRemoved.addListener(permissionsChanged);
      void refreshAllSitesAccess();
      await connect(pinnedTabId());
    } catch (e) {
      if (!disposed) report(e);
    }
  });
  onUnmounted(() => {
    disposed = true;
    connectionGeneration++;
    chrome.runtime.onMessage.removeListener(listener);
    chrome.tabs.onActivated.removeListener(activated);
    chrome.tabs.onUpdated.removeListener(updated);
    chrome.storage.onChanged.removeListener(sessionChanged);
    chrome.permissions.onAdded.removeListener(permissionsChanged);
    chrome.permissions.onRemoved.removeListener(permissionsChanged);
  });

  return {
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
  };
}
