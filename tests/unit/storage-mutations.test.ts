import { beforeEach, expect, it, vi } from "vitest";
import { emptyConfig } from "../../core/schema";
import { mutateStorage } from "../../storage/mutations";
vi.mock("../../storage/migrations", () => ({ migrateStorage: async () => {} }));
let saved: Record<string, unknown>;
beforeEach(() => {
  saved = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        async get(key: string) {
          const snapshot = structuredClone({ [key]: saved[key] });
          await new Promise((resolve) => setTimeout(resolve, 1));
          return snapshot;
        },
        async set(values: Record<string, unknown>) {
          Object.assign(saved, structuredClone(values));
        },
      },
    },
  });
});
it("preserves concurrent favorites, recents and theme changes", async () => {
  await Promise.all([
    mutateStorage({ type: "settings.favorite", id: "google:inter" }),
    mutateStorage({ type: "settings.favorite", id: "google:manrope" }),
    mutateStorage({ type: "settings.patch", patch: { theme: "dark" } }),
    mutateStorage({ type: "settings.recent", id: "google:inter" }),
    mutateStorage({ type: "settings.recent", id: "google:manrope" }),
  ]);
  expect(saved.settings).toEqual({
    theme: "dark",
    favorites: ["google:inter", "google:manrope"],
    recents: ["google:manrope", "google:inter"],
  });
});
it("retains concurrent preset saves and continues after a rejected rename", async () => {
  await Promise.all(
    ["First", "Second"].map((name) =>
      mutateStorage({ type: "preset.save", name, config: emptyConfig() }),
    ),
  );
  await expect(
    mutateStorage({ type: "preset.rename", name: "First", nextName: "Second" }),
  ).rejects.toThrow("already exists");
  await mutateStorage({
    type: "preset.rename",
    name: "First",
    nextName: "Renamed",
  });
  await mutateStorage({ type: "preset.delete", name: "Second" });
  expect(saved.presets).toEqual([{ name: "Renamed", config: emptyConfig() }]);
});

it("preserves every existing preset when a save or batch import exceeds capacity", async () => {
  const presets = Array.from({ length: 100 }, (_, i) => ({
    name: `Saved ${i}`,
    config: emptyConfig(),
  }));
  saved.presets = structuredClone(presets);
  const extra = { name: "One more", config: emptyConfig() };
  await expect(
    mutateStorage({ type: "preset.save", ...extra }),
  ).rejects.toThrow("100 presets");
  await expect(
    mutateStorage({
      type: "preset.import",
      presets: [{ ...presets[0]!, name: "SAVED 0" }, extra],
    }),
  ).rejects.toThrow("100 presets");
  expect(saved.presets).toEqual(presets);
  await mutateStorage({
    type: "preset.save",
    name: "SAVED 0",
    config: emptyConfig(),
  });
  expect(saved.presets).toHaveLength(100);
});
