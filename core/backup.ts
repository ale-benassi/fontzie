import { z } from "zod";
import { configSchema, maxPresets } from "./schema";
export type BackupImportScope = "backup" | "presets";
// Allow older, indented exports as well as the compact current format.
const maxBackupBytes = 64 * 1024 * 1024;
export function checkBackupSize(file: Blob) {
  if (file.size > maxBackupBytes)
    throw Error("Configuration files can contain up to 64 MB.");
}
export const backupSchema = z
  .object({
    version: z.literal(1),
    config: configSchema.optional(),
    presets: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            config: configSchema,
          })
          .strict(),
      )
      .max(maxPresets),
  })
  .strict();
export function parseBackup(raw: unknown): z.infer<typeof backupSchema> {
  const config = configSchema.safeParse(raw);
  if (config.success) return { version: 1, config: config.data, presets: [] };
  const { config: page, ...backup } = backupSchema.parse(raw);
  // Older exports from a disconnected panel included an empty page config.
  if (page?.preview && !page.rules.length) return backup;
  return page ? { ...backup, config: page } : backup;
}
