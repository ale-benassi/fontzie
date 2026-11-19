import { afterEach, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, type EffectScope } from "vue";
import { fontSampleStyle, fontSampleText } from "../../core/font-sample";
import { alias } from "../../core/fonts";
import {
  newRule,
  type FontFamily,
  type Inspection,
  type Rule,
} from "../../core/schema";
import { useFontSample } from "../../composables/useFontSample";
import { inspectionSchema } from "../../core/messages";

const { loadFont, retainFontFamilies, releaseFontFamilies } = vi.hoisted(
  () => ({
    loadFont: vi.fn<(...args: unknown[]) => Promise<void>>(),
    retainFontFamilies: vi.fn(),
    releaseFontFamilies: vi.fn(),
  }),
);
vi.mock("../../providers/load", () => ({
  loadFont,
  retainFontFamilies,
  releaseFontFamilies,
}));

const selection: Inspection = {
  handle: "heading",
  selector: "h1",
  tag: "h1",
  classes: [],
  identity: "h1",
  width: 500,
  height: 120,
  frameId: 0,
  url: "https://example.test",
  computed: {
    "font-family": "Georgia",
    "font-size": "32px",
    "line-height": "40px",
    "letter-spacing": "1px",
  },
  typographyContext: { rootFontSize: 20, parentFontSize: 24 },
};
const fontRule = (): Rule => ({
  ...newRule("h1"),
  font: { id: "google:inter", family: "Inter", provider: "google" },
  properties: {
    "font-family": '"Inter", sans-serif',
    "font-weight": "700",
    "font-style": "italic",
  },
});
let scope: EffectScope | undefined;
afterEach(() => {
  scope?.stop();
  scope = undefined;
  vi.resetAllMocks();
});

it("keeps a fixed phrase and applies numeric and advanced controls without fitting or clamping", () => {
  expect(fontSampleText).toBe("Good things take type.");
  const rule = fontRule();
  Object.assign(rule.properties, {
    "font-size": "72px",
    "line-height": "12px",
    "letter-spacing": "1.7px",
    "text-transform": "uppercase",
    "text-decoration": "underline",
    "text-align": "right",
    "font-stretch": "85%",
    "font-optical-sizing": "none",
    "font-variant-ligatures": "none",
    "font-feature-settings": '"ss01" 1',
    "font-variation-settings": '"wght" 700, "opsz" 48',
    "font-synthesis": "none",
  });
  const style = fontSampleStyle(rule, selection);
  expect(style).toMatchObject({
    ...rule.properties,
    "font-family": '"Fontzie-google-inter", "Inter", sans-serif',
  });
  rule.properties["font-size"] = "26px";
  rule.properties["line-height"] = "84px";
  expect(fontSampleStyle(rule, selection)).toMatchObject({
    "font-size": "26px",
    "line-height": "84px",
    "letter-spacing": "1.7px",
  });
  rule.properties["font-size"] = "1000px";
  expect(fontSampleStyle(rule, selection)["font-size"]).toBe("1000px");
});

it("resolves font size against the page context while em leading and spacing follow the resulting font size", () => {
  const rule = newRule("h1");
  rule.properties = {
    "font-size": "2rem",
    "line-height": "0.5em",
    "letter-spacing": "0.2em",
  };
  expect(fontSampleStyle(rule, selection)).toMatchObject({
    "font-size": "40px",
    "line-height": "0.5em",
    "letter-spacing": "0.2em",
  });
  rule.properties["font-size"] = "2em";
  expect(fontSampleStyle(rule, selection)["font-size"]).toBe("48px");
  expect(fontSampleStyle(rule)["font-size"]).toBe("32px");
});

it("restores inspected values on reset and clears advanced settings when switching rules", () => {
  const rule = fontRule();
  rule.properties["font-size"] = "72px";
  rule.properties["font-variation-settings"] = '"opsz" 48';
  delete rule.properties["font-size"];
  expect(fontSampleStyle(rule, selection)["font-size"]).toBe("32px");
  const switched = fontSampleStyle(newRule("p"));
  expect(switched).toMatchObject({
    "font-size": "16px",
    "font-weight": "400",
    "font-style": "normal",
    "font-variation-settings": "normal",
    "font-feature-settings": "normal",
  });
});

