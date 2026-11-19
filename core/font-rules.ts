import type { Config, FontFamily, Rule } from "./schema";
import { availableAxes, supportsWeight } from "./fonts";
export function validateFontRule(rule: Rule, font: FontFamily | undefined) {
  if (!rule.font) return;
  if (!font && rule.font.provider !== "local")
    throw Error(
      "A referenced font is missing. Import its files or choose another family.",
    );
  if (!font) return;
  if (rule.font.family !== font.family || rule.font.provider !== font.provider)
    throw Error(
      "The font reference does not match the catalog. Choose the family again.",
    );
  const properties = rule.properties;
  const style = properties["font-style"] ?? "normal",
    weight = +(properties["font-weight"] ?? 400);
  if (!font.styles.includes(style))
    throw Error(`${font.family} does not provide ${style}.`);
  if (!supportsWeight(font, weight, style))
    throw Error(
      `${font.family} does not provide weight ${weight} in ${style}.`,
    );
  const axes = availableAxes(font, style, weight);
  for (const match of (properties["font-variation-settings"] ?? "").matchAll(
    /"([\w]{4})" (-?[\d.]+)/g,
  )) {
    const a = axes.find((a) => a.tag === match[1]);
    const v = Number(match[2]);
    if (!a || v < a.min || v > a.max)
      throw Error(
        `Axis ${match[1]} is unavailable or outside this font's range.`,
      );
  }
}

export function withoutFont(rule: Rule): Rule {
  const { font: _font, ...rest } = rule;
  const properties = { ...rule.properties };
  delete properties["font-family"];
  delete properties["font-variation-settings"];
  delete properties["font-synthesis"];
  return { ...rest, properties };
}

// A library edit can invalidate a particular face even when its family still exists.
export function reconcileCustomFonts(
  config: Config,
  families: FontFamily[],
): Config {
  const rules = config.rules.map((rule) => {
    if (rule.font?.provider !== "custom") return rule;
    const family = families.find((item) => item.id === rule.font?.id);
    try {
      validateFontRule(rule, family);
      return rule;
    } catch {
      return withoutFont(rule);
    }
  });
  return rules.some((rule, i) => rule !== config.rules[i])
    ? { ...config, rules }
    : config;
}
