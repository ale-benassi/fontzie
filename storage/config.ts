import { durableConfig } from "../core/persistence";
import {
  configSchema,
  defaultSettings,
  maxPresets,
  settingsSchema,
  type Config,
  type Settings,
} from "../core/schema";
import { migrateStorage } from "./migrations";
export const readSettings = async (): Promise<Settings> => {
  await migrateStorage();
  const { settings } = await chrome.storage.local.get("settings");
  const parsed = settingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : defaultSettings();
};
export interface Preset {
  name: string;
  config: Config;
}
export const presetNameKey = (name: string) =>
  name.trim().slice(0, 80).toLowerCase();
export function checkPresetCapacity(existing: Preset[], additions: Preset[]) {
  const names = new Set(
    [...existing, ...additions].map((p) => presetNameKey(p.name)),
  );
  if (names.size > maxPresets)
    throw Error(
      `You can save up to ${maxPresets} presets. Remove a preset or reuse an existing name, then try again.`,
    );
}
export const readPresets = async (): Promise<Preset[]> => {
  await migrateStorage();
  const { presets = [] } = await chrome.storage.local.get("presets");
  return Array.isArray(presets)
    ? presets.filter(
        (p) =>
          typeof p.name === "string" &&
          configSchema.safeParse(p.config).success,
      )
    : [];
};
export async function mutateLibrary(
  command: import("../core/messages").StorageCommand,
) {
  const { unwrapResponse } = await import("../core/messages");
  unwrapResponse(
    await chrome.runtime.sendMessage({ channel: "fontzie-storage", command }),
  );
}
export const patchSettings = (patch: Pick<Partial<Settings>, "theme">) =>
  mutateLibrary({ type: "settings.patch", patch });
export const savePreset = (name: string, config: Config) =>
  mutateLibrary({ type: "preset.save", name, config: durableConfig(config) });
export const renamePreset = (name: string, nextName: string) =>
  mutateLibrary({ type: "preset.rename", name, nextName });
export const deletePreset = (name: string) =>
  mutateLibrary({ type: "preset.delete", name });
export const importPresets = (presets: Preset[]) =>
  mutateLibrary({ type: "preset.import", presets });
