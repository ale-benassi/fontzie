import { describe, it, expect } from "vitest";
import { newRule, emptyConfig, parseConfig } from "../../core/schema";
import { withTargets, ruleQuery } from "../../core/targets";
import { exportPrompt } from "../../core/export-prompt";
import { engineCSS, exportCSS } from "../../core/css";
import { selectorFor } from "../../content/inspector";

describe("mixed targeting", () => {
  it("accepts generated child selectors when saving and exporting an exact pick", () => {
    const parent = {
      localName: "span",
      id: "",
      parentElement: null,
      children: [] as unknown[],
    };
    const target = {
      localName: "em",
      id: "",
      classList: [],
      parentElement: parent,
      getRootNode: () => ({
        querySelectorAll: (selector: string) =>
          selector === "em" ? [{}, {}] : [{}],
      }),
    };
    parent.children.push(target);
    // Only selector generation's DOM surface is needed for this fixture.
    const selector = selectorFor(target as unknown as Element);
    expect(selector).toBe("span > em");
    const rule = withTargets(newRule(""), [
      { kind: "exact", selector, handle: "picked-em" },
    ]);
    rule.properties = { "font-size": "20px" };
    const config = parseConfig({ ...emptyConfig(), rules: [rule] });
    expect(engineCSS(config, 0)).toContain(
      '[data-fontzie-target~="picked-em"]',
    );
    expect(exportCSS(config)).toContain("span > em");
    expect(
      parseConfig({ ...emptyConfig(), rules: [newRule("span > em")] }),
    ).toBeDefined();
  });
  it.each(["<em>", "p { color: red }", "p\nspan"])(
    "continues rejecting markup and style blocks in %s",
    (selector) => {
      expect(() =>
        parseConfig({ ...emptyConfig(), rules: [newRule(selector)] }),
      ).toThrow();
    },
  );
  it("applies an exact handle alongside CSS and exports readable selectors with a warning", () => {
    const rule = withTargets(newRule(""), [
      { kind: "exact", selector: ".card", handle: "pick-one" },
      { kind: "selector", selector: "p" },
    ]);
    rule.properties = { "font-size": "30px" };
    const config = parseConfig({ ...emptyConfig(), rules: [rule] });
    expect(ruleQuery(rule)).toBe('[data-fontzie-target~="pick-one"], p');
    expect(engineCSS(config, 0)).toContain(
      '[data-fontzie-target~="pick-one"], p',
    );
    expect(engineCSS(config, 0)).not.toContain(".card");
    expect(exportCSS(config)).toContain(".card, p");
    expect(exportCSS(config)).toContain("Exact pick");
    expect(exportCSS(config)).not.toContain("pick-one");
    const prompt = exportPrompt(config.rules, "", {
      url: "https://example.com",
      title: "Example",
    });
    expect(prompt).toContain('"kind": "exact"');
    expect(prompt).toContain('"kind": "selector"');
    expect(prompt).not.toContain("pick-one");
  });
  it("retains distinct picked nodes sharing a selector and never broadens an unbound pick", () => {
    const rule = withTargets(newRule(""), [
      { kind: "exact", selector: ".card", handle: "first" },
      { kind: "exact", selector: ".card", handle: "second" },
      { kind: "exact", selector: ".card", handle: "first" },
      { kind: "selector", selector: ".card" },
      { kind: "selector", selector: ".card" },
    ]);
    expect(rule.targets).toHaveLength(3);
    expect(
      ruleQuery(
        withTargets(newRule(""), [{ kind: "exact", selector: ".card" }]),
      ),
    ).toBe(":not(*)");
  });
});
