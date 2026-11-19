import {
  checkBackupSize,
  parseBackup,
  type BackupImportScope,
} from "../core/backup";
import { durableConfig } from "../core/persistence";
import { restoreFontshareFonts } from "../providers/catalog";
import { restoreRuleFrames } from "../core/frames";
import { hasExactTargets } from "../core/targets";
import {
  checkPresetCapacity,
  importPresets,
  readPresets,
} from "../storage/config";
import { download } from "../core/download";
import type { Fontzie } from "./useFontzie";
import type { Presets } from "./usePresets";
export function useBackup(app: Fontzie, manager: Presets) {
  function downloadJSON() {
    const connected = app.connected.value;
    try {
      const file = new Blob(
        [
          JSON.stringify({
            version: 1,
            ...(connected && { config: durableConfig(app.config.value) }),
            presets: manager.presets.value,
          }),
        ],
        { type: "application/json" },
      );
      checkBackupSize(file);
      download(
        connected ? "fontzie-config.json" : "fontzie-presets.json",
        file,
      );
    } catch (error) {
      app.report(error);
    }
  }
  async function importJSON(file?: File, scope: BackupImportScope = "backup") {
    if (!file) return;
    app.error.value = "";
    app.status.value = "";
    const ownsPage = app.captureOwner();
    const connectedAtStart = app.connected.value;
    let backup: ReturnType<typeof parseBackup>;
    try {
      checkBackupSize(file);
      backup = parseBackup(JSON.parse(await file.text()));
    } catch (error) {
      app.report(
        error instanceof SyntaxError
          ? Error(
              "This file isn’t valid JSON. Choose a backup exported by Fontzie and try again.",
            )
          : error,
      );
      return;
    }
    const page =
      scope === "backup" && connectedAtStart ? backup.config : undefined;
    if (
      scope === "backup" &&
      !connectedAtStart &&
      backup.config &&
      !backup.presets.length
    ) {
      app.report(Error("Connect a website before importing a configuration."));
      return;
    }
    try {
      if (backup.presets.length)
        checkPresetCapacity(await readPresets(), backup.presets);
      if (page) {
        if (!ownsPage()) return;
        if (app.busy.value)
          throw Error(
            "Wait for the current edit to finish, then import the configuration again.",
          );
        const warnings = new Set<string>();
        const config = await restoreFontshareFonts(page, warnings);
        const restored = config.rules.some((rule) => rule.frameId !== 0)
          ? restoreRuleFrames(config, await app.listFrames(), false, warnings)
          : config;
        if (!ownsPage()) return;
        const applied = await app.commit(
          {
            ...restored,
            rules: durableConfig(restored).rules.map((rule) => ({
              ...rule,
              enabled: hasExactTargets(rule) ? false : rule.enabled,
            })),
          },
          true,
          undefined,
          backup.presets.length
            ? () => importPresets(backup.presets)
            : undefined,
        );
        if (!applied || !ownsPage()) return;
        app.restorationWarnings.value = [...warnings];
        await app.selectFirstRule();
      }
      if (backup.presets.length) {
        if (!page) await importPresets(backup.presets);
        manager.presets.value = await readPresets();
      }
      if (page) {
        if (!ownsPage()) return;
        app.status.value = page.rules.some(hasExactTargets)
          ? "Backup imported. Pick exact targets again on this page."
          : "Backup imported.";
      } else if (backup.presets.length) {
        app.status.value =
          scope === "backup" && backup.config
            ? "Presets imported. Connect a website to import page edits."
            : "Presets imported.";
      } else app.report(Error("This file has no presets to import."));
    } catch (error) {
      if (!page || ownsPage()) app.report(error);
    }
  }
  return { downloadJSON, importJSON };
}
