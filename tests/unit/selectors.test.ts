import { describe, expect, it } from "vitest";
import { splitSelectors, splitSelectorDraft } from "../../core/selectors";
describe("selector list editing", () => {
  it.each([
    ["", []],
    [" h1, h2, h3 ", ["h1", "h2", "h3"]],
    [
      ':is(h1, h2), a[data-label="a,b"]',
      [":is(h1, h2)", 'a[data-label="a,b"]'],
    ],
    [":not(:is(.a, .b)), p", [":not(:is(.a, .b))", "p"]],
    [String.raw`.a\,b, #c`, [String.raw`.a\,b`, "#c"]],
    ['[data-label="a\\",b"], p', ['[data-label="a\\",b"]', "p"]],
    ["h1/* , ignored */, p", ["h1/* , ignored */", "p"]],
    ["h1,,h2", ["h1", "", "h2"]],
    ["h1,", ["h1", ""]],
  ])("preserves selector boundaries in %s", (value, expected) => {
    expect(splitSelectors(value as string)).toEqual(expected);
  });
});

describe("selector draft separators", () => {
  it.each([
    [",", [], true, true],
    [", , , ", [], true, true],
    ["p,, a,", ["p", "a"], true, true],
    [",p", ["p"], true, false],
    ["p, ,a", ["p", "a"], true, false],
    [":is(h1, h2)", [":is(h1, h2)"], false, false],
    ['[data-label="a,b"],', ['[data-label="a,b"]'], true, true],
    [String.raw`.a\,b`, [String.raw`.a\,b`], false, false],
  ])(
    "ignores empty draft targets in %s",
    (value, parts, separated, trailing) => {
      expect(splitSelectorDraft(value as string)).toEqual({
        parts,
        separated,
        trailing,
      });
    },
  );
});
