import { test, expect } from "./fixtures/extension";
import path from "node:path";
import fs from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { alias } from "../../core/fonts";

test("loads Google and OFL Fontshare faces with weight and italic", async ({
  fontzie,
}) => {
  const { inspect, panel, target, sliderValue, openSettings } = fontzie;

  await inspect("#hero");
  await panel
    .getByRole("group", { name: "Font provider" })
    .getByRole("button", { name: "Google", exact: true })
    .click();
  await panel.getByLabel("Search fonts", { exact: true }).fill("Manrope");
  await panel.locator(".font-choice").filter({ hasText: "Manrope" }).click();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false", {
    timeout: 30000,
  });
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(target.locator("#hero")).toHaveCSS(
    "font-family",
    /Fontzie-google-manrope/,
  );
  expect(
    await target.evaluate(() =>
      [...document.fonts].some(
        (f) => f.family === "Fontzie-google-manrope" && f.status === "loaded",
      ),
    ),
  ).toBe(true);
  await sliderValue("Font weight", 650);
  await expect(target.locator("#hero")).toHaveCSS("font-weight", "650");
  await panel
    .getByRole("group", { name: "Font provider" })
    .getByRole("button", { name: "Fontshare", exact: true })
    .click();
  await panel.getByLabel("Search fonts", { exact: true }).fill("Archivo");
  await panel.locator(".font-choice").filter({ hasText: "Archivo" }).click();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false", {
    timeout: 30000,
  });
  await expect(target.locator("#hero")).toHaveCSS(
    "font-family",
    /Fontzie-fontshare-archivo/,
  );
  await panel.getByLabel("Search fonts", { exact: true }).fill("Satoshi");
  await expect(panel.locator(".font-choice")).toHaveCount(0);
  await panel.getByLabel("Search fonts", { exact: true }).fill("Work Sans");
  await panel.locator(".font-choice").filter({ hasText: "Work Sans" }).click();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false", {
    timeout: 30000,
  });
  await expect(target.locator("#hero")).toHaveCSS(
    "font-family",
    /Fontzie-fontshare-work-sans/,
  );
  const weightPreset = panel.getByLabel("Weight", { exact: true });
  await weightPreset.selectOption("600");
  await expect(target.locator("#hero")).toHaveCSS("font-weight", "600");
  await expect(
    panel.getByRole("slider", { name: "Font weight", exact: true }),
  ).toHaveAttribute("aria-valuenow", "600");
  await sliderValue("Font weight", 537);
  await expect(weightPreset).toHaveValue("537");
  await expect(weightPreset.locator("option:checked")).toHaveText(
    "537 · Custom",
  );
  await expect(target.locator("#hero")).toHaveCSS("font-weight", "537");
  await weightPreset.selectOption("500");
  await expect(target.locator("#hero")).toHaveCSS("font-weight", "500");
  await expect(weightPreset.locator('option[value="537"]')).toHaveCount(0);
  await sliderValue("Font weight", 700);
  await expect(weightPreset).toHaveValue("700");
  await expect(target.locator("#hero")).toHaveCSS("font-weight", "700");
  await panel
    .getByText("Advanced typography", { exact: true })
    .evaluate((el) => {
      const trigger = el
        .closest('[data-slot="collapsible"]')!
        .querySelector<HTMLButtonElement>('[data-slot="collapsible-trigger"]')!;
      if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
    });
  await panel.getByRole("radio", { name: "Italic", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-style", "italic");
  const styleControls = panel.getByRole("group", {
    name: "Style",
    exact: true,
  });
  const resetStyle = styleControls.getByRole("button", {
    name: "Reset Style",
    exact: true,
  });
  await expect(
    styleControls.getByRole("radio", { name: "Italic", exact: true }),
  ).toBeChecked();
  await expect(panel.getByLabel("Width", { exact: true })).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await openSettings();
    await fontzie.setTheme(theme);
    for (const width of [320, 390, 420]) {
      await panel.setViewportSize({ width, height: 900 });
      const layout = await styleControls.evaluate((el) => {
        const options = [...el.querySelectorAll('[role="radio"]')].map(
          (option) => option.getBoundingClientRect(),
        );
        const field = el.getBoundingClientRect();
        return {
          heights: options.map((option) => option.height),
          aligned: Math.abs(options[0]!.top - options[1]!.top),
          fits: options.every(
            (option) =>
              option.left >= field.left && option.right <= field.right + 1,
          ),
          inAdvanced: !!el.closest(".advanced-grid"),
        };
      });
      expect(layout.heights.every((height) => height >= 32)).toBe(true);
      expect(layout.aligned).toBeLessThan(1);
      expect(layout.fits).toBe(true);
      expect(layout.inAdvanced).toBe(true);
      const weightLayout = await weightPreset.evaluate((select) => {
        const box = select.getBoundingClientRect();
        const row = select.closest(".weight-control")!;
        const slider = row
          .querySelector('[data-slot="slider"]')!
          .getBoundingClientRect();
        const label = row
          .querySelector(".field-label")!
          .getBoundingClientRect();
        const canvas = document.createElement("canvas").getContext("2d")!;
        canvas.font = getComputedStyle(select).font;
        return {
          fits:
            select.clientWidth -
              parseFloat(getComputedStyle(select).paddingLeft) -
              parseFloat(getComputedStyle(select).paddingRight) >=
            canvas.measureText(
              (select as HTMLSelectElement).selectedOptions[0]!.text,
            ).width,
          labelInline:
            Math.abs((box.top + box.bottom - label.top - label.bottom) / 2) < 1,
          fullWidthSlider:
            slider.top >= box.bottom &&
            Math.abs(slider.width - row.getBoundingClientRect().width) < 1,
        };
      });
      expect(weightLayout.fits).toBe(true);
      expect(weightLayout.labelInline).toBe(true);
      expect(weightLayout.fullWidthSlider).toBe(true);
      if (width === 390)
        await panel
          .locator('section[aria-labelledby="type-heading"]')
          .screenshot({
            path: `tests/screenshots/style-controls-${theme}.png`,
          });
    }
  }
  const decoded = await target.evaluate(() =>
    [...document.fonts]
      .filter((face) => face.family === "Fontzie-fontshare-work-sans")
      .map((face) => ({
        family: face.family,
        status: face.status,
        style: face.style,
        weight: face.weight,
      })),
  );
  expect(decoded).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ status: "loaded", style: "normal" }),
      expect.objectContaining({ status: "loaded", style: "italic" }),
    ]),
  );
  await fs.writeFile(
    "tests/results/work-sans.json",
    JSON.stringify(
      { decoded, provider: "cdn.fontshare.com", weight: 700 },
      null,
      2,
    ),
  );
  await resetStyle.click();
  await expect(target.locator("#hero")).toHaveCSS("font-style", "normal");
  await expect(resetStyle).toHaveCount(0);
  await panel.getByText("Advanced typography", { exact: true }).click();
});

