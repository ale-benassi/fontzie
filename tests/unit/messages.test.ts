import { expect, it } from "vitest";
import { editorEventSchema, parseCommandResult } from "../../core/messages";
it("rejects malformed events before they reach editor state", () => {
  expect(
    editorEventSchema.safeParse({
      channel: "fontzie-event",
      tabId: 1,
      frameId: 0,
      data: { type: "selection", selection: {} },
    }).success,
  ).toBe(false);
  expect(
    editorEventSchema.safeParse({
      channel: "fontzie-event",
      tabId: 1,
      frameId: 0,
      data: { type: "matches", count: -1 },
    }).success,
  ).toBe(false);
});
it("validates the response associated with the requested command", () => {
  expect(
    parseCommandResult(
      { type: "inspect", selector: "h1" },
      { ok: true, data: { count: 2 } },
    ),
  ).toEqual({ count: 2 });
  expect(() =>
    parseCommandResult(
      { type: "inspect", selector: "h1" },
      { ok: true, data: ["h1"] },
    ),
  ).toThrow();
  expect(() =>
    parseCommandResult({ type: "clear" }, { ok: false, error: "Disconnected" }),
  ).toThrow("Disconnected");
});

it("accepts a picked element with a tag and no classes", () => {
  const request = {
    type: "target-element",
    selector: "p:nth-of-type(1)",
  } as const;
  const data = { tag: "p", classes: [] };
  expect(parseCommandResult(request, { ok: true, data })).toEqual(data);
  expect(() =>
    parseCommandResult(request, { ok: true, data: { classes: [] } }),
  ).toThrow();
});
