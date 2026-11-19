import { ref } from "vue";
import { z } from "zod";
import { unwrapResponse } from "../core/messages";
import type { Fontzie } from "./useFontzie";
export function useDataReset(app: Fontzie, resetFeatures: () => void) {
  const dataRevision = ref(0);
  async function clearData() {
    const result = z.object({ reloadTabs: z.array(z.number()) }).parse(
      unwrapResponse(
        await chrome.runtime.sendMessage({
          channel: "fontzie-library",
          type: "clear-data",
        }),
      ),
    );
    resetFeatures();
    dataRevision.value++;
    if (
      app.tabId.value === undefined ||
      !result.reloadTabs.includes(app.tabId.value)
    )
      await app.connect(app.tabId.value);
    const count = result.reloadTabs.length;
    app.status.value = count
      ? `Fontzie data cleared. Reload ${count} open ${count === 1 ? "tab" : "tabs"} to remove the remaining preview.`
      : "Fontzie data cleared.";
  }
  return { dataRevision, clearData };
}
