import { z } from "zod";
export const providerSchema = z.enum([
  "google",
  "fontshare",
  "custom",
  "local",
  "system",
]);
export type Provider = z.infer<typeof providerSchema>;
export interface Axis {
  tag: string;
  min: number;
  max: number;
  default: number;
}
export interface FontFamily {
  id: string;
  family: string;
  provider: Provider;
  category: string;
  weights: number[];
  styles: string[];
  axes: Axis[];
  license?: string;
  slug?: string;
  faces?: {
    weight: number;
    style: string;
    url: string;
    variable?: boolean;
    axes?: Axis[];
  }[];
}
const clean = z
  .string()
  .max(300)
  .refine(
    (v) => !/[{};<>\\\n\r]/.test(v),
    "Remove CSS blocks, semicolons or escapes.",
  );
const dimension = (units: string) =>
  z
    .string()
    .max(32)
    .regex(new RegExp(`^-?\\d+(?:\\.\\d+)?(?:${units})$`));
export const propertiesSchema = z
  .object({
    "font-family": clean.optional(),
    "font-weight": z
      .string()
      .regex(/^\d{1,4}$/)
      .refine((v) => +v >= 1 && +v <= 1000)
      .optional(),
    "font-size": dimension("px|rem|em")
      .refine((v) => parseFloat(v) > 0 && parseFloat(v) <= 1000)
      .optional(),
    "line-height": z
      .union([
        dimension("px|em"),
        z.string().regex(/^\d+(\.\d+)?$/),
        z.literal("normal"),
      ])
      .refine((v) => v === "normal" || parseFloat(v) > 0)
      .optional(),
    "letter-spacing": z
      .union([dimension("px|em"), z.literal("normal")])
      .optional(),
    "font-style": z.enum(["normal", "italic", "oblique"]).optional(),
    "text-transform": z
      .enum(["none", "uppercase", "lowercase", "capitalize"])
      .optional(),
    "text-decoration": z
      .enum(["none", "underline", "overline", "line-through"])
      .optional(),
    "text-align": z
      .enum(["start", "end", "left", "right", "center", "justify"])
      .optional(),
    "font-stretch": z
      .string()
      .regex(/^\d+(\.\d+)?%$/)
      .optional(),
    "font-optical-sizing": z.enum(["auto", "none"]).optional(),
    "font-variant-ligatures": z
      .enum(["normal", "none", "common-ligatures", "no-common-ligatures"])
      .optional(),
    "font-feature-settings": z
      .string()
      .max(300)
      .regex(/^(normal|"[a-zA-Z0-9]{4}" [01](,\s*"[a-zA-Z0-9]{4}" [01])*)$/)
      .optional(),
    "font-variation-settings": z
      .string()
      .max(600)
      .regex(
        /^(normal|"[a-zA-Z0-9]{4}" -?\d+(\.\d+)?(,\s*"[a-zA-Z0-9]{4}" -?\d+(\.\d+)?)*)$/,
      )
      .optional(),
    "font-synthesis": z.literal("none").optional(),
  })
  .strict();
export type Properties = z.infer<typeof propertiesSchema>;
export type Property = keyof Properties;
export const selectorSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine(
    (v) => !/[{}<\n\r]/.test(v),
    "Enter a CSS selector, without a style block.",
  );
export const fontRefSchema = z
  .object({ id: z.string().max(200), family: clean, provider: providerSchema })
  .strict();
const pickHandle = z.string().regex(/^[a-zA-Z0-9-]+$/);
const maxTargetsPerRule = 100;
const maxRules = 200;
export const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("selector"), selector: selectorSchema }).strict(),
  z
    .object({
      kind: z.literal("exact"),
      selector: selectorSchema,
      handle: pickHandle.optional(),
    })
    .strict(),
]);
export type Target = z.infer<typeof targetSchema>;
export const ruleSchema = z
  .object({
    id: z.string().min(1).max(100),
    selector: z.union([selectorSchema, z.literal("")]),
    mode: z.enum(["exact", "selector", "class", "tag", "page"]),
    handle: pickHandle.optional(),
    targets: z.array(targetSchema).min(1).max(maxTargetsPerRule).optional(),
    frameId: z.number().int().min(0).default(0),
    frameUrl: z.string().url().max(5000).optional(),
    enabled: z.boolean(),
    font: fontRefSchema.optional(),
    properties: propertiesSchema,
  })
  .strict()
  .refine(
    (rule) =>
      rule.selector !== "" ||
      (rule.mode === "selector" && !rule.handle && !rule.targets),
    "A rule without targets must use selector mode without exact handles.",
  )
  .refine(
    (rule) =>
      !rule.targets ||
      rule.selector ===
        rule.targets.map((target) => target.selector).join(", "),
    "Target labels must match the rule selector.",
  );
export type Rule = z.infer<typeof ruleSchema>;
export const configSchema = z
  .object({
    version: z.literal(1),
    rules: z.array(ruleSchema).max(maxRules),
    preview: z.boolean(),
  })
  .strict();
export type Config = z.infer<typeof configSchema>;
export const maxPresets = 100;
export const emptyConfig = (): Config => ({
  version: 1,
  rules: [],
  preview: true,
});
export const settingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).default("system"),
  favorites: z.array(z.string()).max(500).default([]),
  recents: z.array(z.string()).max(30).default([]),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings = (): Settings => settingsSchema.parse({});
export interface Inspection {
  handle: string;
  selector: string;
  tag: string;
  classes: string[];
  identity: string;
  width: number;
  height: number;
  computed: Record<string, string>;
  typographyContext?: { rootFontSize: number; parentFontSize: number };
  frameId: number;
  url: string;
}
export interface TabState {
  config: Config;
  activeRuleId?: string;
  selection?: Inspection;
  url: string;
  title: string;
  frameId: number;
  documentToken?: string;
  restorationWarnings?: string[];
}
export const requestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state") }),
  z.object({
    type: z.literal("locate-picks"),
    handles: z.array(pickHandle).max(maxRules * maxTargetsPerRule),
  }),
  z.object({ type: z.literal("pick"), active: z.boolean() }),
  z.object({ type: z.literal("clear-selection") }),
  z.object({ type: z.literal("target-element"), selector: selectorSchema }),
  z.object({
    type: z.literal("inspect"),
    selector: selectorSchema,
    previewOnly: z.boolean().optional(),
    reuseRoots: z.boolean().optional(),
  }),
  z.object({ type: z.literal("apply"), config: configSchema }),
  z.object({ type: z.literal("clear") }),
  z.object({
    type: z.literal("restore"),
    config: configSchema,
    selector: selectorSchema.optional(),
  }),
  z.object({ type: z.literal("before"), active: z.boolean() }),
]);
export type ContentRequest = z.infer<typeof requestSchema>;
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export function parseConfig(value: unknown): Config {
  return configSchema.parse(value);
}
export function newRule(
  selector: string,
  mode: Rule["mode"] = "selector",
  selection?: Inspection,
): Rule {
  return {
    id: crypto.randomUUID(),
    selector,
    mode,
    handle: mode === "exact" ? selection?.handle : undefined,
    frameId: selection?.frameId ?? 0,
    frameUrl: selection && selection.frameId !== 0 ? selection.url : undefined,
    enabled: true,
    properties: {},
  };
}
