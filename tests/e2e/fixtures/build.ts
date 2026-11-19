import fs from "node:fs/promises";
import path from "node:path";

// Only the temporary test copy receives deterministic provider responses.
// Prepending the adapter also covers worker and browser restarts.
export async function stageExtension(
  destination: string,
  liveProviders = false,
) {
  await fs.cp(path.resolve(".output/chrome-mv3"), destination, {
    recursive: true,
  });
  const manifestPath = path.join(destination, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.host_permissions.push("http://127.0.0.1/*");
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  await fs.writeFile(
    path.join(destination, "fixture-api.html"),
    "<!doctype html><title>Fontzie test APIs</title>",
  );
  if (liveProviders) return;
  const normal = (
    await fs.readFile(
      "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
    )
  ).toString("base64");
  const italic = (
    await fs.readFile(
      "node_modules/@fontsource-variable/inter/files/inter-latin-wght-italic.woff2",
    )
  ).toString("base64");
  const widthNormal = (
    await fs.readFile(
      "node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2",
    )
  ).toString("base64");
  const widthItalic = (
    await fs.readFile(
      "node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-italic.woff2",
    )
  ).toString("base64");
  const fontshare = JSON.parse(
    await fs.readFile("catalogs/fontshare.json", "utf8"),
  ) as Array<{ faces: Array<{ style: string; url: string }> }>;
  const italicURLs = fontshare.flatMap((font) =>
    font.faces
      .filter((face) => face.style === "italic")
      .map((face) => face.url),
  );
  const script = `{
    const original = globalThis.fetch.bind(globalThis);
    const normal = ${JSON.stringify(normal)}, italic = ${JSON.stringify(italic)};
    const widthNormal = ${JSON.stringify(widthNormal)}, widthItalic = ${JSON.stringify(widthItalic)};
    const italicURLs = new Set(${JSON.stringify(italicURLs)});
    globalThis.fetch = async (input, options) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (!navigator.onLine) return original(input, options);
      if (url.hostname === "fonts.googleapis.com") {
        const family = url.searchParams.get("family") ?? "";
        const [axes, values] = (family.split(":")[1] ?? "").split("@");
        const isItalic = axes?.split(",").indexOf("ital") ?? -1;
        const style = isItalic >= 0 && values?.split(",")[isItalic] === "1" ? "italic" : "normal";
        const width = family.startsWith("Archivo:") ? "archivo-" : "";
        return new Response('@font-face { font-family: Fixture; font-style: '+style+'; font-weight: 100 900; src: url(https://fonts.gstatic.com/fontzie-fixture-'+width+style+'.woff2); }', { headers: { "Content-Type": "text/css" } });
      }
      if (url.hostname === "fonts.gstatic.com" || url.hostname === "cdn.fontshare.com") {
        const slanted = /italic/i.test(url.pathname) || italicURLs.has(url.href);
        const encoded = url.pathname.includes("archivo-") ? (slanted ? widthItalic : widthNormal) : (slanted ? italic : normal);
        return new Response(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)), { headers: { "Content-Type": "font/woff2" } });
      }
      return original(input, options);
    };
  }\n`;
  const workerPath = path.join(destination, manifest.background.service_worker);
  await fs.writeFile(
    workerPath,
    script + (await fs.readFile(workerPath, "utf8")),
  );
}
