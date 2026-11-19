import { z } from "zod";
import {
  configSchema,
  maxPresets,
  requestSchema,
  selectorSchema,
  settingsSchema,
  type ContentRequest,
} from "./schema";

const frame = z.number().int().nonnegative();
export const frameLocationsSchema = z.array(
  z.object({ id: frame, url: z.string().url() }),
);
const targetElementSchema = z.object({
  tag: z.string().min(1),
  classes: z.array(z.string()),
});
export type TargetElement = z.infer<typeof targetElementSchema>;
const pickLocationSchema = z.object({
  selector: selectorSchema,
  shadowHosts: z.array(selectorSchema).optional(),
});
export type PickLocation = z.infer<typeof pickLocationSchema>;
export const inspectionSchema = targetElementSchema.extend({
  handle: z.string(),
  selector: z.string(),
  identity: z.string(),
  width: z.number(),
  height: z.number(),
  computed: z.record(z.string(), z.string()),
  typographyContext: z
    .object({
      rootFontSize: z.number().positive().finite(),
      parentFontSize: z.number().positive().finite(),
    })
    .optional(),
  frameId: frame,
  url: z.string(),
});
export const tabStateSchema = z.object({
  config: configSchema,
  activeRuleId: z.string().max(200).optional(),
  selection: inspectionSchema.optional(),
  url: z.string(),
  title: z.string(),
  frameId: frame,
  documentToken: z.string().optional(),
  restorationWarnings: z.array(z.string()).optional(),
});
export const historySnapshotSchema = z.object({
  current: configSchema,
  undo: z.array(configSchema).max(80),
  redo: z.array(configSchema).max(80),
});
export const historyHandoffSchema = z.object({
  documentToken: z.string(),
  url: z.string().url(),
  snapshot: historySnapshotSchema,
});
export const connectedTabSchema = tabStateSchema.extend({
  frames: z.array(frame),
  siteClearId: z.string().optional(),
  history: historySnapshotSchema.optional(),
});
export type ConnectedTab = z.infer<typeof connectedTabSchema>;
export const pdfViewerInjectionResult = "pdf-viewer";
const connectionBlockSchema = z.enum(["unsupported-page", "access-required"]);
export class ConnectionBlocked extends Error {
  constructor(readonly reason: z.infer<typeof connectionBlockSchema>) {
    super(reason);
  }
}
export const panelEnvelopeSchema = z.object({
  channel: z.literal("fontzie-panel"),
  tabId: frame,
  type: z.enum([
    "connect",
    "request",
    "clear-site",
    "select-rule",
    "list-frames",
  ]),
  activeRuleId: z.string().max(200).optional(),
  pageUrl: z.string().url().max(5000).optional(),
  frameId: frame.optional(),
  request: requestSchema.optional(),
  siteOrigin: z.string().optional(),
  siteClearId: z.string().optional(),
});
export const fontRequestSchema = z.object({
  id: z.string().max(200),
  weight: z.number().min(1).max(1000),
  style: z.enum(["normal", "italic", "oblique"]),
});
export const pageEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("selection"), selection: inspectionSchema }),
  z.object({ type: z.literal("cancel") }),
  z.object({
    type: z.literal("matches"),
    count: z.number().int().nonnegative(),
    selector: z.string().optional(),
  }),
]);
export type PageEvent = z.infer<typeof pageEventSchema>;
export const editorEventSchema = z.object({
  channel: z.literal("fontzie-event"),
  tabId: frame,
  frameId: frame,
  data: pageEventSchema,
});
export type EditorEvent = z.infer<typeof editorEventSchema>;
export const actionEventSchema = z.object({
  channel: z.literal("fontzie-action"),
  tabId: frame,
});
const inspected = z.object({
  count: z.number().int().nonnegative(),
  selection: inspectionSchema.optional(),
});
const restored = z.object({
  config: configSchema,
  warnings: z.array(z.string()),
  selection: inspectionSchema.optional(),
});
const responseSchemas = {
  state: tabStateSchema,
  "locate-picks": z.object({
    locations: z.record(z.string(), pickLocationSchema),
  }),
  inspect: inspected,
  restore: restored,
  "target-element": targetElementSchema,
  pick: z.literal(true),
  apply: z.union([
    z.literal(true),
    z.object({
      config: configSchema,
      frames: z.array(frame),
      warnings: z.array(z.string()),
    }),
  ]),
  clear: z.literal(true),
  before: z.literal(true),
  "clear-selection": z.literal(true),
};
export type CommandResult<R extends ContentRequest> = z.infer<
  (typeof responseSchemas)[R["type"]]
>;
export function unwrapResponse(value: unknown): unknown {
  const result = z
    .discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), data: z.unknown().optional() }),
      z.object({
        ok: z.literal(false),
        error: z.string(),
        connectionBlock: connectionBlockSchema.optional(),
      }),
    ])
    .parse(value);
  if (!result.ok) {
    if (result.connectionBlock)
      throw new ConnectionBlocked(result.connectionBlock);
    throw Error(result.error);
  }
  return result.data;
}
export function parseCommandResult<R extends ContentRequest>(
  request: R,
  value: unknown,
): CommandResult<R> {
  return responseSchemas[request.type].parse(
    unwrapResponse(value),
  ) as CommandResult<R>;
}

export const storageCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("settings.patch"),
    patch: settingsSchema.pick({ theme: true }).partial(),
  }),
  z.object({ type: z.literal("settings.favorite"), id: z.string().max(200) }),
  z.object({ type: z.literal("settings.recent"), id: z.string().max(200) }),
  z.object({
    type: z.literal("preset.save"),
    name: z.string().max(80),
    config: configSchema,
  }),
  z.object({
    type: z.literal("preset.rename"),
    name: z.string().max(80),
    nextName: z.string().max(80),
  }),
  z.object({ type: z.literal("preset.delete"), name: z.string().max(80) }),
  z.object({
    type: z.literal("preset.import"),
    presets: z
      .array(z.object({ name: z.string().max(80), config: configSchema }))
      .max(maxPresets),
  }),
]);
export type StorageCommand = z.infer<typeof storageCommandSchema>;
export type SettingsCommand = Extract<
  StorageCommand,
  { type: `settings.${string}` }
>;
