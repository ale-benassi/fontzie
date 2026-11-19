import { onScopeDispose, ref, watch } from "vue";
import { defaultSettings, type Settings } from "../core/schema";
import { readSettings, patchSettings, mutateLibrary } from "../storage/config";
import { settingsSchema } from "../core/schema";
import type { SettingsCommand } from "../core/messages";

export function useAppearance() {
  const settings = ref(defaultSettings());
  const media = matchMedia("(prefers-color-scheme: dark)");
  const resolvedTheme = ref(media.matches ? "dark" : "light");
  function applyTheme() {
    resolvedTheme.value =
      settings.value.theme === "system"
        ? media.matches
          ? "dark"
          : "light"
        : settings.value.theme;
    document.documentElement.dataset.theme = resolvedTheme.value;
    document.documentElement.style.colorScheme = resolvedTheme.value;
  }
  applyTheme();
  watch(() => settings.value.theme, applyTheme);
  media.addEventListener("change", applyTheme);
  let revision = 0;
  const changed = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "local" || !changes.settings) return;
    revision++;
    const parsed = settingsSchema.safeParse(changes.settings.newValue ?? {});
    settings.value = parsed.success ? parsed.data : defaultSettings();
  };
  chrome.storage.onChanged.addListener(changed);
  async function refresh() {
    const startingRevision = revision;
    const saved = await readSettings();
    if (revision === startingRevision) settings.value = saved;
  }
  async function changeSettings(patch: Pick<Partial<Settings>, "theme">) {
    await patchSettings(patch);
    await refresh();
  }
  async function updateSettings(command: SettingsCommand) {
    await mutateLibrary(command);
    await refresh();
  }

  async function initialize() {
    await refresh();
    applyTheme();
  }
  onScopeDispose(() => {
    media.removeEventListener("change", applyTheme);
    chrome.storage.onChanged.removeListener(changed);
  });
  return { settings, changeSettings, updateSettings, initialize };
}
