import { expect, it, vi } from "vitest";
import { removeLegacyFontComparisons } from "../../storage/migrations";
import { durableConfig } from "../../core/persistence";
import { emptyConfig, newRule } from "../../core/schema";
import { withTargets } from "../../core/targets";
it("persists every exact and selector target without mutating live handles", () => {
  const rule = withTargets(newRule(""), [
    { kind: "exact", selector: "#hero", handle: "live-handle" },
    { kind: "selector", selector: ".intro" },
  ]);
  rule.properties = { "font-size": "24px" };
  const saved = durableConfig({
    ...emptyConfig(),
    rules: [rule],
    preview: false,
  });
  expect(saved.preview).toBe(false);
  expect(saved.rules[0]!.targets).toEqual([
    { kind: "exact", selector: "#hero" },
    { kind: "selector", selector: ".intro" },
  ]);
  expect(saved.rules[0]!.properties).toEqual(rule.properties);
  expect(rule.targets![0]).toHaveProperty("handle", "live-handle");
  const exact = durableConfig({
    ...emptyConfig(),
    rules: [{ ...newRule("#hero", "exact"), handle: "old-handle" }],
  });
  expect(exact.rules[0]!.handle).toBeUndefined();
  expect(exact.rules[0]!.mode).toBe("exact");
});

it("removes retired comparison data while preserving the rest of a saved library", async () => {
  const saved: Record<string, unknown> = {
    settings: {
      theme: "dark",
      favorites: ["custom:One"],
      recents: ["custom:Two"],
      combinations: [["custom:One", "custom:Two"]],
    },
    "panel:card:font-comparison": false,
    "panel:card:font-browser": true,
    presets: [{ name: "Article" }],
  };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => structuredClone(saved),
        set: async (values: Record<string, unknown>) => {
          Object.assign(saved, values);
        },
        remove: async (key: string) => {
          delete saved[key];
        },
      },
    },
  });
  try {
    await removeLegacyFontComparisons();
    await removeLegacyFontComparisons();
    expect(saved).toEqual({
      settings: {
        theme: "dark",
        favorites: ["custom:One"],
        recents: ["custom:Two"],
      },
      "panel:card:font-browser": true,
      presets: [{ name: "Article" }],
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
