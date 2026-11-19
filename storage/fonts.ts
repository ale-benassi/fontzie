import { openDB, type DBSchema } from "idb";
import type { FontFamily } from "../core/schema";
import { CUSTOM_FONTS_REVISION_KEY } from "../core/fonts";
export interface CustomFace {
  id: string;
  family: string;
  weight: number;
  style: string;
  axes: FontFamily["axes"];
  fileName: string;
  mime: string;
  bytes: ArrayBuffer;
}
export type CustomFontMetadata = Omit<CustomFace, "bytes"> & { size: number };
interface FontDB extends DBSchema {
  faces: {
    key: string;
    value: CustomFontMetadata;
    indexes: { family: string };
  };
  binaries: { key: string; value: ArrayBuffer };
}
let database: ReturnType<typeof openDB<FontDB>> | undefined;
const db = () =>
  (database ??= openDB<FontDB>("fontzie-fonts", 2, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      const faces =
        oldVersion === 0
          ? database.createObjectStore("faces", { keyPath: "id" })
          : transaction.objectStore("faces");
      faces.createIndex("family", "family");
      const binaries = database.createObjectStore("binaries");
      // The upgrade transaction moves existing files without losing their IDs.
      if (oldVersion === 1)
        void (async () => {
          let cursor = await faces.openCursor();
          while (cursor) {
            const { bytes, ...metadata } =
              cursor.value as unknown as CustomFace;
            await binaries.put(bytes, metadata.id);
            await cursor.update({ ...metadata, size: bytes.byteLength });
            cursor = await cursor.continue();
          }
        })().catch(() => transaction.abort());
    },
    blocking() {
      void database?.then((connection) => {
        connection.close();
        database = undefined;
      });
    },
    terminated() {
      database = undefined;
    },
  }).catch((error) => {
    database = undefined;
    throw error;
  }));
const changed = () =>
  chrome.storage.local.set({
    [CUSTOM_FONTS_REVISION_KEY]: crypto.randomUUID(),
  });
export async function saveFace(face: CustomFace | CustomFontMetadata) {
  const connection = await db();
  const transaction = connection.transaction(
    ["faces", "binaries"],
    "readwrite",
  );
  const { axes } = face;
  const metadata = {
    ...face,
    axes: axes.map(({ tag, min, max, default: initial }) => ({
      tag,
      min,
      max,
      default: initial,
    })),
    size: "bytes" in face ? face.bytes.byteLength : face.size,
  };
  if ("bytes" in metadata) delete (metadata as Partial<CustomFace>).bytes;
  await transaction.objectStore("faces").put(metadata);
  if ("bytes" in face)
    await transaction.objectStore("binaries").put(face.bytes, face.id);
  await transaction.done;
  await changed();
}
export async function allFaces() {
  return (await db()).getAll("faces");
}
export async function familyFaces(family: string): Promise<CustomFace[]> {
  const connection = await db();
  const transaction = connection.transaction(["faces", "binaries"], "readonly");
  const metadata = await transaction
    .objectStore("faces")
    .index("family")
    .getAll(family);
  const faces = await Promise.all(
    metadata.map(async ({ size: _size, ...face }) => {
      const bytes = await transaction.objectStore("binaries").get(face.id);
      if (!bytes)
        throw Error("The custom font file is missing. Import it again.");
      return { ...face, bytes };
    }),
  );
  await transaction.done;
  return faces;
}
export async function deleteFace(id: string) {
  const transaction = (await db()).transaction(
    ["faces", "binaries"],
    "readwrite",
  );
  await Promise.all([
    transaction.objectStore("faces").delete(id),
    transaction.objectStore("binaries").delete(id),
  ]);
  await transaction.done;
  await changed();
}
export async function clearFonts() {
  const transaction = (await db()).transaction(
    ["faces", "binaries"],
    "readwrite",
  );
  await Promise.all([
    transaction.objectStore("faces").clear(),
    transaction.objectStore("binaries").clear(),
  ]);
  await transaction.done;
  await changed();
}
export function groupFamilies(
  faces: Array<Pick<CustomFace, "family" | "weight" | "style" | "axes">>,
): FontFamily[] {
  const result: FontFamily[] = [];
  for (const face of faces) {
    const id = `custom:${face.family}`;
    let f = result.find((x) => x.id === id);
    if (!f) {
      f = {
        id,
        family: face.family,
        provider: "custom",
        category: "custom",
        weights: [],
        styles: [],
        axes: [],
        faces: [],
      };
      result.push(f);
    }
    if (!f.weights.includes(face.weight)) f.weights.push(face.weight);
    if (!f.styles.includes(face.style)) f.styles.push(face.style);
    f.faces!.push({
      weight: face.weight,
      style: face.style,
      url: "",
      variable: face.axes.length > 0,
      axes: face.axes.map((axis) => ({ ...axis })),
    });
    // Family-wide axes describe the catalog; editing and validation use the
    // per-face ranges above so one style never borrows another style's axes.
    for (const axis of face.axes)
      if (!f.axes.some((existing) => existing.tag === axis.tag))
        f.axes.push({ ...axis });
  }
  return result;
}
export async function ingestFont(file: File): Promise<CustomFace> {
  if (!/\.(woff2?|ttf|otf)$/i.test(file.name))
    throw Error("Choose a WOFF2, WOFF, TTF or OTF file.");
  if (file.size > 20 * 1024 * 1024 || file.size < 12)
    throw Error("Font files must be between 12 bytes and 20 MB.");
  const bytes = await file.arrayBuffer();
  const sig = new DataView(bytes).getUint32(0);
  if (
    ![0x774f4632, 0x774f4646, 0x00010000, 0x4f54544f, 0x74727565].includes(sig)
  )
    throw Error("This file does not have a supported font signature.");
  // Fontkit is bundled locally and parses WOFF2/WOFF/TTF/OTF; no service receives the file.
  const { create } = await import("fontkit");
  const { Buffer } = await import("buffer");
  let font;
  try {
    font = create(Buffer.from(bytes));
  } catch {
    throw Error("Could not read this font. Check the file and try again.");
  }
  if (!("familyName" in font))
    throw Error("Font collections are not supported. Upload individual fonts.");
  const axes = Object.entries(font.variationAxes ?? {}).map(([tag, v]) => ({
    tag,
    min: v!.min,
    max: v!.max,
    default: v!.default,
  }));
  const family = (font.familyName || file.name.replace(/\.[^.]+$/, ""))
    .replace(/[{};<>\\\n\r]/g, "")
    .slice(0, 150);
  const info = font as unknown as {
    "OS/2"?: { usWeightClass: number };
    italicAngle?: number;
    subfamilyName?: string;
  };
  return {
    id: crypto.randomUUID(),
    family,
    weight: info["OS/2"]?.usWeightClass ?? 400,
    style:
      info.italicAngle || /italic/i.test(info.subfamilyName ?? "")
        ? "italic"
        : "normal",
    axes,
    fileName: file.name,
    mime: file.type || "font/woff2",
    bytes,
  };
}
