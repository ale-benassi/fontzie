import { quote } from "./css";
import {
  availableAxes,
  fontVariantPatch,
  formatAxes,
  parseAxes,
  withoutAxis,
} from "./fonts";
import type { FontFamily, Properties, Property, Rule } from "./schema";
import { validateFontRule } from "./font-rules";

export type TypographyChange =
  | { property: Property; value: string | undefined }
  | { axis: string; value: number | undefined };

export function binaryItalicAxis(
  font: FontFamily | undefined,
  properties: Properties,
) {
  if (
    !font ||
    (font.styles.includes("normal") && font.styles.includes("italic"))
  )
    return;
  return availableAxes(
    font,
    properties["font-style"] ?? "normal",
    Number(properties["font-weight"] ?? 400),
  ).find((axis) => axis.tag === "ital" && axis.min === 0 && axis.max === 1);
}

export function applyFontToRule(rule: Rule, font: FontFamily) {
  if (rule.font?.id === font.id) return;
  const properties = rule.properties;
  const variant = fontVariantPatch(font, properties, {});
  properties["font-family"] =
    font.provider === "system"
      ? font.family
      : `${quote(font.family)}, sans-serif`;
  if (
    properties["font-style"] !== undefined ||
    variant["font-style"] !== "normal"
  )
    properties["font-style"] = variant["font-style"];
  if (
    properties["font-weight"] !== undefined ||
    variant["font-weight"] !== "400"
  )
    properties["font-weight"] = variant["font-weight"];
  delete properties["font-variation-settings"];
  rule.font = { id: font.id, family: font.family, provider: font.provider };
}

function setAxis(
  properties: Properties,
  tag: string,
  value: number | undefined,
) {
  const settings = properties["font-variation-settings"];
  if (value === undefined) {
    properties["font-variation-settings"] = withoutAxis(settings, tag);
    return;
  }
  const axes = parseAxes(settings);
  axes.set(tag, value);
  properties["font-variation-settings"] = formatAxes(axes);
}

export function applyTypographyToRule(
  rule: Rule,
  change: TypographyChange,
  font?: FontFamily,
) {
  const properties: Partial<Record<Property, string>> = rule.properties;
  const { value } = change;
  if ("axis" in change) {
    setAxis(rule.properties, change.axis, change.value);
    if (change.axis === "wdth")
      properties["font-stretch"] =
        value === undefined ? undefined : `${value}%`;
    if (change.axis === "opsz")
      properties["font-optical-sizing"] =
        value === undefined ? undefined : "none";
    return;
  }

  const { property } = change;
  if (property === "font-weight") {
    const weight = parseAxes(properties["font-variation-settings"]).get("wght");
    if (weight !== undefined)
      setAxis(
        rule.properties,
        "wght",
        change.value === undefined ? undefined : Number(change.value),
      );
  }
  if (property === "font-optical-sizing" && value === "auto")
    setAxis(rule.properties, "opsz", undefined);
  if (property === "font-style") {
    if (binaryItalicAxis(font, rule.properties)) {
      setAxis(
        rule.properties,
        "ital",
        value === undefined ? undefined : Number(value === "italic"),
      );
      return;
    }
    const existing = parseAxes(properties["font-variation-settings"]).has(
      "ital",
    );
    if (existing)
      setAxis(
        rule.properties,
        "ital",
        value === undefined ? undefined : Number(value === "italic"),
      );
  }
  properties[property] = change.value;
}

export function supportsTypographyChange(
  rule: Rule,
  change: TypographyChange,
  font: FontFamily | undefined,
) {
  if (!font) return true;
  const candidate = { ...rule, properties: { ...rule.properties } };
  applyTypographyToRule(candidate, change, font);
  try {
    validateFontRule(candidate, font);
    return true;
  } catch {
    return false;
  }
}
