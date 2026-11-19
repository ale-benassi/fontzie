import { computed, onMounted, onScopeDispose, ref, watch } from "vue";
import {
  readPresets,
  savePreset,
  presetNameKey,
  renamePreset,
  deletePreset,
  type Preset,
} from "../storage/config";
import type { Fontzie } from "./useFontzie";
import { errorMessage } from "../core/errors";
export function usePresets(app: Fontzie) {
  const { config, connected, busy, error, status, report, tabId, url } = app;
  const presetUndoConfig = ref<typeof config.value>();
  const presets = ref<Awaited<ReturnType<typeof readPresets>>>([]),
    presetName = ref(""),
    selectedPreset = ref("");
  const presetBaseline = ref("");
  const presetModified = computed(
    () =>
      !!selectedPreset.value &&
      JSON.stringify(config.value) !== presetBaseline.value,
  );
  const renamingPreset = ref("");
  const deletingPreset = ref("");
  const pendingPreset = ref<Preset & { existingName: string }>();
  const savingPreset = ref(false);
  const applyingPreset = ref(false);
  const presetSaveOpen = ref(false);
  const presetError = ref("");
  function showPresetSave() {
    renamingPreset.value = "";
    presetName.value = "";
    presetError.value = "";
    presetSaveOpen.value = true;
  }
  function closePresetSave() {
    if (!savingPreset.value && !pendingPreset.value)
      presetSaveOpen.value = false;
  }
  async function saveCurrentPreset() {
    if (!selectedPreset.value) return showPresetSave();
    presetName.value = selectedPreset.value;
    renamingPreset.value = "";
    await addPreset();
  }
  function showPresetRename(name: string) {
    renamingPreset.value = name;
    presetName.value = name;
    presetError.value = "";
    presetSaveOpen.value = true;
  }
  async function submitPresetName() {
    if (!renamingPreset.value) return addPreset();
    savingPreset.value = true;
    presetError.value = "";
    try {
      await renamePreset(renamingPreset.value, presetName.value);
      if (selectedPreset.value === renamingPreset.value)
        selectedPreset.value = presetName.value.trim();
      presets.value = await readPresets();
      presetSaveOpen.value = false;
      status.value = "Preset renamed.";
    } catch (e) {
      presetError.value = errorMessage(
        e,
        "Could not rename preset. Try again.",
      );
    } finally {
      savingPreset.value = false;
    }
  }
  async function confirmPresetDelete() {
    savingPreset.value = true;
    presetError.value = "";
    try {
      await deletePreset(deletingPreset.value);
      if (selectedPreset.value === deletingPreset.value) {
        selectedPreset.value = "";
        presetBaseline.value = "";
      }
      presets.value = await readPresets();
      deletingPreset.value = "";
      status.value = "Preset deleted. Current edits are kept.";
    } catch (e) {
      presetError.value = errorMessage(
        e,
        "Could not delete preset. Try again.",
      );
    } finally {
      savingPreset.value = false;
    }
  }

  async function addPreset(overwrite = false) {
    if (savingPreset.value || (overwrite && !pendingPreset.value)) return;
    const ownsPage = app.captureOwner();
    savingPreset.value = true;
    presetError.value = "";
    try {
      const item = overwrite
        ? pendingPreset.value!
        : {
            name: presetName.value.trim().slice(0, 80),
            config: await app.presetSnapshot(),
          };
      if (!ownsPage()) return;
      if (!overwrite) {
        presets.value = await readPresets();
        if (!ownsPage()) return;
        const existing = presets.value.find(
          (p) => presetNameKey(p.name) === presetNameKey(item.name),
        );
        if (existing) {
          status.value = "";
          pendingPreset.value = { ...item, existingName: existing.name };
          return;
        }
      }
      await savePreset(item.name, item.config);
      presets.value = await readPresets();
      if (!ownsPage()) return;
      selectedPreset.value = item.name;
      presetBaseline.value = JSON.stringify(config.value);
      pendingPreset.value = undefined;
      status.value = "Preset saved on this device.";
      savingPreset.value = false;
      closePresetSave();
    } catch (e) {
      if (!ownsPage()) return;
      presetError.value = errorMessage(
        e,
        "Could not save this preset. Try again.",
      );
      report(e);
    } finally {
      savingPreset.value = false;
    }
  }
  async function loadPreset(name: string) {
    if (
      !connected.value ||
      busy.value ||
      savingPreset.value ||
      applyingPreset.value
    )
      return;
    const preset = presets.value.find((p) => p.name === name);
    if (!preset) return;
    const ownsPage = app.captureOwner();
    applyingPreset.value = true;
    presetError.value = "";
    try {
      const applied = await app.loadPreset(preset.config);
      if (!ownsPage()) return;
      if (!applied) {
        presetError.value = error.value;
      } else {
        selectedPreset.value = preset.name;
        presetBaseline.value = JSON.stringify(config.value);
        presetUndoConfig.value = config.value;
      }
    } finally {
      applyingPreset.value = false;
    }
  }
  watch([tabId, url], () => {
    selectedPreset.value = "";
    presetBaseline.value = "";
    pendingPreset.value = undefined;
    presetSaveOpen.value = false;
  });

  let revision = 0;
  const changed = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "local" || !changes.presets) return;
    revision++;
    void refreshPresets().catch(report);
  };
  async function refreshPresets() {
    const startingRevision = revision;
    const saved = await readPresets();
    if (revision !== startingRevision) return;
    presets.value = saved;
    if (
      !savingPreset.value &&
      selectedPreset.value &&
      !saved.some((p) => p.name === selectedPreset.value)
    ) {
      selectedPreset.value = "";
      presetBaseline.value = "";
    }
  }
  chrome.storage.onChanged.addListener(changed);
  onScopeDispose(() => chrome.storage.onChanged.removeListener(changed));
  onMounted(() => refreshPresets().catch(report));
  return {
    presets,
    presetName,
    selectedPreset,
    presetBaseline,
    presetModified,
    renamingPreset,
    deletingPreset,
    pendingPreset,
    savingPreset,
    applyingPreset,
    presetSaveOpen,
    presetError,
    presetUndoConfig,
    showPresetSave,
    closePresetSave,
    saveCurrentPreset,
    showPresetRename,
    submitPresetName,
    confirmPresetDelete,
    addPreset,
    loadPreset,
  };
}
export type Presets = ReturnType<typeof usePresets>;
