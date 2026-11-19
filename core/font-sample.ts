import { quote } from "./css";
import { alias } from "./fonts";
import {
  propertiesSchema,
  type Inspection,
  type Property,
  type Rule,
} from "./schema";

export const fontSampleText = "Good things take type.";

const defaults = {
  "font-family": "sans-serif",
  "font-weight": "400",
  "font-style": "normal",
  "font-size": "16px",
  "line-height": "1.4",
  "letter-spacing": "normal",
  "text-transform": "none",
  "text-decoration": "none",
  "text-align": "start",
  "font-stretch": "normal",
  "font-optical-sizing": "auto",
  "font-variant-ligatures": "normal",
  "font-feature-settings": "normal",
  "font-variation-settings": "normal",
  "font-synthesis": "none",
} satisfies Record<Property, string>;

export function fontSampleStyle(rule?: Rule, selection?: Inspection) {
  // Keep the same property boundary as website rules. Explicit defaults also
  // clear the previous rule's settings when an override is reset or switched.
  const style: Record<string, string> = {};
  for (const property of Object.keys(propertiesSchema.shape)) {
    const key = property as keyof typeof defaults;
    style[key] =
      rule?.properties[key] ?? selection?.computed[key] ?? defaults[key];
  }
  if (rule?.font) {
    const fallback = rule.properties["font-family"] ?? quote(rule.font.family);
    style["font-family"] = ["google", "fontshare", "custom"].includes(
      rule.font.provider,
    )
      ? `${quote(alias(rule.font.id))}, ${fallback}`
      : fallback;
  }
  const size = style["font-size"]!;
  const context = selection?.typographyContext;
  // em font sizes use the parent; em tracking/leading use the resulting size
  // and can be left to CSS. rem must use the inspected document's root.
  if (size.endsWith("rem"))
    style["font-size"] =
      `${parseFloat(size) * (context?.rootFontSize ?? 16)}px`;
  else if (size.endsWith("em"))
    style["font-size"] =
      `${parseFloat(size) * (context?.parentFontSize ?? 16)}px`;
  return style;
}
