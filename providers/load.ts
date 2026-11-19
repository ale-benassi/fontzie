import {
  alias,
  type FontRequest,
  CUSTOM_FONTS_REVISION_KEY,
  fontRequestKey,
} from "../core/fonts";
import type { FacePayload } from "./delivery";
import { decodeBase64 } from "../core/bytes";

interface LoadedFace {
  family: string;
  revision?: string;
  bytes: number;
  fonts: FontFaceSet;
  promise: Promise<void>;
  font?: FontFace;
}
const loaded = new Map<string, LoadedFace>();
interface FontLoad {
  id: string;
  style: string;
  range?: { min: number; max: number };
  promise: Promise<void>;
  pending: boolean;
}
const requests = new Map<string, FontLoad>();
const retained = new Map<object, Set<string>>();
const recent = new Map<string, number>();
let access = 0;
export const FONT_CACHE_FAMILIES = 24;
export const FONT_CACHE_REQUESTS = 256;
export const FONT_CACHE_BYTES = 16 * 1024 * 1024;
const touch = (family: string) => recent.set(family, ++access);

export function retainFontFamilies(owner: object, ids: Iterable<string>) {
  retained.set(owner, new Set(Array.from(ids, alias)));
  trimFonts();
}
export function releaseFontFamilies(owner: object) {
  retained.delete(owner);
  trimFonts();
}
function trimFonts() {
  const pinned = new Set([...retained.values()].flatMap((ids) => [...ids]));
  const pending = new Set<string>();
  const sizes = new Map<string, number>();
  for (const entry of loaded.values()) {
    sizes.set(entry.family, (sizes.get(entry.family) ?? 0) + entry.bytes);
    if (!entry.font) pending.add(entry.family);
  }
  for (const request of requests.values()) {
    const family = alias(request.id);
    if (!sizes.has(family)) sizes.set(family, 0);
    if (request.pending) pending.add(family);
  }
  const idle = [...sizes.keys()]
    .filter((family) => !pinned.has(family) && !pending.has(family))
    .sort((a, b) => (recent.get(a) ?? 0) - (recent.get(b) ?? 0));
  let bytes = idle.reduce((total, family) => total + sizes.get(family)!, 0);
  while (idle.length > FONT_CACHE_FAMILIES || bytes > FONT_CACHE_BYTES) {
    const family = idle.shift();
    if (!family) break;
    for (const [key, entry] of loaded)
      if (entry.family === family) forgetFace(key, entry);
    for (const [key, entry] of requests)
      if (alias(entry.id) === family) requests.delete(key);
    bytes -= sizes.get(family)!;
    recent.delete(family);
  }
  for (const family of recent.keys())
    if (!sizes.has(family)) recent.delete(family);
  for (const [key, entry] of requests) {
    if (requests.size <= FONT_CACHE_REQUESTS) break;
    if (!entry.pending) requests.delete(key);
  }
}
let customGeneration = 0;
let lifecycle = 0;
let customRevision: unknown;

function forgetFace(key: string, entry: LoadedFace) {
  if (entry.font) entry.fonts.delete(entry.font);
  loaded.delete(key);
}

export async function loadPayload(
  payload: FacePayload[],
  fonts = document.fonts,
) {
  const epoch = lifecycle;
  const generation = customGeneration;
  for (const face of payload) {
    touch(face.family);
    if (
      epoch !== lifecycle ||
      (face.revision && generation !== customGeneration)
    )
      return;
    // Previews and live rules share the same decoded face.
    const key = JSON.stringify([
      face.family,
      face.weight,
      face.style,
      face.unicodeRange ?? "",
    ]);
    const existing = loaded.get(key);
    if (
      existing &&
      existing.fonts === fonts &&
      existing.revision === face.revision
    ) {
      await existing.promise;
      continue;
    }
    if (existing) forgetFace(key, existing);
    const entry: LoadedFace = {
      family: face.family,
      revision: face.revision,
      bytes: 0,
      fonts,
      promise: Promise.resolve(),
    };
    entry.promise = (async () => {
      const bytes = decodeBase64(face.bytes);
      entry.bytes = bytes.byteLength;
      const font = new FontFace(face.family, bytes.buffer, {
        weight: face.weight,
        style: face.style,
        ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
      });
      await font.load();
      // A replacement or clear may have superseded this in-flight decode.
      if (loaded.get(key) === entry) {
        fonts.add(font);
        entry.font = font;
      }
    })();
    loaded.set(key, entry);
    try {
      await entry.promise;
    } catch {
      if (loaded.get(key) === entry) loaded.delete(key);
      throw Error(
        "The font could not be decoded. Choose another face or check your custom font.",
      );
    }
  }
  trimFonts();
}

