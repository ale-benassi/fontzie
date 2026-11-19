import { findFont, loadCatalog } from "./catalog";
import {
  availableAxes,
  supportsFaceWeight,
  supportsWeight,
  fontRequestKey,
} from "../core/fonts";
import { familyFaces, groupFamilies } from "../storage/fonts";
import type { FontFamily } from "../core/schema";
import { encodeBase64 } from "../core/bytes";
export interface FacePayload {
  family: string;
  bytes: string;
  weight: string;
  style: string;
  unicodeRange?: string;
  revision?: string;
}
import { alias } from "../core/fonts";
export function safeFontURL(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    !["fonts.gstatic.com", "cdn.fontshare.com"].includes(u.hostname)
  )
    throw Error(
      "This font’s download address isn’t supported. Choose another font.",
    );
  return u.href;
}
export { googleCSSURL } from "../core/google";
import { googleCSSURL } from "../core/google";
const cache = new Map<string, Promise<FacePayload[]>>();
export async function deliverFont(
  id: string,
  weight = 400,
  style = "normal",
): Promise<FacePayload[]> {
  const custom = id.startsWith("custom:")
    ? await familyFaces(id.slice("custom:".length))
    : [];
  if (!id.startsWith("custom:")) await loadCatalog();
  const font = findFont(id, groupFamilies(custom));
  if (!font)
    throw Error("Font not found. Re-import the custom font if it was removed.");
  if (font.provider === "system" || font.provider === "local") return [];
  if (font.provider !== "custom") {
    if (!font.styles.includes(style))
      throw Error("This font does not provide that style.");
    if (!supportsWeight(font, weight, style))
      throw Error("This font does not provide that weight.");
  }
  const key = fontRequestKey({ id, weight, style }, font);
  const existing = cache.get(key);
  if (!id.startsWith("custom:") && existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const pending = load(font);
  if (!id.startsWith("custom:")) {
    cache.set(key, pending);
    if (cache.size > 32) cache.delete(cache.keys().next().value!);
  }
  try {
    return await pending;
  } catch (e) {
    if (cache.get(key) === pending) cache.delete(key);
    throw e;
  }
  async function load(font: FontFamily) {
    if (font.provider === "custom") {
      const faces = custom.filter(
        (f) =>
          `custom:${f.family}` === id &&
          f.style === style &&
          supportsFaceWeight(f, weight),
      );
      if (!faces.length)
        throw Error("This custom font has no matching weight or style.");
      return Promise.all(
        faces.map(async (f) => ({
          family: alias(id),
          bytes: encodeBase64(f.bytes),
          weight: f.axes.find((a) => a.tag === "wght")
            ? `${f.axes.find((a) => a.tag === "wght")!.min} ${f.axes.find((a) => a.tag === "wght")!.max}`
            : String(f.weight),
          style: f.style,
          revision: Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", f.bytes)),
          )
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        })),
      );
    }
    if (!font.styles.includes(style))
      throw Error("This font does not provide that style.");
    const axis = availableAxes(font, style, weight).find(
      (a) => a.tag === "wght",
    );
    if (!supportsWeight(font, weight, style))
      throw Error("This font does not provide that weight.");
    if (font.provider === "fontshare") {
      const face =
        font.faces?.find((f) => f.style === style && f.variable) ??
        font.faces?.find((f) => f.style === style && f.weight === weight);
      if (!face) throw Error("This Fontshare variant is unavailable.");
      const r = await fetch(safeFontURL(face.url), {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok)
        throw Error(
          "Fontshare couldn’t download this font. Try again later or choose another font.",
        );
      return [
        {
          family: alias(id),
          bytes: encodeBase64(await r.arrayBuffer()),
          weight:
            face.variable && axis ? `${axis.min} ${axis.max}` : String(weight),
          style,
        },
      ];
    }
    const css = await fetch(googleCSSURL(font, weight, style), {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { "User-Agent": "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36" },
      signal: AbortSignal.timeout(20000),
    });
    if (!css.ok)
      throw Error(
        "Google Fonts couldn’t load this font. Try again later or choose another weight or style.",
      );
    const text = await css.text();
    const faces = [...text.matchAll(/@font-face\s*\{([^}]+)\}/g)]
      .map((m) => {
        const body = m[1]!;
        return {
          url: /url\((['"]?)(https:\/\/[^)'"\s]+)\1\)/.exec(body)?.[2],
          weight:
            /font-weight:\s*([^;]+)/.exec(body)?.[1]?.trim() ?? String(weight),
          style: /font-style:\s*([^;]+)/.exec(body)?.[1]?.trim() ?? style,
          unicodeRange: /unicode-range:\s*([^;]+)/.exec(body)?.[1]?.trim(),
        };
      })
      .filter((f) => f.url);
    if (!faces.length)
      throw Error(
        "Google Fonts couldn’t provide this font. Choose another weight or style.",
      );
    return Promise.all(
      faces.map(async (f) => {
        const r = await fetch(safeFontURL(f.url!), {
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: AbortSignal.timeout(20000),
        });
        if (!r.ok)
          throw Error(
            "This font couldn’t download. Try again later or choose another font.",
          );
        return {
          family: alias(id),
          bytes: encodeBase64(await r.arrayBuffer()),
          weight: f.weight,
          style: f.style,
          unicodeRange: f.unicodeRange,
        };
      }),
    );
  }
}
