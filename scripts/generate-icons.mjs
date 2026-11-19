import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";

// Preserve the complete mark. A pale outline stays visible on dark toolbars;
// the charcoal fill stays visible on light ones, with no background tile.
const mark = (await readFile("public/branding/fontzie-mark.svg", "utf8"))
  .replace(/<\?xml[^>]*\?>\s*/, "")
  .replace(/<!DOCTYPE[^>]*>\s*/, "")
  .replace(/<svg\b([^>]*)>/, (_, attributes) => {
    const preserved = attributes.replace(/\s(?:width|height)="[^"]*"/g, "");
    return `<svg${preserved} x="6" y="6" width="116" height="116" overflow="visible" preserveAspectRatio="xMidYMid meet">`;
  });
// Paint the outline first, then the original paths, so strokes never cover the
// artwork. Stroke units follow the source paths' existing transforms.
const outline = mark.replaceAll(
  "fill:rgb(60,60,60);",
  "fill:#f5f5f5;stroke:#f5f5f5;stroke-width:24;stroke-linejoin:round;",
);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">${outline}${mark}</svg>\n`;
await writeFile("public/icons/fontzie-mark-badge.svg", svg);
const revision = createHash("sha256").update(svg).digest("hex").slice(0, 12);
const iconFiles = new Set();
for (const size of [16, 32, 48, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
  const fileName = `fontzie-mark-badge-${revision}-${size}.png`;
  await writeFile(`public/icons/${fileName}`, png);
  iconFiles.add(fileName);
}
const panelPath = "entrypoints/sidepanel/index.html";
const panel = await readFile(panelPath, "utf8");
const favicon = /href="\/icons\/fontzie-mark-badge-(?:[a-f0-9]{12}-)?32\.png"/;
if (!favicon.test(panel)) throw Error("The panel icon reference is missing.");
await writeFile(
  panelPath,
  panel.replace(favicon, `href="/icons/fontzie-mark-badge-${revision}-32.png"`),
);
for (const fileName of await readdir("public/icons")) {
  if (
    /^fontzie-mark-badge-(?:[a-f0-9]{12}-)?(?:16|32|48|128)\.png$/.test(
      fileName,
    ) &&
    !iconFiles.has(fileName)
  )
    await unlink(`public/icons/${fileName}`);
}
console.log("Generated transparent Fontzie icons at 16, 32, 48 and 128px.");
