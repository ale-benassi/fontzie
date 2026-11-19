import { afterEach, expect, it, vi } from "vitest";
import { emptyConfig, newRule } from "../../core/schema";
import google from "../../catalogs/google.json";
import fontshare from "../../catalogs/fontshare.json";
afterEach(() => {
  vi.unstubAllGlobals();
});
it("loads bundled metadata once on demand and supports custom overrides", async () => {
  const { catalog, loadCatalog, findFont } =
    await import("../../providers/catalog");
  expect(catalog).toHaveLength(3);
  const fetchCatalog = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.endsWith("google.json") ? google : fontshare),
  }));
  vi.stubGlobal("chrome", {
    runtime: { getURL: (path: string) => "chrome-extension://fixture/" + path },
  });
  vi.stubGlobal("fetch", fetchCatalog);
  await Promise.all([loadCatalog(), loadCatalog()]);
  await loadCatalog();
  expect(fetchCatalog).toHaveBeenCalledTimes(2);
  expect(catalog).toHaveLength(2023);
  const font = findFont("google:inter")!;
  expect(font.family).toBe("Inter");
  const custom = { ...font, family: "Private override" };
  expect(findFont(font.id, [custom])).toBe(custom);
  expect(findFont("missing")).toBeUndefined();
});

it("restores other settings on disabled legacy rules and preserves available or user-supplied families", async () => {
  vi.resetModules();
  vi.stubGlobal("chrome", { runtime: { getURL: (path: string) => path } });
  vi.stubGlobal("fetch", async (path: string) => ({
    ok: true,
    json: async () => (path.endsWith("fontshare.json") ? fontshare : []),
  }));
  const { restoreFontshareFonts } = await import("../../providers/catalog");
  const originalRule = newRule("p");
  const old = { ...originalRule };
  old.enabled = false;
  old.font = {
    id: "fontshare:satoshi",
    provider: "fontshare",
    family: "Satoshi",
  };
  old.properties = {
    "font-family": '"Satoshi"',
    "font-synthesis": "none",
    "font-variation-settings": '"wght" 537',
    "font-weight": "537",
    "font-style": "italic",
    "line-height": "1.4",
  };
  const allowed = {
    ...newRule("h1"),
    properties: { "font-family": '"Work Sans"' },
    font: {
      id: "fontshare:work-sans",
      provider: "fontshare" as const,
      family: "Work Sans",
    },
  };
  const custom = {
    ...newRule("h2"),
    properties: { "font-family": '"Satoshi"' },
    font: {
      id: "custom:Satoshi",
      provider: "custom" as const,
      family: "Satoshi",
    },
  };
  const original = { ...emptyConfig(), rules: [old, allowed, custom] };
  const warnings = new Set<string>();
  const result = await restoreFontshareFonts(original, warnings);
  expect(result.rules[0]).toEqual({
    ...originalRule,
    enabled: false,
    properties: {
      "font-weight": "537",
      "font-style": "italic",
      "line-height": "1.4",
    },
  });
  expect(result.rules[1]).toBe(allowed);
  expect(result.rules[2]).toBe(custom);
  expect(old.font.family).toBe("Satoshi");
  expect([...warnings]).toEqual([
    "The Fontshare font “Satoshi” is unavailable. Choose another family to replace it.",
  ]);
});
