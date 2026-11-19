export const TYPOGRAPHY_CLEANUP_KEY = "migration:remove-responsive-rules:v1";
export const REUSE_CLEANUP_KEY = "migration:remove-automatic-reuse:v1";

// Run in the worker under its library lock so cleanup cannot overwrite a settings edit.
export async function removeLegacyFontComparisons() {
  const cardKey = "panel:card:font-comparison";
  const saved = await chrome.storage.local.get(["settings", cardKey]);
  if (
    saved.settings &&
    typeof saved.settings === "object" &&
    "combinations" in saved.settings
  ) {
    const { combinations: _removed, ...settings } = saved.settings;
    await chrome.storage.local.set({ settings });
  }
  if (cardKey in saved) await chrome.storage.local.remove(cardKey);
}

export async function migrateStorage() {
  await migrateTypographyStorage();
  if ((await chrome.storage.local.get(REUSE_CLEANUP_KEY))[REUSE_CLEANUP_KEY])
    return;
  for (const area of [chrome.storage.local, chrome.storage.session]) {
    const saved = await area.get(null);
    const obsolete = Object.keys(saved).filter(
      (key) => key.startsWith("config:page:") || key.startsWith("config:site:"),
    );
    if (obsolete.length) await area.remove(obsolete);
    if (
      saved.settings &&
      typeof saved.settings === "object" &&
      "persistence" in saved.settings
    ) {
      const settings = Object.fromEntries(
        Object.entries(saved.settings).filter(([key]) => key !== "persistence"),
      );
      await area.set({ settings });
    }
    // Floating editor ownership now uses the same page key as automatic drafts.
    const floating = Object.fromEntries(
      Object.entries(saved)
        .filter(
          ([key, value]) =>
            key.startsWith("floating:") &&
            typeof value === "string" &&
            value.startsWith("config:page:"),
        )
        .map(([key, value]) => [
          key,
          (value as string).replace(/^config:/, "draft:"),
        ]),
    );
    if (Object.keys(floating).length) await area.set(floating);
  }
  await chrome.storage.local.set({ [REUSE_CLEANUP_KEY]: true });
}

// The unpublished prototype stored width-specific entries in several places.
// Drop those entries, retaining the ordinary typography and other saved data.
export function removeLegacyBreakpointEntries(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeLegacyBreakpointEntries);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "breakpoints")
        .map(([key, item]) => [key, removeLegacyBreakpointEntries(item)]),
    );
  return value;
}

async function migrateTypographyStorage() {
  if (
    (await chrome.storage.local.get(TYPOGRAPHY_CLEANUP_KEY))[
      TYPOGRAPHY_CLEANUP_KEY
    ]
  )
    return;
  for (const area of [chrome.storage.local, chrome.storage.session]) {
    const saved = await area.get(null);
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(saved)) {
      if (
        key === "presets" ||
        key === "config" ||
        key.startsWith("draft:") ||
        key.startsWith("tab:")
      )
        patch[key] = removeLegacyBreakpointEntries(value);
    }
    if (Object.keys(patch).length) await area.set(patch);
  }
  await chrome.storage.local.set({ [TYPOGRAPHY_CLEANUP_KEY]: true });
}