test("width appears only for supported fonts and resets the actual width axis", async ({
  fontzie,
}) => {
  const { inspect, panel, target } = fontzie;

  await inspect("#hero");
  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "Google", exact: true })
    .click();
  await panel.getByLabel("Search fonts", { exact: true }).fill("Archivo");
  await panel
    .locator(".font-choice")
    .filter({ has: panel.getByText("Archivo", { exact: true }) })
    .click();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  const width = panel.getByLabel("Width", { exact: true });
  await expect(width).toBeVisible();
  await expect(width).toHaveAttribute("min", "62");
  await expect(width).toHaveAttribute("max", "125");
  const measure = () =>
    target.locator("#hero").evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width;
    });
  await target
    .locator("#hero")
    .evaluate((el) => (el.style.whiteSpace = "nowrap"));
  await width.fill("125");
  await width.press("Tab");
  await expect(target.locator("#hero")).toHaveCSS(
    "font-variation-settings",
    /"wdth" 125/,
  );
  const normal = await measure();
  await width.fill("75");
  await width.press("Tab");
  await expect(target.locator("#hero")).toHaveCSS(
    "font-variation-settings",
    /"wdth" 75/,
  );
  expect(await measure()).toBeLessThan(normal * 0.95);
  await panel.getByLabel("Weight", { exact: true }).selectOption("600");
  await expect(target.locator("#hero")).toHaveCSS("font-weight", "600");
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await expect(target.locator("#hero")).toHaveCSS(
    "font-variation-settings",
    /"wdth" 75/,
  );
  await panel.getByRole("button", { name: "Reset Width", exact: true }).click();
  await expect(target.locator("#hero")).not.toHaveCSS(
    "font-variation-settings",
    /"wdth"/,
  );
  await expect(target.locator("#hero")).toHaveCSS(
    "font-variation-settings",
    /"wght" 600/,
  );
  await panel.getByLabel("Search fonts", { exact: true }).fill("Manrope");
  await panel.locator(".font-choice").filter({ hasText: "Manrope" }).click();
  await expect(width).toHaveCount(0);
  await target
    .locator("#hero")
    .evaluate((el) => el.style.removeProperty("white-space"));
});

