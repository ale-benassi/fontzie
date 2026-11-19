import { afterEach, beforeEach, expect, it, vi } from "vitest";

let saved: Record<string, unknown>;
let get: ReturnType<typeof vi.fn>;
let changed: (
  changes: Record<string, { newValue?: unknown }>,
  area: string,
) => void;
beforeEach(() => {
  vi.resetModules();
  saved = {};
  get = vi.fn(async () => ({ ...saved }));
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get,
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(saved, values);
          changed(
            Object.fromEntries(
              Object.entries(values).map(([key, newValue]) => [
                key,
                { newValue },
              ]),
            ),
            "local",
          );
        }),
      },
      onChanged: {
        addListener: (listener: typeof changed) => {
          changed = listener;
        },
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

it("restores booleans and ignores malformed preferences", async () => {
  saved = {
    "panel:card:targets": false,
    "panel:card:settings": true,
    "panel:card:rules": "false",
  };
  const state = await import("../../storage/card-state");
  await state.initializeCardState();
  expect(state.readCardState("targets")).toBe(false);
  expect(state.readCardState("settings")).toBe(true);
  expect(state.readCardState("rules")).toBeUndefined();
});

it("preserves rapid toggles and independent card writes without replaying stale changes", async () => {
  const state = await import("../../storage/card-state");
  await state.initializeCardState();
  const first = state.saveCardState("targets", false);
  const second = state.saveCardState("targets", true);
  const other = state.saveCardState("settings", true);
  await first;
  expect(state.readCardState("targets")).toBe(true);
  await Promise.all([second, other]);
  expect(saved).toMatchObject({
    "panel:card:targets": true,
    "panel:card:settings": true,
  });
});

it("follows changes from another panel and removes preferences when data is cleared", async () => {
  const state = await import("../../storage/card-state");
  await state.initializeCardState();
  changed({ "panel:card:targets": { newValue: false } }, "local");
  expect(state.readCardState("targets")).toBe(false);
  changed({ "panel:card:targets": { newValue: true } }, "session");
  expect(state.readCardState("targets")).toBe(false);
  changed({ "panel:card:targets": {} }, "local");
  expect(state.readCardState("targets")).toBeUndefined();
});

it("does not overwrite a newer storage event with an older startup snapshot", async () => {
  const state = await import("../../storage/card-state");
  let resolve!: (value: Record<string, unknown>) => void;
  get.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const loading = state.initializeCardState();
  changed({ "panel:card:settings": { newValue: true } }, "local");
  resolve({ "panel:card:settings": false });
  await loading;
  expect(state.readCardState("settings")).toBe(true);
});
