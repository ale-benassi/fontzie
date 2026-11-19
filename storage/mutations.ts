import { createQueue } from "../core/queue";
import { storageCommandSchema, type StorageCommand } from "../core/messages";
import { settingsSchema } from "../core/schema";
import { durableConfig } from "../core/persistence";
import {
  readSettings,
  readPresets,
  presetNameKey,
  checkPresetCapacity,
} from "./config";

const serial = createQueue();
export const withStorageLock = <T>(run: () => Promise<T>) =>
  serial("library", run);
// Called only in the background worker: every editor shares this queue.
export function mutateStorage(raw: StorageCommand) {
  const command = storageCommandSchema.parse(raw);
  return withStorageLock(async () => {
    if (command.type.startsWith("settings.")) {
      const settings = await readSettings();
      switch (command.type) {
        case "settings.patch":
          Object.assign(settings, command.patch);
          break;
        case "settings.favorite":
          settings.favorites = settings.favorites.includes(command.id)
            ? settings.favorites.filter((id) => id !== command.id)
            : [...settings.favorites, command.id];
          break;
        case "settings.recent":
          settings.recents = [
            command.id,
            ...settings.recents.filter((id) => id !== command.id),
          ].slice(0, 30);
          break;
      }
      await chrome.storage.local.set({
        settings: settingsSchema.parse(settings),
      });
      return;
    }
    let presets = await readPresets();
    if (command.type === "preset.save" || command.type === "preset.import") {
      const additions =
        command.type === "preset.save" ? [command] : command.presets;
      checkPresetCapacity(presets, additions);
      for (const item of additions) {
        const name = item.name.trim();
        if (!name) throw Error("Name this preset first.");
        presets = [
          ...presets.filter(
            (p) => presetNameKey(p.name) !== presetNameKey(name),
          ),
          { name, config: durableConfig(item.config) },
        ];
      }
    } else if (command.type === "preset.rename") {
      const name = command.nextName.trim();
      if (!name) throw Error("Name this preset first.");
      const current = presets.find(
        (p) => presetNameKey(p.name) === presetNameKey(command.name),
      );
      if (!current) throw Error("This preset no longer exists.");
      if (
        presets.some(
          (p) => p !== current && presetNameKey(p.name) === presetNameKey(name),
        )
      )
        throw Error(
          "A preset with this name already exists. Choose another name.",
        );
      presets = presets.map((p) => (p === current ? { ...p, name } : p));
    } else if (command.type === "preset.delete") {
      presets = presets.filter(
        (p) => presetNameKey(p.name) !== presetNameKey(command.name),
      );
    }
    await chrome.storage.local.set({ presets });
  });
}
