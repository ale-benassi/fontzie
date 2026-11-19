import { expect, it } from "vitest";
import { exportPrompt } from "../../core/export-prompt";
import { newRule } from "../../core/schema";
import { withTargets } from "../../core/targets";

const page = { url: "https://example.com/#contact", title: "Example" };

it("introduces Fontzie and describes a single verified pick without repeating the rule", () => {
  const rule = withTargets(newRule(""), [
    { kind: "exact", selector: ".kicker", handle: "private-handle" },
  ]);
  rule.properties = { "font-size": "20px", "font-weight": "613" };
  const setup = '@import url("https://example.com/fonts.css");';
  const prompt = exportPrompt(
    [rule],
    setup,
    page,
    new Map([[0, { "private-handle": { selector: "#work .kicker" } }]]),
  );
  expect(prompt).toContain("Fontzie, a browser extension");
  expect(prompt).toContain(page.url);
  expect(prompt).toContain('"selector": "#work .kicker"');
  expect(prompt).toContain(
    "similar elements outside these targets keep their original typography",
  );
  expect(prompt.match(/"font-weight": "613"/g)).toHaveLength(1);
  expect(prompt).toContain(setup);
  expect(prompt).not.toMatch(/private-handle|needs confirmation|precedence/);
});

it("preserves selector groups and rule order and labels unresolved picks as clues", () => {
  const first = withTargets(newRule(""), [
    { kind: "exact", selector: ".kicker", handle: "unavailable" },
    { kind: "selector", selector: "p" },
  ]);
  const second = newRule("#footer");
  const prompt = exportPrompt([first, second], "", page);
  expect(prompt).toContain('"selectorHint": ".kicker"');
  expect(prompt).toContain('"status": "needs confirmation"');
  expect(prompt).not.toMatch(
    /"selector": ".kicker"|unavailable|Font loading reference/,
  );
  expect(prompt).toContain("Ask me which instance");
  expect(prompt).toContain("Earlier rules take precedence");
  expect(prompt.indexOf('"selector": "p"')).toBeGreaterThan(-1);
  expect(prompt.indexOf('"selector": "p"')).toBeLessThan(
    prompt.indexOf('"selector": "#footer"'),
  );
});

it("keeps frames and shadow roots explicit and explains custom and local assets", () => {
  const custom = withTargets(newRule(""), [
    { kind: "exact", selector: ".title", handle: "picked" },
  ]);
  custom.frameId = 3;
  custom.frameUrl = "https://embed.example.com/widget";
  custom.font = { id: "custom:brand", family: "Brand", provider: "custom" };
  const local = newRule("p");
  local.font = { id: "local:private", family: "Private", provider: "local" };
  const prompt = exportPrompt(
    [custom, local],
    "@font-face {}",
    page,
    new Map([
      [0, { picked: { selector: "#wrong-document" } }],
      [
        3,
        { picked: { selector: ".title", shadowHosts: ["#widget", ".card"] } },
      ],
    ]),
  );
  expect(prompt).toContain(custom.frameUrl);
  expect(prompt).toContain('"shadowHosts"');
  expect(prompt).toContain("outermost to innermost");
  expect(prompt).toContain("separately downloaded custom font files");
  expect(prompt).toContain("licensed webfont files");
  expect(prompt).toContain("@font-face {}");
  expect(prompt).not.toMatch(/#wrong-document|custom:brand|local:private/);
});