test("custom upload clears stale filters, applies from the font list and survives reload", async ({
  fontzie,
}) => {
  const { panel, target } = fontzie;
  await fontzie.inspect("#hero");
  await panel.getByLabel("Search fonts", { exact: true }).fill("men");
  await panel
    .getByLabel("Font category", { exact: true })
    .selectOption("serif");

  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "Custom", exact: true })
    .click();
  await panel
    .getByLabel("Upload custom fonts", { exact: true })
    .setInputFiles(
      path.resolve(
        "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2",
      ),
    );
  await expect(panel.locator(".font-choice")).toHaveCount(1, {
    timeout: 30000,
  });
  await expect(panel.getByLabel("Search fonts", { exact: true })).toHaveValue(
    "",
  );
  await expect(panel.getByLabel("Font category", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    panel.getByRole("button", {
      name: "Edit Fraunces font files",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Variable", exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "All", exact: true })
    .click();
  await panel.getByLabel("Search fonts", { exact: true }).fill("Fraunces");
  const editCustom = panel.getByRole("button", {
    name: "Edit Fraunces font files",
    exact: true,
  });
  await editCustom.click();
  const details = panel.getByRole("dialog", { name: "Fraunces", exact: true });
  await expect(details).toBeVisible();
  await expect(details.getByLabel("Family name", { exact: true })).toHaveValue(
    "Fraunces",
  );
  await details
    .getByRole("button", { name: "Close font details", exact: true })
    .click();
  await expect(details).toHaveCount(0);
  await expect(editCustom).toBeFocused();
  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "Custom", exact: true })
    .click();
  await panel.getByLabel("Search fonts", { exact: true }).fill("no such font");
  await expect(
    panel.getByRole("region", { name: "Font families", exact: true }),
  ).toBeHidden();
  await panel
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(
    panel
      .getByRole("group", { name: "Font provider" })
      .getByRole("button", { name: "Custom", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await panel.getByLabel("Search fonts", { exact: true }).fill("Fraunces");
  await panel
    .getByRole("group", { name: "Font provider" })
    .getByRole("button", { name: "Custom", exact: true })
    .click();
  await panel.locator(".font-choice").filter({ hasText: "Fraunces" }).click();
  await expect(target.locator("#hero")).toHaveCSS(
    "font-family",
    new RegExp(alias("custom:Fraunces")),
    { timeout: 30000 },
  );
  await expect(
    panel.locator('.font-choice[aria-pressed="true"]'),
  ).toContainText("Selected");
  await expect
    .poll(() =>
      target.evaluate(
        (family) =>
          [...document.fonts].some(
            (font) => font.family === family && font.status === "loaded",
          ),
        alias("custom:Fraunces"),
      ),
    )
    .toBe(true);
  await panel.reload();
  await expect(
    panel.getByRole("button", { name: "Pick element", exact: true }),
  ).toBeEnabled();
  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "Custom", exact: true })
    .click();
  await expect(panel.locator(".font-choice")).toHaveCount(1);
});

test("deleting an applied custom font keeps the active rule and target", async ({
  fontzie,
}) => {
  const { inspect, panel, target } = fontzie;

  await inspect("#hero");
  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "Custom", exact: true })
    .click();
  await panel
    .getByLabel("Upload custom fonts", { exact: true })
    .setInputFiles(
      path.resolve(
        "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2",
      ),
    );
  await panel
    .getByRole("button", { name: "Edit Fraunces font files", exact: true })
    .click();
  await panel
    .getByLabel("Family name", { exact: true })
    .fill("Discard this draft");
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await panel
    .getByRole("button", { name: "Edit Fraunces font files", exact: true })
    .click();
  await expect(panel.getByLabel("Family name", { exact: true })).toHaveValue(
    "Fraunces",
  );
  await panel
    .getByLabel("Family name", { exact: true })
    .fill("Private specimen");
  await panel
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await panel
    .getByRole("group", { name: "Font provider" })
    .getByRole("button", { name: "Custom", exact: true })
    .click();
  await panel
    .getByLabel("Search fonts", { exact: true })
    .fill("Private specimen");
  await panel
    .locator(".font-choice")
    .filter({ hasText: "Private specimen" })
    .click();
  await expect(target.locator("#hero")).toHaveCSS(
    "font-family",
    new RegExp(alias("custom:Private specimen")),
  );
  await panel
    .getByRole("button", {
      name: "Edit Private specimen font files",
      exact: true,
    })
    .click();
  await panel.getByRole("button", { name: "Delete file", exact: true }).click();
  await panel
    .getByRole("dialog", { name: "Delete this font file?", exact: true })
    .getByRole("button", { name: "Delete file", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Custom", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    panel.getByRole("button", { name: "Add fonts", exact: true }),
  ).toBeVisible();
  await expect(panel.getByLabel("Search fonts", { exact: true })).toBeHidden();
  await expect(
    panel.getByRole("button", { name: "New", exact: true }),
  ).toBeEnabled();
  await expect(panel.locator(".font-choice")).toHaveCount(0);
  await expect(target.locator("#hero")).not.toHaveCSS(
    "font-family",
    new RegExp(alias("custom:Private specimen")),
  );
  expect(
    await target.evaluate(
      (family) => [...document.fonts].some((f) => f.family === family),
      alias("custom:Private specimen"),
    ),
  ).toBe(false);
});

