import { test, expect } from "./fixtures/extension";

test("advanced typography stays open when selecting a different target", async ({
  fontzie,
}) => {
  const { panel, inspect, size, openDisclosure } = fontzie;
  await inspect("#hero");
  await size("40");
  await openDisclosure("Advanced typography");
  const advanced = panel.getByRole("button", {
    name: "Advanced typography",
    exact: true,
  });
  await inspect("#intro");
  await expect(advanced).toHaveAttribute("aria-expanded", "true");
  await size("20");
  await panel.locator(".rule-select").last().click();
  await expect(advanced).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByLabel("Size", { exact: true })).toHaveValue("40");
});

test("custom style changes choose a weight supplied by that face", async ({
  fontzie,
}) => {
  const { panel, target, inspect, openDisclosure } = fontzie;
  await inspect("#hero");
  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "Custom", exact: true })
    .click();
  await panel
    .getByLabel("Upload custom fonts", { exact: true })
    .setInputFiles([
      "tests/fixtures/fonts/ABeeZee-Regular.ttf",
      "tests/fixtures/fonts/FontzieFixtureSans-Regular.woff",
    ]);
  await expect(panel.locator(".font-choice")).toHaveCount(2);
  const families = await panel
    .locator(".font-choice .font-name")
    .allTextContents();
  for (const [index, family] of families.entries()) {
    await panel
      .getByRole("button", { name: `Edit ${family} font files`, exact: true })
      .click();
    const details = panel.getByRole("dialog", { name: family, exact: true });
    await details
      .getByLabel("Family name", { exact: true })
      .fill("Variant fixture");
    if (index === 1) {
      await details.getByLabel("Weight", { exact: true }).fill("700");
      await details
        .getByRole("combobox", { name: "Style", exact: true })
        .selectOption("italic");
    }
    await details
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
  }
  await inspect("#hero");
  await panel
    .getByRole("group", { name: "Font provider" })
    .getByRole("button", { name: "Custom", exact: true })
    .click();
  await panel
    .locator(".font-choice")
    .filter({ hasText: "Variant fixture" })
    .click();
  const typography = panel.locator('[aria-labelledby="type-heading"]');
  const weight = typography.getByLabel("Weight", { exact: true });
  await expect(weight.locator("option")).toHaveText(["400 Regular"]);
  await openDisclosure("Advanced typography");
  const style = typography.getByRole("radiogroup", {
    name: "Style",
    exact: true,
  });
  await style.getByRole("radio", { name: "Italic", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-style", "italic");
  await expect(target.locator("#hero")).toHaveCSS("font-weight", "700");
  await expect(weight.locator("option")).toHaveText(["700 Bold"]);
  await style.getByRole("radio", { name: "Normal", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-style", "normal");
  await expect(target.locator("#hero")).toHaveCSS("font-weight", "400");
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("inherited line height follows size edits before the next increment", async ({
  fontzie,
}) => {
  const { panel, target, inspect, size } = fontzie;
  await inspect("#hero");
  await size("48");
  const lineHeight = panel.getByLabel("Line height", { exact: true });
  await expect(lineHeight).toHaveValue("50.4");
  await size("32");
  await expect(target.locator("#hero")).toHaveCSS("line-height", "33.6px");
  await expect(lineHeight).toHaveValue("33.6");
  await panel
    .getByRole("button", { name: "Increase Line height", exact: true })
    .click();
  await expect(target.locator("#hero")).toHaveCSS("line-height", "34.6px");
  await expect(lineHeight).toHaveValue("34.6");
  await size("40");
  await expect(target.locator("#hero")).toHaveCSS("line-height", "34.6px");
  await expect(lineHeight).toHaveValue("34.6");
});

test("notification actions retain contrasting keyboard focus in both themes", async ({
  fontzie,
}) => {
  const { panel, inspect, size, openPresetSave, choosePreset, openSettings } =
    fontzie;
  await inspect("#hero");
  await size("33");
  await openPresetSave();
  await panel.getByLabel("Preset name", { exact: true }).fill("Focus contrast");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await openSettings();
    await fontzie.setTheme(theme);
    await size("47");
    await choosePreset("Focus contrast");
    const toast = panel.locator(".notification-toast");
    await panel.keyboard.press("F8");
    await panel.keyboard.press("Tab");
    await expect(toast).toBeFocused();
    for (const name of ["Undo", "Dismiss notification"]) {
      await panel.keyboard.press("Tab");
      const button = toast.getByRole("button", { name, exact: true });
      await expect(button).toBeFocused();
      const focus = await button.evaluate((el) => {
        const luminance = (color: string) => {
          const channels = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((n) => {
              const c = n / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
          return (
            channels[0]! * 0.2126 +
            channels[1]! * 0.7152 +
            channels[2]! * 0.0722
          );
        };
        const style = getComputedStyle(el);
        const a = luminance(style.outlineColor);
        const b = luminance(
          getComputedStyle(el.closest(".notification-toast")!).backgroundColor,
        );
        return {
          visible:
            el.matches(":focus-visible") &&
            style.outlineStyle !== "none" &&
            parseFloat(style.outlineWidth) >= 2,
          contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      });
      expect(focus.visible).toBe(true);
      expect(focus.contrast).toBeGreaterThanOrEqual(3);
      await toast.screenshot({
        path: `tests/screenshots/focus-${theme}-${name.split(" ")[0]!.toLowerCase()}.png`,
      });
    }
  }
});
