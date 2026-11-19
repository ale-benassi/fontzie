import { onMounted, ref, watch } from "vue";
import type { Fontzie } from "./useFontzie";
export function useEditorPosition({
  tabId,
  report,
  connected,
  picking,
  togglePick,
  captureOwner,
  historyForMove,
}: Fontzie) {
  const isFloating = new URLSearchParams(location.search).has("floating");
  const floatingMinimized = ref(false);
  const floatingOpening = ref(false);
  async function editorAction(action: "float" | "dock" | "close") {
    const ownsPage = captureOwner();
    if (picking.value) {
      await togglePick();
      if (!ownsPage()) return;
    }
    if (action === "float") floatingOpening.value = true;
    try {
      const result = await chrome.runtime.sendMessage({
        channel: "fontzie-editor",
        action,
        tabId: tabId.value,
        history: action === "close" ? undefined : historyForMove(),
      });
      if (!result?.ok)
        throw Error(result?.error ?? "Could not change editor position.");
    } catch (error) {
      report(error);
    } finally {
      floatingOpening.value = false;
    }
  }
  async function minimizeFloating() {
    const ownsPage = captureOwner();
    if (picking.value) {
      await togglePick();
      if (!ownsPage()) return;
    }
    floatingMinimized.value = !floatingMinimized.value;
    window.parent.postMessage(
      {
        channel: "fontzie-floating-ui",
        token: location.hash.slice(1),
        type: "minimize",
        value: floatingMinimized.value,
      },
      "*",
    );
  }
  watch(connected, (value) => {
    if (value && isFloating)
      window.parent.postMessage(
        {
          channel: "fontzie-floating-ui",
          token: location.hash.slice(1),
          type: "ready",
        },
        "*",
      );
  });
  onMounted(() =>
    document.body.classList.toggle("floating-editor", isFloating),
  );
  return {
    isFloating,
    floatingMinimized,
    floatingOpening,
    editorAction,
    minimizeFloating,
  };
}
