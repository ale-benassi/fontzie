import { test, expect } from "./fixtures/extension";
import { settingsSchema } from "../../core/schema";
test("two editors preserve concurrent changes and synchronize their saved library", async ({
  fontzie,
}) => {
  const { context, panel, worker, extensionId, tabId } = fontzie;
  await fontzie.inspect("#hero");
  const other = await context.newPage();
  await other.goto(
    `chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`,
  );
  await expect(
    other.getByRole("button", { name: "Pick element", exact: true }),
  ).toBeEnabled();
  // Each editor owns its current target. Select the saved rule in the new
  // editor before interacting with its otherwise inactive font browser.
  await other.locator(".rule-select").filter({ hasText: "#hero" }).click();
  for (const page of [panel, other]) {
    const fonts = page.getByRole("button", {
      name: "Font family",
      exact: true,
    });
    if ((await fonts.getAttribute("aria-expanded")) !== "true")
      await fonts.click();
  }
  await Promise.all([
    panel.getByRole("button", { name: "Favorite Inter", exact: true }).click(),
    other
      .getByRole("button", { name: "Favorite Manrope", exact: true })
      .click(),
  ]);
  for (const page of [panel, other]) {
    await expect(
      page.getByRole("button", { name: "Favorite Inter", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Favorite Manrope", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await Promise.all(
    [panel, other].map((page, index) =>
      page.evaluate(async (name) => {
        const result = await chrome.runtime.sendMessage({
          channel: "fontzie-storage",
          command: {
            type: "preset.save",
            name,
            config: { version: 1, rules: [], preview: true },
          },
        });
        if (!result?.ok) throw Error(result.error);
      }, `Concurrent ${index}`),
    ),
  );
  for (const page of [panel, other]) {
    await page.getByRole("button", { name: "Presets", exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: "Apply Concurrent 0", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Apply Concurrent 1", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
  const saved = await worker.evaluate(async () =>
    chrome.storage.local.get(["settings", "presets"]),
  );
  expect(settingsSchema.parse(saved.settings).favorites).toEqual(
    expect.arrayContaining(["google:inter", "google:manrope"]),
  );
  expect(saved.presets).toHaveLength(2);
});