export async function loadFont(
  request: FontRequest,
  context: "panel" | "content" = "panel",
) {
  if (request.id.startsWith("system:") || request.id.startsWith("local:"))
    return;
  if (request.id.startsWith("custom:")) {
    const saved = await chrome.storage.local.get(CUSTOM_FONTS_REVISION_KEY);
    const revision = saved[CUSTOM_FONTS_REVISION_KEY];
    if (revision !== customRevision) {
      for (const [key, entry] of requests)
        if (entry.id.startsWith("custom:")) requests.delete(key);
      for (const [key, entry] of loaded)
        if (entry.family.startsWith("Fontzie-custom-")) forgetFace(key, entry);
      customRevision = revision;
      customGeneration++;
    }
  }
  touch(alias(request.id));
  const key = fontRequestKey(request);
  const existing = requests.get(key);
  if (existing) {
    requests.delete(key);
    requests.set(key, existing);
    return existing.promise;
  }
  // Reuse a completed delivery only when every subset covers this weight.
  // Custom families can mix static and variable files at the same weight, so
  // only remote deliveries can share coverage across distinct requests.
  for (const entry of request.id.startsWith("custom:") ? [] : requests.values())
    if (
      !entry.pending &&
      entry.id === request.id &&
      entry.style === request.style &&
      entry.range &&
      request.weight >= entry.range.min &&
      request.weight <= entry.range.max
    )
      return entry.promise;
  const generation = customGeneration;
  const epoch = lifecycle;
  const entry: FontLoad = {
    id: request.id,
    style: request.style,
    promise: Promise.resolve(),
    pending: true,
  };
  entry.promise = (async () => {
    const result = await chrome.runtime.sendMessage(
      context === "content"
        ? { channel: "fontzie-content", type: "font", ...request }
        : { channel: "fontzie-font", ...request },
    );
    if (!result?.ok) throw Error(result?.error ?? "Could not load this font.");
    if (epoch !== lifecycle) return;
    if (request.id.startsWith("custom:") && generation !== customGeneration)
      return loadFont(request, context);
    if (requests.get(key) === entry) {
      const payload = result.data as FacePayload[];
      await loadPayload(payload);
      const ranges = payload.map((face) => {
        const weights = face.weight.trim().split(/\s+/).map(Number);
        return { min: weights[0] ?? NaN, max: weights[1] ?? weights[0] ?? NaN };
      });
      if (
        ranges.length &&
        payload.every(
          (face) =>
            face.family === alias(request.id) && face.style === request.style,
        )
      ) {
        const min = Math.max(...ranges.map((range) => range.min));
        const max = Math.min(...ranges.map((range) => range.max));
        if (Number.isFinite(min) && Number.isFinite(max) && min <= max)
          entry.range = { min, max };
      }
    }
  })();
  requests.set(key, entry);
  try {
    await entry.promise;
  } catch (error) {
    if (requests.get(key) === entry) requests.delete(key);
    throw error;
  } finally {
    entry.pending = false;
    trimFonts();
  }
}

export function clearLoadedFonts() {
  for (const [key, entry] of loaded) forgetFace(key, entry);
  requests.clear();
  retained.clear();
  recent.clear();
  lifecycle++;
}

export function pruneCustomFonts(keep: Set<string>) {
  for (const [key, entry] of loaded)
    if (entry.family.startsWith("Fontzie-custom-") && !keep.has(entry.family))
      forgetFace(key, entry);
  for (const [key, entry] of requests)
    if (entry.id.startsWith("custom:") && !keep.has(alias(entry.id)))
      requests.delete(key);
  trimFonts();
}
