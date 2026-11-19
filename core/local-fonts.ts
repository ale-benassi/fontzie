import { z } from "zod";
import type { FontFamily } from "./schema";

export const LOCAL_FONTS_KEY = "fonts:local-session";
export const localFontFacesSchema = z
  .array(
    z.object({
      family: z.string().min(1).max(300),
      style: z.string().max(300),
    }),
  )
  .max(50000);

export function localFamilies(value: unknown): FontFamily[] {
  const families = new Map<string, FontFamily>();
  const weights = [
    ["thin", 100],
    ["extralight", 200],
    ["light", 300],
    ["medium", 500],
    ["semibold", 600],
    ["extrabold", 800],
    ["black", 900],
    ["bold", 700],
  ] as const;
  for (const face of localFontFacesSchema.parse(value)) {
    const id = "local:" + face.family;
    let family = families.get(id);
    if (!family) {
      family = {
        id,
        family: face.family,
        provider: "local",
        category: "local",
        weights: [],
        styles: [],
        axes: [],
        faces: [],
      };
      families.set(id, family);
    }
    const style = /italic|oblique/i.test(face.style) ? "italic" : "normal";
    const normalized = face.style.toLowerCase().replace(/[ -]/g, "");
    const weight =
      weights.find(([name]) => normalized.includes(name))?.[1] ?? 400;
    if (!family.weights.includes(weight)) family.weights.push(weight);
    if (!family.styles.includes(style)) family.styles.push(style);
    family.faces?.push({ weight, style, url: "" });
  }
  return [...families.values()];
}
