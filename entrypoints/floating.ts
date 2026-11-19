import { radiusDeclarations } from "../core/ui-radii";
import { randomToken } from "../core/random-token";
import { dismissFloatingEditor } from "../content/dismiss-floating-editor";

// The editor stays in an extension-origin iframe. The website only hosts its shell.
export default defineUnlistedScript(() => {
  const global = globalThis as typeof globalThis & {
    __fontzieFloating?: {
      show: (tabId: number) => Promise<void>;
      hide: () => void;
    };
  };
  if (global.__fontzieFloating) return;
  dismissFloatingEditor();
  let host: HTMLElement | undefined;
  let frame: HTMLIFrameElement | undefined;
  let token = "";
  let minimized = false;
  let ready: (() => void) | undefined;
  let failed: ((error: Error) => void) | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let contextTimer: ReturnType<typeof setInterval> | undefined;
  let opening: Promise<void> | undefined;
  let generation = 0;
  let geometry = { x: 0, y: 16, width: 400, height: 720 };
  function layout() {
    if (!host) return;
    geometry.width = Math.min(
      Math.max(320, geometry.width),
      Math.max(240, Math.min(520, innerWidth - 16)),
    );
    geometry.height = Math.min(
      Math.max(360, geometry.height),
      Math.max(200, innerHeight - 16),
    );
    const width = minimized ? 240 : geometry.width;
    const height = minimized ? 40 : geometry.height;
    geometry.x = Math.max(8, Math.min(geometry.x, innerWidth - width - 8));
    geometry.y = Math.max(8, Math.min(geometry.y, innerHeight - height - 8));
    Object.assign(host.style, {
      left: `${geometry.x}px`,
      top: `${geometry.y}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
  }
  const hide = () => {
    generation++;
    opening = undefined;
    clearInterval(contextTimer);
    clearTimeout(readyTimer);
    failed?.(Error("Floating editor closed before connecting."));
    ready = undefined;
    failed = undefined;
    host?.remove();
    host = undefined;
    frame = undefined;
  };
  function show(tabId: number): Promise<void> {
    if (opening) return opening;
    if (host?.isConnected) {
      host.showPopover();
      return Promise.resolve();
    }
    const current = generation;
    opening = mount(tabId, current).finally(() => {
      if (generation === current) opening = undefined;
    });
    return opening;
  }
  async function mount(tabId: number, current: number) {
    const stored = (await chrome.storage.local.get("floatingGeometry"))
      .floatingGeometry as Partial<typeof geometry> | undefined;
    if (current !== generation)
      throw Error("Floating editor closed before connecting.");
    geometry = {
      x: innerWidth - 416,
      y: 16,
      width: 400,
      height: Math.min(720, innerHeight - 32),
    };
    if (
      stored &&
      [stored.x, stored.y, stored.width, stored.height].every(Number.isFinite)
    )
      geometry = stored as typeof geometry;
    minimized = false;
    token = randomToken();
    host = document.createElement("fontzie-editor");
    host.setAttribute("data-fontzie-ui", "");
    host.setAttribute("popover", "manual");
    host.style.cssText = `all:initial;${radiusDeclarations}position:fixed;inset:auto;margin:0;padding:0;border:1px solid #666666;border-radius:var(--radius-xl);overflow:hidden;z-index:2147483647;display:block;color-scheme:normal;`;
    const shadow = host.attachShadow({ mode: "closed" });
    frame = document.createElement("iframe");
    frame.title = "Fontzie floating editor";
    frame.allow = "clipboard-write";
    frame.src = `${chrome.runtime.getURL("sidepanel.html")}?tab=${tabId}&floating=1#${token}`;
    frame.style.cssText = "display:block;width:100%;height:100%;border:0;";
    const connected = new Promise<void>((resolve, reject) => {
      ready = () => {
        clearTimeout(readyTimer);
        ready = undefined;
        failed = undefined;
        resolve();
      };
      failed = reject;
      readyTimer = setTimeout(() => {
        const reject = failed;
        failed = undefined;
        hide();
        reject?.(
          Error(
            "The floating editor could not connect. Continue in the sidebar.",
          ),
        );
      }, 25000);
    });
    shadow.append(frame);
    document.documentElement.append(host);
    layout();
    host.showPopover();
    // Chrome can invalidate this script and its iframe without unloading the page.
    contextTimer = setInterval(() => {
      if (!chrome.runtime?.id || !host?.isConnected) hide();
    }, 1000);
    await connected;
  }
  window.addEventListener("message", (event) => {
    if (
      !event.isTrusted ||
      !frame ||
      event.source !== frame.contentWindow ||
      event.origin !== `chrome-extension://${chrome.runtime.id}`
    )
      return;
    const data = event.data;
    if (data?.channel !== "fontzie-floating-ui" || data.token !== token) return;
    if (data.type === "ready") {
      ready?.();
      return;
    }
    if (data.type === "move" || data.type === "resize") {
      if (
        ![data.dx, data.dy].every(Number.isFinite) ||
        Math.abs(data.dx) > 10000 ||
        Math.abs(data.dy) > 10000
      )
        return;
      if (data.type === "move") {
        geometry.x += data.dx;
        geometry.y += data.dy;
      } else {
        geometry.width += data.dx;
        geometry.height += data.dy;
      }
    } else if (data.type === "minimize") minimized = data.value === true;
    else if (data.type === "commit") {
      void chrome.storage.local.set({ floatingGeometry: geometry });
      return;
    } else return;
    layout();
  });
  window.addEventListener("resize", layout);
  global.__fontzieFloating = { show, hide };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      message?.channel !== "fontzie-floating"
    )
      return;
    if (message.action === "show" && Number.isInteger(message.tabId)) {
      show(message.tabId)
        .then(() => respond({ ok: true }))
        .catch((error) => respond({ ok: false, error: String(error) }));
      return true;
    }
  });
});
