import type { Target } from "../core/schema";
import { onMounted, onUnmounted, watch, type Ref } from "vue";

export function useTargetHighlight(
  tabId: Ref<number | undefined>,
  connected: Ref<boolean>,
  picking: Ref<boolean>,
) {
  let port: chrome.runtime.Port | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  function clearHighlight() {
    generation++;
    clearTimeout(timer);
    port?.disconnect();
    port = undefined;
  }

  function highlightTarget(targets?: Target[], frameId = 0) {
    clearHighlight();
    if (
      !targets?.length ||
      !connected.value ||
      picking.value ||
      tabId.value === undefined
    )
      return;
    const current = generation;
    const id = tabId.value;
    timer = setTimeout(() => {
      if (current !== generation) return;
      try {
        const active = chrome.tabs.connect(id, {
          frameId,
          name: "fontzie-highlight",
        });
        port = active;
        active.onDisconnect.addListener(() => {
          // A navigation or a revoked grant can close the port at any time.
          void chrome.runtime.lastError;
          if (port === active) port = undefined;
        });
        active.postMessage({ targets });
      } catch {
        clearHighlight();
      }
    }, 60);
  }

  const onVisibility = () => {
    if (document.hidden) clearHighlight();
  };
  watch([tabId, connected, picking], clearHighlight, { flush: "sync" });
  onMounted(() => {
    window.addEventListener("blur", clearHighlight);
    window.addEventListener("pagehide", clearHighlight);
    document.addEventListener("visibilitychange", onVisibility);
  });
  onUnmounted(() => {
    clearHighlight();
    window.removeEventListener("blur", clearHighlight);
    window.removeEventListener("pagehide", clearHighlight);
    document.removeEventListener("visibilitychange", onVisibility);
  });
  return { highlightTarget, clearHighlight };
}
