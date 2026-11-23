import { onScopeDispose, ref, watch } from "vue";
import { defaultSettings, type Settings } from "../core/schema";
import { readSettings, patchSettings, mutateLibrary } from "../storage/config";
import { settingsSchema } from "../core/schema";
import type { SettingsCommand } from "../core/messages";

export function useAppearance() {
  const settings = ref(defaultSettings());
  const media = matchMedia("(prefers-color-scheme: dark)");
  let privateWindowDark: boolean | undefined;
  const resolvedTheme = ref(media.matches ? "dark" : "light");
  function applyTheme() {
    resolvedTheme.value =
      settings.value.theme === "system"
        ? (privateWindowDark ?? media.matches)
          ? "dark"
          : "light"
        : settings.value.theme;
    document.documentElement.dataset.theme = resolvedTheme.value;
    document.documentElement.style.colorScheme = resolvedTheme.value;
  }
  applyTheme();
  watch(() => settings.value.theme, applyTheme);
  media.addEventListener("change", applyTheme);
  let disposed = false;
  let themePort: chrome.runtime.Port | undefined;
  async function observePrivateWindowTheme() {
    if (!(await chrome.windows.getCurrent()).incognito || disposed) return;
    // Multiple private windows can open editors at the same time.
    await navigator.locks.request("fontzie:system-theme", async () => {
      if (disposed) return;
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      });
      if (!contexts.length) {
        await chrome.offscreen.createDocument({
          url: "system-theme.html",
          reasons: [chrome.offscreen.Reason.MATCH_MEDIA],
          justification: "Follow the system appearance in Incognito windows.",
        });
      }
      const port = chrome.runtime.connect({ name: "fontzie:system-theme" });
      if (disposed) {
        port.disconnect();
        return;
      }
      themePort = port;
      port.onMessage.addListener((dark: unknown) => {
        if (typeof dark !== "boolean") return;
        privateWindowDark = dark;
        applyTheme();
      });
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        privateWindowDark = undefined;
        applyTheme();
      });
    });
  }
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
    // Keep the local media query as a fallback when Chrome unloads the helper.
    void observePrivateWindowTheme().catch(() => {});
  }
  onScopeDispose(() => {
    disposed = true;
    themePort?.disconnect();
    media.removeEventListener("change", applyTheme);
    chrome.storage.onChanged.removeListener(changed);
  });
  return { settings, changeSettings, updateSettings, initialize };
}