it("uses retained aliases for delivered fonts and original stacks for system and installed fonts", () => {
  for (const provider of [
    "google",
    "fontshare",
    "custom",
    "local",
    "system",
  ] as const) {
    const rule = fontRule();
    rule.font = { id: `${provider}:Example`, family: "Example", provider };
    const family = fontSampleStyle(rule)["font-family"];
    expect(family).toBe(
      ["system", "local"].includes(provider)
        ? rule.properties["font-family"]
        : `"${alias(rule.font.id)}", ${rule.properties["font-family"]}`,
    );
  }
});

it("loads the selected face independently of the font browser and ignores stale completions", async () => {
  let rejectFirst!: (error: Error) => void;
  loadFont.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectFirst = reject;
      }),
  );
  loadFont.mockResolvedValue(undefined);
  const props = reactive<{
    rule?: Rule;
    selection?: Inspection;
    font?: FontFamily;
  }>({ rule: fontRule() });
  scope = effectScope();
  const sample = scope.run(() => useFontSample(props))!;
  expect(loadFont).toHaveBeenLastCalledWith({
    id: "google:inter",
    weight: 700,
    style: "italic",
  });
  expect(sample.loading.value).toBe(true);
  props.rule = {
    ...newRule("p"),
    font: {
      id: "fontshare:work-sans",
      family: "Work Sans",
      provider: "fontshare",
    },
    properties: { "font-weight": "400", "font-style": "normal" },
  };
  await nextTick();
  await nextTick();
  expect(loadFont).toHaveBeenLastCalledWith({
    id: "fontshare:work-sans",
    weight: 400,
    style: "normal",
  });
  rejectFirst(Error("old request failed"));
  await nextTick();
  expect(sample.failed.value).toBe(false);
  expect(sample.loading.value).toBe(false);
  expect(sample.style.value["font-weight"]).toBe("400");
  expect(retainFontFamilies).toHaveBeenLastCalledWith(expect.any(Object), [
    "fontshare:work-sans",
  ]);
  scope.stop();
  expect(releaseFontFamilies).toHaveBeenCalled();
});

it("reports a current loading failure and reloads replacement custom bytes", async () => {
  loadFont
    .mockRejectedValueOnce(Error("decode failed"))
    .mockResolvedValue(undefined);
  const props = reactive<{ rule?: Rule; font?: FontFamily }>({
    rule: fontRule(),
  });
  scope = effectScope();
  const sample = scope.run(() => useFontSample(props))!;
  await nextTick();
  expect(sample.failed.value).toBe(true);
  props.font = {
    id: "custom:Example",
    family: "Example",
    provider: "custom",
    category: "",
    styles: ["normal"],
    weights: [400],
    axes: [],
  };
  props.rule = {
    ...fontRule(),
    font: { id: props.font.id, family: props.font.family, provider: "custom" },
  };
  await nextTick();
  await nextTick();
  const count = loadFont.mock.calls.length;
  props.font = { ...props.font };
  await nextTick();
  await nextTick();
  expect(loadFont).toHaveBeenCalledTimes(count + 1);
  expect(sample.failed.value).toBe(false);
});

it("loads inherited faces after resets and uses available faces for unsupported inherited variants", async () => {
  loadFont.mockResolvedValue(undefined);
  const rule = fontRule();
  delete rule.properties["font-weight"];
  delete rule.properties["font-style"];
  const props = reactive({
    rule,
    selection: {
      ...selection,
      computed: { "font-weight": "600", "font-style": "italic" },
    },
    font: {
      id: "google:inter",
      family: "Inter",
      provider: "google",
      category: "sans-serif",
      weights: [400, 600],
      styles: ["normal", "italic"],
      axes: [],
    } as FontFamily,
  });
  scope = effectScope();
  scope.run(() => useFontSample(props));
  expect(loadFont).toHaveBeenLastCalledWith({
    id: "google:inter",
    weight: 600,
    style: "italic",
  });
  props.font = { ...props.font, weights: [400], styles: ["normal"] };
  await nextTick();
  expect(loadFont).toHaveBeenLastCalledWith({
    id: "google:inter",
    weight: 400,
    style: "normal",
  });
});

it("accepts older inspection messages and validates optional page unit context", () => {
  expect(inspectionSchema.parse(selection).typographyContext).toEqual(
    selection.typographyContext,
  );
  expect(
    inspectionSchema.safeParse({ ...selection, typographyContext: undefined })
      .success,
  ).toBe(true);
  expect(
    inspectionSchema.safeParse({
      ...selection,
      typographyContext: { rootFontSize: -1, parentFontSize: 24 },
    }).success,
  ).toBe(false);
});
