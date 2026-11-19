import type { Config, FontFamily } from "../core/schema";
import { withoutFont } from "../core/font-rules";
const systemFonts: FontFamily[] = [
  { id: "system:sans", family: "system-ui", category: "sans-serif" },
  { id: "system:serif", family: "Georgia", category: "serif" },
  { id: "system:mono", family: "monospace", category: "monospace" },
].map((f) => ({
  ...f,
  provider: "system" as const,
  weights: [400, 700],
  styles: ["normal", "italic"],
  axes: [],
}));
export const catalog: FontFamily[] = [...systemFonts];
const byId = new Map(catalog.map((font) => [font.id, font]));
export function findFont(id: string, custom: FontFamily[] = []) {
  return custom.find((font) => font.id === id) ?? byId.get(id);
}

let pending: Promise<void> | undefined;
export function loadCatalog(): Promise<void> {
  return (pending ??= (async () => {
    const providers = await Promise.all(
      ["catalogs/google.json", "catalogs/fontshare.json"].map(async (url) => {
        const response = await fetch(chrome.runtime.getURL(url));
        if (!response.ok)
          throw Error(
            "Could not load the bundled font catalog. Reload Fontzie to try again.",
          );
        return response.json() as Promise<FontFamily[]>;
      }),
    );
    for (const font of providers.flat()) {
      if (font.provider === "fontshare" && font.license !== "sil_ofl") continue;
      catalog.push(font);
      byId.set(font.id, font);
    }
  })().catch((error) => {
    pending = undefined;
    throw error;
  }));
}

export async function restoreFontshareFonts(
  config: Config,
  warnings: Set<string>,
): Promise<Config> {
  if (!config.rules.some((rule) => rule.font?.provider === "fontshare"))
    return config;
  await loadCatalog();
  const rules = config.rules.map((rule) => {
    const font = rule.font;
    if (
      font?.provider !== "fontshare" ||
      findFont(font.id)?.provider === "fontshare"
    )
      return rule;
    warnings.add(
      `The Fontshare font “${font.family}” is unavailable. Choose another family to replace it.`,
    );
    return withoutFont(rule);
  });
  return rules.some((rule, index) => rule !== config.rules[index])
    ? { ...config, rules }
    : config;
}
