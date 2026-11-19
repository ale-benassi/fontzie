import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alias,
  availableAxes,
  availableWeights,
  closestWeight,
  fontVariantPatch,
  supportsWeight,
} from "../../core/fonts";
import { validateFontRule } from "../../core/font-rules";
import { exportCSS } from "../../core/css";
import {
  newRule,
  parseConfig,
  type Axis,
  type FontFamily,
} from "../../core/schema";
import { groupFamilies, type CustomFace } from "../../storage/fonts";
import { createLibraryService } from "../../background/library";
import type { createPanelService } from "../../background/panel";
import { deliverFont } from "../../providers/delivery";

const storage = vi.hoisted(() => ({ allFaces: vi.fn(), familyFaces: vi.fn() }));
vi.mock("../../storage/fonts", async (original) => ({
  ...(await original<typeof import("../../storage/fonts")>()),
  allFaces: storage.allFaces,
  familyFaces: storage.familyFaces,
}));
vi.mock("../../providers/catalog", () => ({
  loadCatalog: vi.fn(async () => {}),
  findFont: (id: string, custom: FontFamily[] = []) =>
    custom.find((font) => font.id === id),
}));

const axis = (tag: string, min: number, max: number, initial = min): Axis => ({
  tag,
  min,
  max,
  default: initial,
});
const face = (
  weight: number,
  style = "normal",
  axes: Axis[] = [],
  family = "Audit Sans",
) => ({
  family,
  weight,
  style,
  axes,
});
function ruleFor(
  font: FontFamily,
  weight: number,
  style = "normal",
  variations?: string,
) {
  const rule = newRule("h1");
  rule.font = { id: font.id, family: font.family, provider: font.provider };
  rule.properties = {
    "font-family": `"${font.family}", sans-serif`,
    "font-weight": String(weight),
    "font-style": style as "normal" | "italic",
    ...(variations ? { "font-variation-settings": variations } : {}),
  };
  return rule;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("custom font identity", () => {
  it("keeps punctuation, case and Unicode identities distinct in CSS family matching", () => {
    const ids = [
      "custom:Acme Sans",
      "custom:Acme-Sans",
      "custom:Acme_Sans",
      "custom:Acme:Sans",
      "custom:acme sans",
      "custom:Acme Sáns",
      "custom:Acme Sa\u0301ns",
      "custom:Acme 🅰",
    ];
    const families = ids.map(alias);
    expect(new Set(families.map((family) => family.toLowerCase())).size).toBe(
      ids.length,
    );
    expect(
      families.every((family) => /^Fontzie-custom-[a-z0-9-]+$/i.test(family)),
    ).toBe(true);
    expect(alias(ids[0]!)).toBe(families[0]);
    expect(alias("google:inter")).toBe("Fontzie-google-inter");
  });

  it("keeps existing saved font references and readable exports unchanged", () => {
    const font = groupFamilies([face(400, "normal", [], "Acme Sans")])[0]!;
    const saved = { version: 1, preview: true, rules: [ruleFor(font, 400)] };
    const restored = parseConfig(JSON.parse(JSON.stringify(saved)));
    expect(restored.rules[0]!.font).toEqual(saved.rules[0]!.font);
    const output = exportCSS(restored);
    expect(output).toContain('font-family: "Acme Sans", sans-serif;');
    expect(output).not.toContain(alias(font.id));
    expect(() => validateFontRule(restored.rules[0]!, font)).not.toThrow();
  });
});

describe("custom face availability", () => {
  it("offers and chooses only the weights provided by the selected style", () => {
    const font = groupFamilies([face(400), face(700, "italic")])[0]!;
    expect(font.faces).toEqual([
      { weight: 400, style: "normal", url: "", variable: false, axes: [] },
      { weight: 700, style: "italic", url: "", variable: false, axes: [] },
    ]);
    expect(availableWeights(font, "normal")).toEqual([400]);
    expect(availableWeights(font, "italic")).toEqual([700]);
    expect(availableWeights(font, "oblique")).toEqual([]);
    expect(closestWeight(font, 700, "normal")).toBe(400);
    expect(closestWeight(font, 400, "italic")).toBe(700);
    expect(() => validateFontRule(ruleFor(font, 700), font)).toThrow(
      "weight 700 in normal",
    );
    expect(() =>
      validateFontRule(ruleFor(font, 700, "italic"), font),
    ).not.toThrow();
  });

  it("does not lend a variable face's axes to a static face or another style", () => {
    const font = groupFamilies([
      face(200, "normal", [
        axis("wght", 100, 400, 200),
        axis("wdth", 75, 125, 100),
      ]),
      face(700, "italic"),
    ])[0]!;
    expect(availableWeights(font, "normal")).toEqual([100, 200, 300, 400]);
    expect(closestWeight(font, 325, "normal")).toBe(325);
    expect(closestWeight(font, 325, "italic")).toBe(700);
    expect(availableAxes(font, "italic", 700)).toEqual([]);
    expect(() =>
      validateFontRule(ruleFor(font, 700, "italic", '"wdth" 100'), font),
    ).toThrow("Axis wdth");
    expect(() =>
      validateFontRule(ruleFor(font, 325, "normal", '"wdth" 110'), font),
    ).not.toThrow();
  });

  it("preserves gaps between variable files instead of creating a continuous range", () => {
    const font = groupFamilies([
      face(200, "normal", [axis("wght", 100, 300, 200)]),
      face(800, "normal", [axis("wght", 700, 900, 800)]),
    ])[0]!;
    expect(availableWeights(font)).toEqual([100, 200, 300, 700, 800, 900]);
    expect(supportsWeight(font, 500)).toBe(false);
    expect(closestWeight(font, 550)).toBe(700);
    expect(availableAxes(font, "normal", 800)).toEqual([
      axis("wght", 700, 900, 800),
    ]);
    expect(() => validateFontRule(ruleFor(font, 500), font)).toThrow(
      "weight 500",
    );
    expect(() =>
      validateFontRule(ruleFor(font, 800, "normal", '"wght" 200'), font),
    ).toThrow("Axis wght");
    expect(
      fontVariantPatch(font, ruleFor(font, 200).properties, { weight: 800 })[
        "font-variation-settings"
      ],
    ).toBe('"wght" 800');
  });

  it("switches style to a real weight and drops axes unavailable on its static face", () => {
    const font = groupFamilies([
      face(400, "normal", [
        axis("wght", 100, 900, 400),
        axis("wdth", 75, 125, 100),
        axis("opsz", 8, 72, 14),
      ]),
      face(700, "italic"),
    ])[0]!;
    const original = ruleFor(
      font,
      400,
      "normal",
      '"wght" 400, "wdth" 110, "opsz" 24',
    );
    original.properties["font-stretch"] = "110%";
    original.properties["font-optical-sizing"] = "none";
    const patch = fontVariantPatch(font, original.properties, {
      style: "italic",
    });
    expect(patch).toEqual({
      "font-style": "italic",
      "font-weight": "700",
      "font-variation-settings": undefined,
      "font-stretch": undefined,
      "font-optical-sizing": undefined,
    });
    expect(() =>
      validateFontRule(
        { ...original, properties: { ...original.properties, ...patch } },
        font,
      ),
    ).not.toThrow();
  });

  it("keeps an italic axis override when changing weight in a single style font", () => {
    const font = groupFamilies([
      face(400, "normal", [axis("wght", 100, 900, 400), axis("ital", 0, 1, 0)]),
    ])[0]!;
    const rule = ruleFor(font, 400, "normal", '"ital" 1');
    const patch = fontVariantPatch(font, rule.properties, { weight: 600 });
    expect(patch["font-style"]).toBe("normal");
    expect(patch["font-variation-settings"]).toBe('"ital" 1, "wght" 600');
  });

  it("moves between disjoint weight ranges while preserving supported width and optical settings", () => {
    const font = groupFamilies([
      face(200, "normal", [
        axis("wght", 100, 300, 200),
        axis("wdth", 75, 150, 100),
        axis("opsz", 8, 72, 14),
      ]),
      face(800, "normal", [
        axis("wght", 700, 900, 800),
        axis("wdth", 90, 120, 100),
        axis("opsz", 14, 48, 14),
      ]),
    ])[0]!;
    const original = ruleFor(
      font,
      200,
      "normal",
      '"wght" 200, "wdth" 140, "opsz" 32',
    );
    original.properties["font-stretch"] = "140%";
    original.properties["font-optical-sizing"] = "none";
    const properties = {
      ...original.properties,
      ...fontVariantPatch(font, original.properties, { weight: 800 }),
    };
    expect(properties["font-weight"]).toBe("800");
    expect(properties["font-variation-settings"]).toBe(
      '"wght" 800, "wdth" 120, "opsz" 32',
    );
    expect(properties["font-stretch"]).toBe("120%");
    expect(properties["font-optical-sizing"]).toBe("none");
    expect(() =>
      validateFontRule({ ...original, properties }, font),
    ).not.toThrow();
  });

  it("limits overlapping files to axis values they can both render", () => {
    const font = groupFamilies([
      face(400, "normal", [
        axis("wght", 100, 900, 400),
        axis("wdth", 50, 100, 75),
      ]),
      face(400, "normal", [
        axis("wght", 300, 700, 400),
        axis("wdth", 75, 125, 100),
      ]),
    ])[0]!;
    expect(availableAxes(font, "normal", 500)).toEqual([
      axis("wght", 300, 700, 400),
      axis("wdth", 75, 100, 75),
    ]);
    expect(() =>
      validateFontRule(ruleFor(font, 500, "normal", '"wdth" 60'), font),
    ).toThrow("Axis wdth");
    expect(() =>
      validateFontRule(ruleFor(font, 500, "normal", '"wdth" 90'), font),
    ).not.toThrow();
  });

  it("detaches only the unavailable face and keeps rules using other files in the family", async () => {
    const original = groupFamilies([
      face(400),
      face(700),
      face(400, "italic"),
    ])[0]!;
    storage.allFaces.mockResolvedValue([face(700), face(400, "italic")]);
    const removed = ruleFor(original, 400);
    const retained = ruleFor(original, 400, "italic");
    vi.stubGlobal("chrome", {
      storage: {
        session: {
          get: vi.fn(async () => ({
            "tab:1": {
              config: { version: 1, preview: true, rules: [removed, retained] },
            },
          })),
        },
      },
    });
    const updateConfig = vi.fn<
      ReturnType<typeof createPanelService>["updateConfig"]
    >(async (_tabId, update) =>
      update({ version: 1, preview: true, rules: [removed, retained] }),
    );
    const result = await createLibraryService({
      handle: vi.fn(),
      clearAllData: vi.fn(),
      updateConfig,
    }).reconcileFonts(1);
    expect(result?.rules).toEqual([
      {
        ...removed,
        font: undefined,
        properties: { "font-weight": "400", "font-style": "normal" },
      },
      retained,
    ]);
    expect(updateConfig).toHaveBeenCalledWith(1, expect.any(Function));
  });

  it("rejects a request outside a custom face's variable range even if metadata weight matches", async () => {
    storage.familyFaces.mockResolvedValue([
      {
        ...face(400, "normal", [axis("wght", 600, 900, 700)]),
        id: "variable",
        fileName: "variable.woff2",
        mime: "font/woff2",
        bytes: new Uint8Array([1, 2, 3]).buffer,
      } satisfies CustomFace,
    ]);
    await expect(
      deliverFont("custom:Audit Sans", 400, "normal"),
    ).rejects.toThrow("no matching weight or style");
  });
});
