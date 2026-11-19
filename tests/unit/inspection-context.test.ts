import { afterEach, expect, it, vi } from "vitest";
import { Inspector } from "../../content/inspector";
import { fontSampleStyle } from "../../core/font-sample";
import { newRule } from "../../core/schema";

afterEach(() => vi.unstubAllGlobals());

function page() {
  const documentElement = element("html", "20px");
  const document = { documentElement };
  vi.stubGlobal("location", { href: "https://example.test/" });
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  vi.stubGlobal("getComputedStyle", (value: { fontSize: string }) => ({
    fontSize: value.fontSize,
    getPropertyValue: (property: string) =>
      property === "font-size" ? value.fontSize : "normal",
  }));
  class ShadowRoot {
    constructor(public host: ReturnType<typeof element>) {}
  }
  vi.stubGlobal("ShadowRoot", ShadowRoot);
  function element(tag: string, fontSize: string) {
    return {
      localName: tag,
      id: tag,
      fontSize,
      classList: [],
      textContent: "Page text",
      getAttribute: () => null,
      setAttribute: vi.fn(),
      getBoundingClientRect: () => ({ width: 200, height: 100 }),
    };
  }
  const root = {
    ...documentElement,
    ownerDocument: document,
    getRootNode: () => document,
  };
  document.documentElement = root;
  const inspect = (value: object) =>
    // These DOM fixtures implement the surface Inspector reads.
    new Inspector(
      () => {},
      () => {},
    ).inspect(value as Element);
  return { document, element, ShadowRoot, root, inspect };
}

it("captures the page root and inherited parent sizes for relative previews across shadow and slot boundaries", () => {
  const { document, element, ShadowRoot, inspect } = page();
  const host = element("article", "24px");
  const shadow = new ShadowRoot(host);
  const target = {
    ...element("p", "28px"),
    ownerDocument: document,
    getRootNode: () => shadow,
  };
  const selection = inspect(target);
  expect(selection.typographyContext).toEqual({
    rootFontSize: 20,
    parentFontSize: 24,
  });
  const rule = newRule("p");
  rule.properties["font-size"] = "2em";
  expect(fontSampleStyle(rule, selection)["font-size"]).toBe("48px");
  expect(
    inspect({ ...target, assignedSlot: element("slot", "30px") })
      .typographyContext?.parentFontSize,
  ).toBe(30);
});

it("uses the explicit fallback for a root target instead of multiplying its resulting font size again", () => {
  const { root, inspect } = page();
  const selection = inspect(root);
  expect(selection.typographyContext).toBeUndefined();
  const rule = newRule("html");
  rule.properties["font-size"] = "2rem";
  expect(fontSampleStyle(rule, selection)["font-size"]).toBe("32px");
});
