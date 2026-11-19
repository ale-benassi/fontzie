import { test, expect } from "./fixtures/extension";

for (const [provider, family, id] of [
  ["Google", "Inter", "google-inter"],
  ["Fontshare", "Work Sans", "fontshare-work-sans"],
]) {
  test(`live ${provider} font delivery decodes and applies ${family}`, async ({
    fontzie,
  }) => {
    const { panel, target, traffic } = fontzie;
    await fontzie.inspect("#hero");
    await panel
      .getByRole("group", { name: "Font provider" })
      .getByRole("button", { name: provider, exact: true })
      .click();
    await panel.getByLabel("Search fonts", { exact: true }).fill(family!);
    await panel
      .locator(".font-choice")
      .filter({ has: panel.getByText(family!, { exact: true }) })
      .click();
    await expect(target.locator("#hero")).toHaveCSS(
      "font-family",
      new RegExp("Fontzie-" + id),
    );
    await expect
      .poll(() =>
        target.evaluate(
          (alias) =>
            [...document.fonts].some(
              (face) => face.family === alias && face.status === "loaded",
            ),
          "Fontzie-" + id,
        ),
      )
      .toBe(true);
    if (provider === "Google") {
      await panel
        .getByRole("group", { name: "Font provider", exact: true })
        .getByRole("button", { name: "Custom", exact: true })
        .click();
      await panel
        .getByLabel("Upload custom fonts", { exact: true })
        .setInputFiles("tests/fixtures/fonts/ABeeZee-Regular.ttf");
      await expect(panel.locator(".font-choice")).toHaveCount(1);
    }
    const requests = traffic.filter((request) =>
      /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.fontshare\.com/.test(
        new URL(request.url).hostname,
      ),
    );
    expect(requests.length).toBeGreaterThan(0);
    expect(
      requests.every((request) => request.method === "GET" && !request.body),
    ).toBe(true);
    expect(
      requests.some((request) =>
        decodeURIComponent(request.url).includes("Good things take type."),
      ),
    ).toBe(false);
    expect(fontzie.pageErrors).toEqual([]);
  });
}
