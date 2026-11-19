import { describe, expect, it } from "vitest";
import { applyFontToRule } from "../../core/bulk-typography";
import { validateFontRule } from "../../core/font-rules";
import {
  configSchema,
  emptyConfig,
  newRule,
  type Config,
  type FontFamily,
  type Properties,
} from "../../core/schema";

const replacement: FontFamily = {
  id: "custom:Replacement",
  family: "Replacement",
  provider: "custom",
  category: "sans-serif",
  weights: [400, 700],
  styles: ["normal", "italic"],
  axes: [],
};

function replace(properties: Properties, font = replacement) {
  const config: Config = {
    ...emptyConfig(),
    rules: [{ ...newRule("h1"), properties }],
  };
  const rule = config.rules[0]!;
  applyFontToRule(rule, font);
  expect(() => configSchema.parse(config)).not.toThrow();
  expect(() => validateFontRule(rule, font)).not.toThrow();
  return rule.properties;
}

describe("choosing a font for a checked rule", () => {
  it.each(["normal", "italic", "oblique"] as const)(
    "retains supported weight and %s style for each rule",
    (style) => {
      const font = { ...replacement, styles: ["normal", "italic", "oblique"] };
      for (const weight of [400, 700]) {
        expect(
          replace({ "font-weight": String(weight), "font-style": style }, font),
        ).toMatchObject({ "font-weight": String(weight), "font-style": style });
      }
    },
  );

  it.each([
    { styles: ["normal", "italic"], desired: "oblique", expected: "normal" },
    { styles: ["italic"], desired: "normal", expected: "italic" },
    { styles: ["oblique"], desired: "italic", expected: "oblique" },
  ] as const)(
    "falls back from $desired to $expected",
    ({ styles, desired, expected }) => {
      expect(
        replace(
          { "font-style": desired, "font-weight": "700" },
          { ...replacement, styles: [...styles] },
        ),
      ).toMatchObject({ "font-style": expected, "font-weight": "700" });
    },
  );

  it("chooses the nearest weight provided by the retained or fallback style", () => {
    const font: FontFamily = {
      ...replacement,
      faces: [
        { weight: 400, style: "normal", url: "", axes: [] },
        { weight: 700, style: "italic", url: "", axes: [] },
      ],
    };
    expect(
      replace({ "font-weight": "700", "font-style": "normal" }, font),
    ).toMatchObject({ "font-weight": "400", "font-style": "normal" });
    expect(
      replace({ "font-weight": "400", "font-style": "italic" }, font),
    ).toMatchObject({ "font-weight": "700", "font-style": "italic" });
    expect(
      replace({ "font-weight": "650", "font-style": "oblique" }, font),
    ).toMatchObject({ "font-weight": "400", "font-style": "normal" });
  });

  it("keeps inherited descriptors unless the font requires a supported fallback", () => {
    expect(replace({})).toEqual({
      "font-family": '"Replacement", sans-serif',
    });
    expect(
      replace({}, { ...replacement, weights: [500], styles: ["italic"] }),
    ).toMatchObject({ "font-weight": "500", "font-style": "italic" });
    expect(replace({ "font-weight": "620" })["font-weight"]).toBe("700");
  });

  it("retains intermediate variable weights and clamps weights outside the range", () => {
    const font: FontFamily = {
      ...replacement,
      provider: "google",
      axes: [{ tag: "wght", min: 200, max: 800, default: 400 }],
    };
    for (const [desired, expected] of [
      [325, 325],
      [150, 200],
      [900, 800],
    ]) {
      expect(
        replace(
          { "font-weight": String(desired), "font-style": "italic" },
          font,
        ),
      ).toMatchObject({
        "font-weight": String(expected),
        "font-style": "italic",
      });
    }
  });

  it("respects gaps and style-specific variable ranges without borrowing another face's axes", () => {
    const font: FontFamily = {
      ...replacement,
      axes: [{ tag: "wght", min: 100, max: 900, default: 400 }],
      faces: [
        {
          weight: 200,
          style: "normal",
          url: "",
          variable: true,
          axes: [{ tag: "wght", min: 100, max: 300, default: 200 }],
        },
        {
          weight: 800,
          style: "normal",
          url: "",
          variable: true,
          axes: [{ tag: "wght", min: 700, max: 900, default: 800 }],
        },
        { weight: 700, style: "italic", url: "", axes: [] },
      ],
    };
    for (const [desired, expected] of [
      [225, 225],
      [550, 700],
      [950, 900],
    ]) {
      expect(
        replace({ "font-weight": String(desired) }, font)["font-weight"],
      ).toBe(String(expected));
    }
    expect(
      replace({ "font-weight": "325", "font-style": "italic" }, font),
    ).toMatchObject({ "font-weight": "700", "font-style": "italic" });
  });

  it("preserves unrelated properties and the targets of visible and hidden rules", () => {
    const original: Config = {
      ...emptyConfig(),
      preview: false,
      rules: [
        {
          ...newRule("h1"),
          properties: { "font-weight": "700", "font-style": "italic" },
        },
        {
          ...newRule("p"),
          enabled: false,
          frameId: 3,
          frameUrl: "https://frame.test/",
          targets: [
            { kind: "exact", selector: "p", handle: "picked-paragraph" },
          ],
          properties: {
            "font-weight": "400",
            "font-style": "normal",
            "font-size": "24px",
            "line-height": "1.5",
            "letter-spacing": "2px",
            "font-stretch": "110%",
            "font-optical-sizing": "none",
            "font-feature-settings": '"liga" 0',
            "font-variation-settings": '"wght" 900, "ital" 1, "opsz" 24',
          },
        },
      ],
    };
    const result = structuredClone(original);
    for (const rule of result.rules) applyFontToRule(rule, replacement);
    expect(result.preview).toBe(false);
    expect(result.rules).toHaveLength(original.rules.length);
    for (const [index, rule] of result.rules.entries()) {
      const {
        font: _oldFont,
        properties: oldProperties,
        ...oldRule
      } = original.rules[index]!;
      const { font, properties, ...rest } = rule;
      expect(rest).toEqual(oldRule);
      expect(font).toEqual({
        id: replacement.id,
        family: replacement.family,
        provider: replacement.provider,
      });
      expect(properties["font-family"]).toBe('"Replacement", sans-serif');
      expect(properties["font-variation-settings"]).toBeUndefined();
      for (const [key, value] of Object.entries(oldProperties)) {
        if (key !== "font-variation-settings")
          expect(properties[key as keyof Properties]).toBe(value);
      }
      expect(() => validateFontRule(rule, replacement)).not.toThrow();
    }
    expect(() => configSchema.parse(result)).not.toThrow();
  });

  it("clears old variation overrides even if the replacement supports their tags", () => {
    const font: FontFamily = {
      ...replacement,
      axes: [
        { tag: "wght", min: 100, max: 900, default: 400 },
        { tag: "opsz", min: 8, max: 72, default: 14 },
      ],
    };
    expect(
      replace(
        {
          "font-weight": "325",
          "font-style": "italic",
          "font-variation-settings": '"wght" 850, "opsz" 24, "ital" 0',
        },
        font,
      ),
    ).toEqual({
      "font-family": '"Replacement", sans-serif',
      "font-weight": "325",
      "font-style": "italic",
    });
  });

  it("keeps system font stacks unquoted", () => {
    expect(
      replace({}, { ...replacement, provider: "system", family: "Georgia" })[
        "font-family"
      ],
    ).toBe("Georgia");
  });
});
