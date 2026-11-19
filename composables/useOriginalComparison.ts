import { onMounted, onScopeDispose, ref, watch } from "vue";
import { unwrapResponse } from "../core/messages";
import type { Fontzie } from "./useFontzie";
export function useOriginalComparison(app: Fontzie) {
  const { connected, tabId, config, report } = app;
  const beforeActive = ref(false),
    beforeBusy = ref(false);
  let comparisonTab: number | undefined;
  async function requestBefore(before: boolean) {
    if (!connected.value || beforeBusy.value || before === beforeActive.value)
      return;
    const targetTab = tabId.value,
      startingConfig = config.value;
    const ownsPage = app.captureOwner();
    comparisonTab = targetTab;
    beforeBusy.value = true;
    try {
      unwrapResponse(
        await chrome.runtime.sendMessage({
          channel: "fontzie-panel",
          type: "request",
          tabId: targetTab,
          request: { type: "before", active: before },
        }),
      );
      if (
        ownsPage() &&
        tabId.value === targetTab &&
        config.value === startingConfig
      )
        beforeActive.value = before;
    } catch (error) {
      if (ownsPage()) report(error);
    } finally {
      beforeBusy.value = false;
    }
  }
  function endBefore() {
    if ((beforeActive.value || beforeBusy.value) && comparisonTab !== undefined)
      void chrome.runtime
        .sendMessage({
          channel: "fontzie-panel",
          type: "request",
          tabId: comparisonTab,
          request: { type: "before", active: false },
        })
        .catch(() => {});
    beforeActive.value = false;
  }
  watch(config, () => {
    beforeActive.value = false;
  });
  watch([tabId, connected], () => {
    if (!connected.value || tabId.value !== comparisonTab) endBefore();
  });
  onMounted(() => window.addEventListener("pagehide", endBefore));
  onScopeDispose(() => {
    endBefore();
    window.removeEventListener("pagehide", endBefore);
  });
  return { beforeActive, beforeBusy, requestBefore };
}
