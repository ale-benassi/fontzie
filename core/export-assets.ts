import type { CustomFace } from "../storage/fonts";
import { quote } from "./css";
export function assetName(face: Pick<CustomFace, "id" | "fileName">) {
  const ext = face.fileName.split(".").pop()?.toLowerCase() ?? "woff2";
  return `${face.id}.${ext}`;
}
export function customFaceCSS(
  faces: Array<Omit<CustomFace, "bytes">>,
  families: string[],
) {
  return faces
    .filter((f) => families.includes(f.family))
    .map((f) => {
      const axis = f.axes.find((a) => a.tag === "wght");
      const ext = f.fileName.split(".").pop()?.toLowerCase();
      const format =
        ext === "ttf" ? "truetype" : ext === "otf" ? "opentype" : ext;
      return `@font-face {\n  font-family: ${quote(f.family)};\n  src: url("./fonts/${assetName(f)}") format("${format}");\n  font-weight: ${axis ? `${axis.min} ${axis.max}` : f.weight};\n  font-style: ${f.style};\n  font-display: swap;\n}`;
    })
    .join("\n\n");
}