test("large catalog search and complex DOM edits stay responsive", async ({
  fontzie,
}) => {
  const { resetCurrentPage, target, inspect, size, panel } = fontzie;

  // Measure this edit without reapplying font rules left by earlier tests.
  await resetCurrentPage();
  await target.evaluate(() => {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 5000; i++) {
      const h = document.createElement("h3");
      h.className = "perf-title";
      h.textContent = "Performance heading " + i;
      fragment.append(h);
    }
    document.querySelector("#cards")!.append(fragment);
  });
  const start = Date.now();
  await inspect(".perf-title");
  await size("21");
  const editMs = Date.now() - start;
  await expect(target.locator(".perf-title").first()).toHaveCSS(
    "font-size",
    "21px",
  );
  const searchStart = Date.now();
  await panel.getByLabel("Search fonts", { exact: true }).fill("Roboto");
  await expect(panel.locator(".font-row").first()).toBeVisible();
  const searchMs = Date.now() - searchStart;
  expect(editMs).toBeLessThan(3000);
  expect(searchMs).toBeLessThan(1000);
  await fs.mkdir("tests/results", { recursive: true });
  await fs.writeFile(
    "tests/results/performance.json",
    JSON.stringify({ elements: 5000, editMs, searchMs }, null, 2),
  );
  await target.evaluate(() =>
    document.querySelectorAll(".perf-title").forEach((el) => el.remove()),
  );
});

test("custom TTF, WOFF and OTF upload as a private batch", async ({
  fontzie,
}) => {
  const { inspect, panel, target } = fontzie;

  await inspect("#hero");
  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "Custom", exact: true })
    .click();
  await panel
    .getByLabel("Upload custom fonts", { exact: true })
    .setInputFiles(
      [
        "ABeeZee-Regular.ttf",
        "FontzieFixtureSans-Regular.woff",
        "SourceSerif4-Regular.otf",
      ].map((name) => path.resolve("tests/fixtures/fonts", name)),
    );
  await expect(panel.locator(".font-choice")).toHaveCount(3);
  const families = await panel
    .locator(".font-choice .font-name")
    .allTextContents();
  for (const family of families) {
    await panel.getByLabel("Search fonts", { exact: true }).fill(family);
    await panel
      .locator(".font-choice")
      .filter({ has: panel.getByText(family, { exact: true }) })
      .click();
    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await expect(target.locator("#hero")).toHaveCSS(
      "font-family",
      /Fontzie-custom/,
    );
  }
  await panel.getByLabel("Search fonts", { exact: true }).fill("");
  for (let count = 3; count > 0; count--) {
    await panel.locator("[data-manage-family]").first().click();
    await panel
      .getByRole("button", { name: "Delete file", exact: true })
      .click();
    await panel
      .getByRole("dialog", { name: "Delete this font file?", exact: true })
      .getByRole("button", { name: "Delete file", exact: true })
      .click();
    await expect(panel.locator(".font-choice")).toHaveCount(count - 1);
  }
  await expect(panel.locator(".font-choice")).toHaveCount(0);
});

