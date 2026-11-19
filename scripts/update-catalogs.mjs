import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const read = async (url) => {
  const r = await fetch(url, {
    headers: { "User-Agent": "Fontzie catalog updater" },
  });
  if (!r.ok) throw Error(`${r.status} ${url}`);
  return r.json();
};
const sha =
  process.env.FONTSOURCE_REF ??
  (
    await read(
      "https://api.github.com/repos/fontsource/font-files/commits/main",
    )
  ).sha;
const base = `https://raw.githubusercontent.com/fontsource/font-files/${sha}/metadata/`;
const [metadata, variants, share] = await Promise.all([
  read(base + "fontsource.json"),
  read(base + "google-fonts-v1.json"),
  read("https://api.fontshare.com/v2/fonts"),
]);
const google = Object.values(metadata)
  .filter((f) => f.type === "google")
  .map((f) => ({
    id: `google:${f.id}`,
    family: f.family,
    provider: "google",
    category: f.category,
    weights: f.weights,
    styles: f.styles,
    axes: Object.entries(f.variable ?? {}).map(([tag, v]) => ({
      tag,
      min: +v.min,
      max: +v.max,
      default: +v.default,
    })),
    license: f.license?.type,
    // Per-face variants avoid inventing unavailable italic/weight combinations.
    faces: Object.entries(variants[f.id]?.variants ?? {}).flatMap(
      ([weight, styles]) =>
        Object.keys(styles).map((style) => ({
          weight: +weight,
          style,
          url: "",
        })),
    ),
  }));
if (share.has_more || share.count !== share.fonts.length)
  throw Error(
    "Fontshare pagination changed; update script before replacing the catalog.",
  );
const openFonts = share.fonts.filter((font) => font.license_type === "sil_ofl");
const fontshare = openFonts.map((f) => ({
  id: `fontshare:${f.slug}`,
  slug: f.slug,
  family: f.name,
  provider: "fontshare",
  category:
    {
      Sans: "sans-serif",
      Serif: "serif",
      Display: "display",
      Slab: "serif",
      Script: "handwriting",
      Monospace: "monospace",
    }[f.category] ?? f.category.toLowerCase(),
  weights: [
    ...new Set(
      f.styles.filter((s) => !s.is_variable).map((s) => s.weight.weight),
    ),
  ].sort((a, b) => a - b),
  styles: [
    ...new Set(f.styles.map((s) => (s.is_italic ? "italic" : "normal"))),
  ],
  axes: f.styles.some((s) => s.is_variable)
    ? f.axes.map((a) => ({
        tag: a.property,
        min: a.range_left,
        max: a.range_right,
        default: a.range_default,
      }))
    : [],
  license: f.license_type,
  faces: f.styles.map((s) => ({
    weight: s.weight.weight,
    style: s.is_italic ? "italic" : "normal",
    variable: s.is_variable,
    url: `https:${s.file}.woff2`,
  })),
}));
if (google.length < 1800 || share.fonts.length < 90 || !fontshare.length)
  throw Error("Unexpected catalog shrink.");
await mkdir("catalogs", { recursive: true });
for (const [name, data] of [
  ["google", google],
  ["fontshare", fontshare],
])
  await writeFile(`catalogs/${name}.json`, JSON.stringify(data));
await writeFile(
  "catalogs/provenance.json",
  JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      fontsourceCommit: sha,
      sources: [
        base + "fontsource.json",
        base + "google-fonts-v1.json",
        "https://api.fontshare.com/v2/fonts",
      ],
      google: google.length,
      fontshare: fontshare.length,
      hashes: {
        google: createHash("sha256")
          .update(JSON.stringify(google))
          .digest("hex"),
        fontshare: createHash("sha256")
          .update(JSON.stringify(fontshare))
          .digest("hex"),
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Bundled ${google.length} Google and ${fontshare.length} Fontshare families from ${sha}`,
);
