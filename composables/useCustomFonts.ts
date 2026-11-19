import { computed, onMounted, onScopeDispose, ref } from "vue";
import {
  allFaces,
  groupFamilies,
  type CustomFontMetadata,
} from "../storage/fonts";
import { CUSTOM_FONTS_REVISION_KEY } from "../core/fonts";
import { tabStateSchema, unwrapResponse } from "../core/messages";
import type { Fontzie } from "./useFontzie";

export function useCustomFonts(app: Fontzie) {
  const customFaces = ref<CustomFontMetadata[]>([]);
  const custom = computed(() => groupFamilies(customFaces.value));
  let generation = 0;
  async function reloadCustom() {
    const current = ++generation;
    const faces = await allFaces();
    if (current === generation) {
      customFaces.value = faces;
      app.reconcileFontHistory(custom.value);
    }
  }
  async function refreshCustom() {
    const ownsPage = app.captureOwner();
    const tabId = app.tabId.value;
    await reloadCustom();
    if (tabId === undefined) return;
    const result = unwrapResponse(
      await chrome.runtime.sendMessage({
        channel: "fontzie-library",
        type: "reconcile-fonts",
        tabId,
      }),
    );
    if (result && ownsPage()) app.syncCustomFontRules(custom.value);
  }
  const changed = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === "local" && changes[CUSTOM_FONTS_REVISION_KEY])
      void reloadCustom().catch(app.report);
    // Another editor can delete a file used on this tab. Wait for the worker’s
    // successful page apply, and only reconcile fonts in the current editor.
    if (area !== "session" || !app.connected.value) return;
    const change = changes[`tab:${app.tabId.value}`];
    if (!change?.newValue) return;
    const customIds = new Set(
      app.config.value.rules
        .filter((rule) => rule.font?.provider === "custom")
        .map((rule) => rule.id),
    );
    if (!customIds.size) return;
    const stored = tabStateSchema.safeParse(change.newValue);
    if (
      !stored.success ||
      stored.data.url !== app.url.value ||
      !stored.data.config.rules.some(
        (rule) => !rule.font && customIds.has(rule.id),
      )
    )
      return;
    const ownsPage = app.captureOwner();
    void reloadCustom()
      .then(() => {
        if (ownsPage()) app.syncCustomFontRules(custom.value);
      })
      .catch(app.report);
  };
  chrome.storage.onChanged.addListener(changed);
  onMounted(() => reloadCustom().catch(app.report));
  onScopeDispose(() => {
    generation++;
    chrome.storage.onChanged.removeListener(changed);
  });
  return { customFaces, custom, reloadCustom: refreshCustom };
}
