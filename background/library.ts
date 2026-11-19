import { allFaces, groupFamilies, clearFonts } from "../storage/fonts";
import type { Config } from "../core/schema";
import { reconcileCustomFonts } from "../core/font-rules";
import { withStorageLock } from "../storage/mutations";
import type { createPanelService } from "./panel";
export function createLibraryService(
  panel: ReturnType<typeof createPanelService>,
) {
  async function reconcileFonts(currentTabId: number) {
    const states = await chrome.storage.session.get(null);
    let current: Config | undefined;
    for (const key of Object.keys(states)) {
      if (!key.startsWith("tab:")) continue;
      const tabId = Number(key.slice(4));
      let changed = false;
      try {
        const config = await panel.updateConfig(tabId, async (previous) => {
          if (!previous.rules.some((rule) => rule.font?.provider === "custom"))
            return;
          const families = groupFamilies(await allFaces());
          const next = reconcileCustomFonts(previous, families);
          changed = next !== previous;
          // Replacements can change bytes without changing rule metadata.
          // Apply again so every engine checks the custom-font revision.
          return next;
        });
        if (tabId === currentTabId && changed) current = config;
      } catch (error) {
        if (tabId === currentTabId) throw error;
      }
    }
    return current;
  }
  function clearData() {
    return withStorageLock(() =>
      panel.clearAllData(async () => {
        await clearFonts();
        await chrome.storage.local.clear();
        await chrome.storage.session.clear();
      }),
    );
  }
  return { reconcileFonts, clearData };
}