test("discovery combines providers and collections with clear recovery and synchronized cycling", async ({
  fontzie,
}) => {
  const { inspect, panel, openSettings } = fontzie;

  await inspect("#hero");
  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "Google", exact: true })
    .click();
  await panel.getByLabel("Search fonts", { exact: true }).fill("Manrope");
  const favoriteManrope = panel.getByRole("button", {
    name: "Favorite Manrope",
    exact: true,
  });
  if ((await favoriteManrope.getAttribute("aria-pressed")) !== "true")
    await favoriteManrope.click();
  await panel
    .getByRole("button", { name: "Show favorites", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Favorites", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByLabel("Font category", { exact: true }),
  ).toBeVisible();
  await expect(panel.locator(".font-choice")).toHaveCount(1);
  await expect(
    panel.getByRole("button", { name: "Next", exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "Fontshare", exact: true })
    .click();
  await expect(panel.locator(".font-choice")).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(panel.getByLabel("Search fonts", { exact: true })).toHaveValue(
    "",
  );
  const fontList = panel.getByRole("region", {
    name: "Font families",
    exact: true,
  });
  await expect(
    panel.getByRole("button", { name: "Previous", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Next", exact: true }),
  ).toHaveCount(0);
  await expect(panel.locator(".browser-count")).toHaveText("2,023 families");
  expect(await panel.locator(".font-choice").count()).toBeLessThan(20);
  // A single scrollbar reaches past the former pages without mounting the catalog.
  await fontList.evaluate((list) => {
    list.scrollTop = 64 * 50;
    list.dispatchEvent(new Event("scroll"));
  });
  await expect
    .poll(async () =>
      Number(
        await panel
          .locator(".font-row")
          .first()
          .getAttribute("data-font-index"),
      ),
    )
    .toBeGreaterThan(40);
  expect(await panel.locator(".font-choice").count()).toBeLessThan(20);
  await fontList.focus();
  await fontList.press("End");
  await expect(panel.locator(".font-choice:focus")).toHaveCount(1);
  await expect(
    panel.locator(".font-choice:focus").locator(".."),
  ).toHaveAttribute("data-font-index", "2022");
  await panel.locator(".font-choice:focus").press("Enter");
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await panel.getByRole("button", { name: "Next font", exact: true }).click();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await expect(
    panel.locator('.font-choice[aria-pressed="true"]').locator(".."),
  ).toHaveAttribute("data-font-index", "0");
  const inView = await fontList.evaluate((list) => {
    const row = list.querySelector('[aria-pressed="true"].font-choice')!;
    const r = row.getBoundingClientRect(),
      l = list.getBoundingClientRect();
    return r.top >= l.top - 1 && r.bottom <= l.bottom + 1;
  });
  expect(inView).toBe(true);
  await fontList.evaluate((list) => {
    list.scrollTop = 64 * 80;
    list.dispatchEvent(new Event("scroll"));
  });
  await panel.getByLabel("Search fonts", { exact: true }).fill("Roundo");
  await expect(panel.locator(".font-choice")).toHaveCount(1);
  await expect(panel.locator(".font-choice")).toContainText("Roundo");
  await expect.poll(() => fontList.evaluate((list) => list.scrollTop)).toBe(0);
  await panel
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await openSettings();
  await fontzie.setTheme("light");
  await panel.setViewportSize({ width: 390, height: 900 });
  await panel.evaluate(() => window.scrollTo(0, 0));
  await panel.screenshot({
    path: "tests/screenshots/simplified-editor-light.png",
    fullPage: true,
  });
  await fontzie.setTheme("dark");
  await panel.setViewportSize({ width: 320, height: 900 });
  await panel.evaluate(() => window.scrollTo(0, 0));
  await panel.screenshot({
    path: "tests/screenshots/simplified-editor-dark.png",
    fullPage: true,
  });
});

test("heart favorites shortcut stays synchronized with recently used in both themes", async ({
  fontzie,
}) => {
  const { panel, inspect, target, openSettings } = fontzie;
  await inspect("#hero");

  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "Google", exact: true })
    .click();
  await panel.getByLabel("Search fonts", { exact: true }).fill("Manrope");
  const favorite = panel.getByRole("button", {
    name: "Favorite Manrope",
    exact: true,
  });
  if ((await favorite.getAttribute("aria-pressed")) !== "true")
    await favorite.click();
  await expect(favorite.locator("svg")).toHaveClass(/is-favorite/);
  const shortcut = panel.getByRole("button", {
    name: "Show favorites",
    exact: true,
  });
  await expect(shortcut).toBeVisible();
  await shortcut.click();
  await expect(shortcut).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator(".font-choice")).toHaveCount(1);
  await shortcut.click();
  const recent = panel.getByRole("button", {
    name: "Recent",
    exact: true,
  });
  await shortcut.click();
  await expect(recent).toHaveAttribute("aria-pressed", "false");
  await expect(shortcut).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator(".font-choice")).toHaveCount(1);
  await recent.click();
  await expect(shortcut).toHaveAttribute("aria-pressed", "false");
  await shortcut.click();
  await expect(recent).toHaveAttribute("aria-pressed", "false");
  await shortcut.click();
  await expect(recent).toHaveAttribute("aria-pressed", "false");
  await expect(shortcut).toHaveAttribute("aria-pressed", "false");
  await inspect("#hero");
  await expect(panel.getByText("Computed styles", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    panel.getByText("Available weights", { exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole("group", { name: "Font provider", exact: true })
    .getByRole("button", { name: "All", exact: true })
    .click();
  await panel.getByLabel("Search fonts", { exact: true }).fill("system-ui");
  await panel.locator(".font-choice").filter({ hasText: "system-ui" }).click();
  const weight = panel.getByLabel("Weight", { exact: true });
  await weight.selectOption("700");
  await expect(target.locator("#hero")).toHaveCSS("font-weight", "700");
  await expect(panel.locator(".weight-control .mono")).toHaveCount(0);
  await openSettings();
  for (const theme of ["light", "dark"]) {
    await fontzie.setTheme(theme);
    for (const width of [320, 390, 420]) {
      await panel.setViewportSize({ width, height: 900 });
      expect(
        await panel.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const geometry = await shortcut.evaluate((button) => {
        const search = button
          .closest(".search-tools")!
          .querySelector(".search-box")!;
        const s = search.getBoundingClientRect(),
          b = button.getBoundingClientRect();
        return {
          gap: b.left - s.right,
          center: Math.abs((s.top + s.bottom) / 2 - (b.top + b.bottom) / 2),
        };
      });
      expect(geometry.gap).toBeGreaterThanOrEqual(6);
      expect(geometry.center).toBeLessThan(1);
      const filterAlignment = await panel
        .locator("#font-filters")
        .evaluate((el) => {
          const category = el
            .querySelector('[aria-label="Font category"]')!
            .getBoundingClientRect();
          const buttons = el.querySelectorAll(".font-filter-options button");
          const variable = buttons[0]!.getBoundingClientRect();
          return {
            left: variable.left - category.right,
            center: Math.abs(
              (variable.top +
                variable.bottom -
                category.top -
                category.bottom) /
                2,
            ),
          };
        });
      // Compact panels use the approved 4px gap; wider panels retain 6px.
      expect(filterAlignment.left).toBeGreaterThanOrEqual(width <= 340 ? 4 : 6);
      expect(filterAlignment.center).toBeLessThan(1);
      const weightFit = await weight.evaluate((el) => {
        const row = el.closest(".weight-control")!;
        const box = el.getBoundingClientRect();
        const next = row
          .nextElementSibling!.querySelector(".number-controls")!
          .getBoundingClientRect();
        return Math.max(
          Math.abs(box.left - next.left),
          Math.abs(box.right - next.right),
        );
      });
      expect(weightFit).toBeLessThan(1);
      await panel.locator("#font-filters").screenshot({
        path: `tests/screenshots/heart-filters-${theme}-${width}.png`,
      });
      if (width === 390)
        await panel.locator('[aria-labelledby="type-heading"]').screenshot({
          path: `tests/screenshots/simple-weight-${theme}.png`,
        });
    }
    const axe = await new AxeBuilder({ page: panel })
      .include("#font-filters")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
  }
});
