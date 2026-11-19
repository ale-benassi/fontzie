import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FontFamily } from "../../core/schema";

const { load, catalog, mounted } = vi.hoisted(() => ({
  load: vi.fn<() => Promise<void>>(),
  catalog: [] as FontFamily[],
  mounted: [] as (() => Promise<void>)[],
}));
vi.mock("vue", async () => ({
  ...(await vi.importActual("vue")),
  onMounted: (callback: () => Promise<void>) => mounted.push(callback),
}));
vi.mock("../../providers/catalog", () => ({ catalog, loadCatalog: load }));
const system: FontFamily = {
  id: "system:sans",
  family: "system-ui",
  category: "sans-serif",
  provider: "system",
  weights: [400],
  styles: ["normal"],
  axes: [],
};
beforeEach(() => {
  vi.resetModules();
  catalog.splice(0, catalog.length, system);
  mounted.length = 0;
  load.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it("makes initial fonts available immediately and shares catalog loading across editor consumers", async () => {
  let finish: (() => void) | undefined;
  load.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { useCatalog } = await import("../../composables/useCatalog");
  const first = useCatalog(),
    second = useCatalog();
  expect(first.fonts.value).toHaveLength(1);
  const pending = mounted.map((callback) => callback());
  expect(load).toHaveBeenCalledTimes(1);
  expect(first.loading.value).toBe(true);
  catalog.push({ ...system, id: "google:fixture", provider: "google" });
  finish?.();
  await Promise.all(pending);
  expect(first.fonts).toBe(second.fonts);
  expect(first.fonts.value).toHaveLength(2);
  expect(first.loading.value).toBe(false);
});

it("reports catalog failures without losing the editor and supports retry", async () => {
  load
    .mockRejectedValueOnce(Error("Catalog unavailable"))
    .mockResolvedValue(undefined);
  const { useCatalog } = await import("../../composables/useCatalog");
  const state = useCatalog();
  await state.reload();
  expect(state.error.value).toBe("Catalog unavailable");
  expect(state.fonts.value).toHaveLength(1);
  await state.reload();
  expect(state.error.value).toBe("");
  expect(load).toHaveBeenCalledTimes(2);
});
