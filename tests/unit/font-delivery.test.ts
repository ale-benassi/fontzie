import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FontFamily } from "../../core/schema";

const { fonts } = vi.hoisted(() => ({ fonts: new Map<string, FontFamily>() }));
vi.mock("../../providers/catalog", () => ({
  loadCatalog: async () => {},
  findFont: (id: string) => fonts.get(id),
}));
const variable: FontFamily = {
  id: "fontshare:fixture",
  family: "Fixture",
  provider: "fontshare",
  category: "sans-serif",
  weights: [400, 700],
  styles: ["normal", "italic"],
  axes: [{ tag: "wght", min: 100, max: 900, default: 400 }],
  faces: [
    {
      weight: 400,
      style: "normal",
      variable: true,
      url: "https://cdn.fontshare.com/normal.woff2",
    },
    {
      weight: 400,
      style: "italic",
      variable: true,
      url: "https://cdn.fontshare.com/italic.woff2",
    },
  ],
};
const fetchFont = vi.fn();
beforeEach(() => {
  vi.resetModules();
  fonts.clear();
  fonts.set(variable.id, variable);
  fetchFont.mockReset().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new TextEncoder().encode("fixture").buffer,
  });
  vi.stubGlobal("fetch", fetchFont);
});
afterEach(() => vi.unstubAllGlobals());

it("shares variable Fontshare files across weights and concurrent requests, keeping styles separate", async () => {
  const { deliverFont } = await import("../../providers/delivery");
  const results = await Promise.all(
    [400, 410, 700].map((weight) => deliverFont(variable.id, weight)),
  );
  expect(fetchFont).toHaveBeenCalledTimes(1);
  expect(results[0]).toBe(results[1]);
  expect(results[0]?.[0]?.weight).toBe("100 900");
  await deliverFont(variable.id, 600, "italic");
  expect(fetchFont).toHaveBeenCalledTimes(2);
  await expect(deliverFont(variable.id, 950)).rejects.toThrow("weight");
  expect(fetchFont).toHaveBeenCalledTimes(2);
});

it("shares Google CSS and all subsets across variable weights", async () => {
  fonts.set("google:fixture", {
    ...variable,
    id: "google:fixture",
    provider: "google",
    faces: undefined,
  });
  fetchFont.mockImplementation(async (url: string) =>
    url.startsWith("https://fonts.googleapis.com/")
      ? {
          ok: true,
          text: async () =>
            "@font-face { src: url(https://fonts.gstatic.com/latin.woff2); font-weight: 100 900; font-style: normal; unicode-range: U+0000-00FF; }",
        }
      : {
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode("fixture").buffer,
        },
  );
  const { deliverFont } = await import("../../providers/delivery");
  await deliverFont("google:fixture", 400);
  await deliverFont("google:fixture", 650);
  expect(fetchFont).toHaveBeenCalledTimes(2);
});

it("retries failed delivery and does not share static weights", async () => {
  fonts.set(variable.id, {
    ...variable,
    axes: [],
    faces: [
      ...(variable.faces ?? []).map((face) => ({ ...face, variable: false })),
      {
        weight: 700,
        style: "normal",
        variable: false,
        url: "https://cdn.fontshare.com/bold.woff2",
      },
    ],
  });
  fetchFont.mockRejectedValueOnce(Error("Offline"));
  const { deliverFont } = await import("../../providers/delivery");
  await expect(deliverFont(variable.id, 400)).rejects.toThrow("Offline");
  await deliverFont(variable.id, 400);
  expect(fetchFont).toHaveBeenCalledTimes(2);
  const bold = await deliverFont(variable.id, 700);
  expect(fetchFont).toHaveBeenCalledTimes(3);
  expect(bold[0]?.weight).toBe("700");
});
