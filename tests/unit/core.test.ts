import { describe, it, expect } from "vitest";
import {
  parseConfig,
  newRule,
  emptyConfig,
  propertiesSchema,
  configSchema,
} from "../../core/schema";
import { errorMessage } from "../../core/errors";
import { engineCSS, exportCSS } from "../../core/css";
import { History } from "../../core/history";
import { googleCSSURL, safeFontURL } from "../../providers/delivery";
import google from "../../catalogs/google.json";
import fontshare from "../../catalogs/fontshare.json";
import type { FontFamily } from "../../core/schema";
const catalog = [...google, ...fontshare] as FontFamily[];
import { availableWeights } from "../../core/fonts";
import { draftKey } from "../../storage/drafts";
import { removeLegacyBreakpointEntries } from "../../storage/migrations";
describe("configuration boundary", () => {
  it("persists untargeted rules and their typography without producing CSS", () => {
    const blank = newRule("");
    const config = { ...emptyConfig(), rules: [blank] };
    expect(parseConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
    expect(engineCSS(config, 0)).toBe("");
    expect(exportCSS(config)).not.toContain(":where()");
    for (const patch of [
      { properties: { "font-size": "20px" } },
      { font: { id: "system:serif", family: "serif", provider: "system" } },
    ]) {
      const retained = parseConfig({
        ...config,
        rules: [{ ...blank, ...patch }],
      });
      expect(engineCSS(retained, 0)).toBe("");
      expect(exportCSS(retained)).not.toContain(":where()");
    }
    for (const patch of [{ mode: "exact" }, { handle: "stale-handle" }])
      expect(
        configSchema.safeParse({ ...config, rules: [{ ...blank, ...patch }] })
          .success,
      ).toBe(false);
  });
  it("rejects executable or malformed CSS properties", () => {
    for (const value of [
      "12px; color:red",
      "url(https://evil.test)",
      "expression(alert(1))",
      "-2px",
    ])
      expect(propertiesSchema.safeParse({ "font-size": value }).success).toBe(
        false,
      );
    expect(propertiesSchema.safeParse({ color: "red" }).success).toBe(false);
    expect(
      propertiesSchema.safeParse({ "font-family": "bad; } body { color: red" })
        .success,
    ).toBe(false);
  });
  it("rejects invalid units, axes, features and unknown config versions", () => {
    expect(
      propertiesSchema.safeParse({
        "font-size": "1.2rem",
        "line-height": "1.1",
        "letter-spacing": "-0.03em",
        "font-variation-settings": '"wght" 620, "opsz" 18',
        "font-feature-settings": '"liga" 1, "ss01" 0',
      }).success,
    ).toBe(true);
    for (const p of [
      { "font-size": "20vh" },
      { "font-variation-settings": "wght 4" },
      { "font-weight": "1001" },
      { "line-height": "0" },
    ])
      expect(propertiesSchema.safeParse(p).success).toBe(false);
    expect(() =>
      parseConfig({ version: 2, rules: [], preview: true }),
    ).toThrow();
  });
  it("removes legacy responsive entries while preserving ordinary typography", () => {
    const rule = newRule(".hero");
    rule.properties = { "font-size": "2rem" };
    const config = { ...emptyConfig(), rules: [rule] };
    expect(parseConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
    const legacy = {
      ...config,
      rules: [
        {
          ...rule,
          breakpoints: Array.from({ length: 25 }, (_, i) => ({
            id: `old-${i}`,
            min: 0,
            max: 767,
            properties: { "font-size": "99px" },
          })),
        },
      ],
    };
    expect(configSchema.safeParse(legacy).success).toBe(false);
    expect(removeLegacyBreakpointEntries(legacy)).toEqual(config);
    expect(
      removeLegacyBreakpointEntries({
        config: legacy,
        selection: { selector: ".hero" },
      }),
    ).toEqual({ config, selection: { selector: ".hero" } });
    expect(
      removeLegacyBreakpointEntries([{ name: "Test", config: legacy }]),
    ).toEqual([{ name: "Test", config }]);
    expect(removeLegacyBreakpointEntries(config)).toEqual(config);
    expect(rule).not.toHaveProperty("breakpoints");
  });
  it("explains local and transported validation errors", () => {
    const invalid = propertiesSchema.safeParse({ "font-size": "bad" });
    if (invalid.success) throw Error("Expected invalid size to be rejected");
    const message =
      "Some values are invalid. Check the typography values, then try again.";
    expect(errorMessage(invalid.error)).toBe(message);
    expect(errorMessage(new Error(invalid.error.message))).toBe(message);
    expect(errorMessage(new Error("Choose a website first."))).toBe(
      "Choose a website first.",
    );
  });
});
describe("cascade and export", () => {
  it("gives top rules first-layer priority and exports them last at equal specificity", () => {
    const a = newRule("#hero"),
      b = newRule("h1");
    a.properties = { "font-size": "44px" };
    b.properties = { "font-size": "32px" };
    const css = engineCSS({ ...emptyConfig(), rules: [a, b] }, 0);
    expect(css.indexOf("44px")).toBeLessThan(css.indexOf("32px"));
    const exported = exportCSS({ ...emptyConfig(), rules: [a, b] });
    expect(exported.indexOf("32px")).toBeLessThan(exported.indexOf("44px"));
    expect(exported).toContain(":where(#hero)");
    expect(exported).toContain(":is(");
    expect(exported).toContain(":where(h1)");
    expect(css).toContain("!important");
    expect(engineCSS({ ...emptyConfig(), preview: false, rules: [a] }, 0)).toBe(
      "",
    );
  });
  it("separates frame rules and exact handles", () => {
    const r = newRule(".hero", "exact");
    r.handle = "abc";
    r.properties = { "font-size": "2em" };
    r.frameId = 2;
    expect(engineCSS({ ...emptyConfig(), rules: [r] }, 0)).toBe("");
    expect(engineCSS({ ...emptyConfig(), rules: [r] }, 2)).toContain(
      '[data-fontzie-target~="abc"]',
    );
    expect(exportCSS({ ...emptyConfig(), rules: [r] })).not.toContain(
      "data-fontzie",
    );
  });
  it("exports valid units and Tailwind v4 theme tokens", () => {
    const r = newRule(".hero");
    r.font = { id: "google:inter", family: "Inter", provider: "google" };
    r.properties = {
      "font-size": "3rem",
      "font-family": '"Inter", sans-serif',
      "font-weight": "600",
    };
    const css = exportCSS({ ...emptyConfig(), rules: [r] }, "tailwind");
    expect(css).toContain("@theme {");
    expect(css).toContain('--font-fontzie-1: "Inter", sans-serif');
    expect(css).not.toContain("@media");
    expect(css).toContain("font-size: 3rem");
    expect(css).not.toContain("!important");
  });
  it("requests the Fontshare variable face for intermediate normal and italic weights", () => {
    const rule = newRule("h1");
    rule.font = {
      id: "fontshare:work-sans",
      family: "Work Sans",
      provider: "fontshare",
    };
    rule.properties = { "font-weight": "450" };
    const config = { ...emptyConfig(), rules: [rule] };
    for (const format of ["css", "tailwind"] as const) {
      rule.properties["font-style"] = "normal";
      expect(exportCSS(config, format, undefined, catalog)).toContain(
        "work-sans@1&display",
      );
      rule.properties["font-style"] = "italic";
      expect(exportCSS(config, format, undefined, catalog)).toContain(
        "work-sans@2&display",
      );
      expect(exportCSS(config, format, undefined, catalog)).toContain(
        "font-weight: 450",
      );
    }
  });
  it("omits font imports for a retired Fontshare family", () => {
    const rule = newRule("h1");
    rule.font = {
      id: "fontshare:satoshi",
      family: "Satoshi",
      provider: "fontshare",
    };
    rule.properties = { "font-size": "23px" };
    for (const format of ["css", "tailwind"] as const) {
      const css = exportCSS(
        { ...emptyConfig(), rules: [rule] },
        format,
        undefined,
        catalog,
      );
      expect(css).not.toContain("fontshare.com");
      expect(css).toContain("font-size: 23px");
    }
  });
});
describe("history and scoping", () => {
  it("undoes, redoes, branches and isolates snapshots", () => {
    const initial = { n: 1 };
    const h = new History(initial);
    initial.n = 99;
    h.commit({ n: 2 });
    expect(h.undo()).toEqual({ n: 1 });
    expect(h.redo()).toEqual({ n: 2 });
    h.undo();
    h.commit({ n: 3 });
    expect(h.canRedo).toBe(false);
  });
  it("keeps page query and origin boundaries distinct", () => {
    expect(draftKey("https://example.com/a?q=1#x")).toBe(
      "draft:page:https://example.com/a?q=1",
    );
    expect(draftKey("https://example.com/a?q=2")).not.toBe(
      draftKey("https://example.com/a?q=1"),
    );
    expect(draftKey("https://example.com.evil/a")).not.toBe(
      draftKey("https://example.com/a"),
    );
  });
});
describe("font catalog and delivery", () => {
  it("has complete bundled catalogs with unique families and bounded axes", () => {
    expect(
      catalog.filter((f) => f.provider === "google").length,
    ).toBeGreaterThan(1900);
    const share = catalog.filter((f) => f.provider === "fontshare");
    expect(share).toHaveLength(36);
    expect(share.every((font) => font.license === "sil_ofl")).toBe(true);
    expect(share.some((font) => font.id === "fontshare:satoshi")).toBe(false);
    expect(new Set(catalog.map((f) => f.id)).size).toBe(catalog.length);
    for (const f of catalog)
      for (const a of f.axes) {
        expect(a.min).toBeLessThanOrEqual(a.default);
        expect(a.max).toBeGreaterThanOrEqual(a.default);
      }
  });
  it("requests advertised variable axes and rejects foreign delivery hosts", () => {
    const inter = catalog.find((f) => f.id === "google:inter")!;
    expect(googleCSSURL(inter, 600, "normal")).toContain(
      "ital,opsz,wght@0,14..32,100..900",
    );
    expect(
      availableWeights(catalog.find((f) => f.id === "fontshare:work-sans")!),
    ).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
    expect(() => safeFontURL("https://evil.test/font.woff2")).toThrow();
    expect(() => safeFontURL("javascript:alert(1)")).toThrow();
    expect(safeFontURL("https://fonts.gstatic.com/font.woff2")).toContain(
      "https:",
    );
  });
});
describe("custom asset export", () => {
  it("preserves uploaded format and variable descriptors", async () => {
    const { customFaceCSS, assetName } =
      await import("../../core/export-assets");
    const face = {
      id: "face-1",
      family: "My Font",
      weight: 400,
      style: "italic",
      axes: [{ tag: "wght", min: 200, max: 900, default: 400 }],
      fileName: "original.ttf",
      mime: "font/ttf",
      bytes: new ArrayBuffer(12),
    };
    expect(assetName(face)).toBe("face-1.ttf");
    const css = customFaceCSS([face], ["My Font"]);
    expect(css).toContain('format("truetype")');
    expect(css).toContain("font-weight: 200 900");
    expect(css).toContain("./fonts/face-1.ttf");
  });
});
describe("backup and Tailwind fixture", () => {
  it("round trips named presets and rejects an unsafe nested preset", async () => {
    const { parseBackup } = await import("../../core/backup");
    const backup = {
      version: 1,
      config: { ...emptyConfig(), rules: [newRule("h1")] },
      presets: [{ name: "Saved", config: emptyConfig() }],
    };
    expect(parseBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
    expect(() =>
      parseBackup({
        ...backup,
        presets: [{ name: "bad", config: { version: 5 } }],
      }),
    ).toThrow();
  });
  it("compiles exported tokens and rules with Tailwind v4", async () => {
    const { compile } = await import("tailwindcss");
    const r = newRule(".hero");
    r.properties = {
      "font-family": '"Inter", sans-serif',
      "font-size": "3rem",
      "line-height": "1.2",
      "letter-spacing": "-0.03em",
      "font-weight": "600",
    };
    const output = exportCSS({ ...emptyConfig(), rules: [r] }, "tailwind");
    const result = await compile("@tailwind utilities;\n" + output);
    const css = result.build([
      "font-fontzie-1",
      "text-fontzie-1",
      "tracking-fontzie-1",
    ]);
    expect(css).toContain(".font-fontzie-1");
    expect(css).toContain(".text-fontzie-1");
    expect(css).toContain(".tracking-fontzie-1");
    expect(css).toContain(".hero {");
  });
});
describe("advertised font bounds", () => {
  it("rejects unsupported axes and unavailable static variants", async () => {
    const { validateFontRule } = await import("../../core/font-rules");
    const font = catalog.find((f) => f.id === "google:inter")!;
    const rule = newRule("h1");
    rule.font = { id: font.id, family: font.family, provider: font.provider };
    rule.properties = {
      "font-weight": "600",
      "font-variation-settings": '"FAKE" 12',
    };
    expect(() => validateFontRule(rule, font)).toThrow("Axis");
    rule.properties = {
      "font-weight": "600",
      "font-variation-settings": '"wght" 650',
    };
    expect(() => validateFontRule(rule, font)).not.toThrow();
    rule.properties = {
      "font-weight": "600",
      "font-variation-settings": '"wght" 1200',
    };
    expect(() => validateFontRule(rule, font)).toThrow();
  });
});

describe("typography adjustment ranges", () => {
  it("uses practical unit-specific steps and preserves explicitly typed outliers", async () => {
    const { numberControl, numberStep } =
      await import("../../core/number-controls");
    expect(numberControl("size", "px", 16)).toEqual({
      min: 8,
      max: 120,
      step: 1,
    });
    expect(numberControl("size", "rem", 1)).toEqual({
      min: 0.5,
      max: 8,
      step: 0.05,
    });
    expect(numberControl("leading", "", 1.4).step).toBe(0.05);
    expect(numberControl("leading", "px", 24).step).toBe(1);
    expect(numberControl("tracking", "px", 0).step).toBe(0.1);
    expect(numberControl("tracking", "em", 0).step).toBe(0.01);
    expect(numberControl("size", "px", 240).max).toBe(240);
    expect(numberStep(0.2, 1, 0.1)).toBe(0.3);
    expect(numberStep(1.4, 1, 0.05)).toBe(1.45);
  });
});
