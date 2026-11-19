import { googleCSSURL } from "./google";
import { hasExactTargets, ruleQuery } from "./targets";
import type { Config, Properties, Rule, FontFamily } from "./schema";
export const quote = (s: string) =>
  `"${s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, " ")}"`;
export function declarations(p: Properties, important = false) {
  return Object.entries(p)
    .map(([k, v]) => `  ${k}: ${v}${important ? " !important" : ""};`)
    .join("\n");
}
export function ruleCSS(
  rule: Rule,
  selector = rule.selector,
  important = false,
) {
  return Object.keys(rule.properties).length
    ? `${selector} {\n${declarations(rule.properties, important)}\n}`
    : "";
}
export function engineCSS(config: Config, frameId: number) {
  if (!config.preview) return "";
  return config.rules
    .filter((r) => r.enabled && r.selector && r.frameId === frameId)
    .map((r, i) => {
      // USER important gives the first layer priority, so emit layers in UI order.
      const target = ruleQuery(r);
      return `@layer fz${i} {${ruleCSS(r, target, true)}}`;
    })
    .join("\n");
}
export function fontSetupCSS(
  rules: Rule[],
  metadata: FontFamily[] = [],
  customFaces = "",
) {
  const imports = new Set<string>();
  const notes = new Set<string>();
  for (const r of rules) {
    if (!r.font) continue;
    const f = r.font;
    const w = r.properties["font-weight"] ?? "400";
    const italic = r.properties["font-style"] === "italic";
    if (f.provider === "google" && metadata.some((m) => m.id === f.id)) {
      imports.add(
        `@import url("${googleCSSURL(
          metadata.find((m) => m.id === f.id)!,
          Number(r.properties["font-weight"] ?? 400),
          r.properties["font-style"] ?? "normal",
        )}");`,
      );
    } else if (f.provider === "google")
      imports.add(
        `@import url("https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:${italic ? "ital,wght@1," : "wght@"}${w}&display=swap");`,
      );
    if (f.provider === "fontshare") {
      const style = italic ? "italic" : "normal";
      const family = metadata.find(
        (font) =>
          font.id === f.id &&
          font.provider === "fontshare" &&
          font.license === "sil_ofl",
      );
      if (!family) continue;
      const variable = family.faces?.some(
        (face) => face.variable && face.style === style,
      );
      // Fontshare identifies variable normal/italic faces as 1 and 2.
      const variant = (variable ? 1 : Number(w)) + Number(italic);
      imports.add(
        `@import url("https://api.fontshare.com/v2/css?f[]=${encodeURIComponent(f.id.replace("fontshare:", ""))}@${variant}&display=swap");`,
      );
    }
    if (f.provider === "custom")
      notes.add(
        "/* Copy the exported custom font assets into ./fonts/ beside this CSS. Keep their licenses. */",
      );
  }
  return [[...imports, ...notes].join("\n"), customFaces]
    .filter(Boolean)
    .join("\n\n");
}
export function exportCSS(
  config: Config,
  format: "css" | "tailwind" = "css",
  selected?: string,
  metadata: FontFamily[] = [],
  customFaces = "",
) {
  const rules = config.rules.filter(
    (r) => r.enabled && r.selector && (!selected || selected === r.id),
  );
  let theme = "";
  if (format === "tailwind") {
    const families = [
      ...new Set(rules.map((r) => r.properties["font-family"]).filter(Boolean)),
    ];
    const tokens = rules.flatMap((r, i) =>
      Object.entries(r.properties)
        .filter(([k]) =>
          [
            "font-size",
            "line-height",
            "letter-spacing",
            "font-weight",
          ].includes(k),
        )
        .map(
          ([k, v]) =>
            `  --${({ "font-size": "text", "line-height": "leading", "letter-spacing": "tracking", "font-weight": "font-weight" } as Record<string, string>)[k]}-fontzie-${i + 1}: ${v};`,
        ),
    );
    theme = `@theme {\n${[...families.map((f, i) => `  --font-fontzie-${i + 1}: ${f};`), ...tokens].join("\n")}\n}`;
  }
  const selectors = [...new Set(rules.map((rule) => rule.selector))];
  // The parent carries the strongest actual selector. Nested rules have equal
  // specificity, so the top rule wins without making the declarations important.
  const nested = selectors.length > 1;
  const blocks = [...rules]
    .reverse()
    .map(
      (r) =>
        `${hasExactTargets(r) ? "/* Exact pick: review this reusable selector before use. */\n" : ""}${ruleCSS(r, nested ? `&:where(${r.selector})` : r.selector)}`,
    )
    .join("\n\n");
  const body = nested
    ? `:is(${selectors.join(", ")}) {\n${blocks.replace(/^(.+)/gm, "  $1")}\n}`
    : blocks;
  return [
    fontSetupCSS(rules, metadata, customFaces),
    theme,
    rules.length > 1
      ? `/* Rule priority: top rules take precedence. Exported from bottom to top. */\n${body}`
      : body,
  ]
    .filter(Boolean)
    .join("\n\n");
}
