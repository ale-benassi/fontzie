import { test, expect } from "./fixtures/extension";
import fs from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";

test("picking blocks edits while retaining values and card preferences", async ({
  fontzie,
}) => {
  const { panel, inspect, size, tabId } = fontzie;
  await inspect("#hero");
  await size("32");
  const state = () =>
    panel.evaluate(
      async (id) => ({
        page: await chrome.storage.session.get(`tab:${id}`),
        cards: await chrome.storage.local.get([
          "panel:card:rules",
          "panel:card:targets",
          "panel:card:font-browser",
          "panel:card:typography",
        ]),
      }),
      tabId,
    );
  const before = await state();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Cancel picking", exact: true }),
  ).toBeEnabled();
  for (const name of ["New", "Presets", "Undo", "Clear edits", "Export"]) {
    await expect(
      panel.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  }
  await expect(panel.getByRole("button", { name: /^Theme:/ })).toBeEnabled();
  await expect(
    panel.getByRole("button", {
      name: "Float editor over webpage",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(panel.locator("#selector")).toBeDisabled();
  await expect(
    panel.locator("#type-heading .disclosure-trigger"),
  ).toBeDisabled();
  await expect(
    panel.locator("#font-heading .disclosure-trigger"),
  ).toBeDisabled();
  await expect(
    panel.locator("#rules-heading .disclosure-trigger"),
  ).toBeDisabled();
  await expect(panel.locator(".rule-row")).toContainText("#hero");
  await expect(
    panel
      .locator('[data-card="typography"]')
      .getByLabel("Size", { exact: true }),
  ).toHaveValue("32");
  await expect(panel.locator(".target-composer")).toHaveJSProperty(
    "inert",
    true,
  );
  await panel.keyboard.press("ControlOrMeta+z");
  expect(await state()).toEqual(before);
  await panel
    .getByRole("button", { name: "Cancel picking", exact: true })
    .click();
  await expect(panel.locator("#selector")).toBeEnabled();
  await expect(
    panel.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await expect(panel.locator(".target-composer")).toHaveJSProperty(
    "inert",
    false,
  );
  expect(await state()).toEqual(before);
});

test("first selection reveals its rule, compacts Targets and keeps secondary controls collapsed", async ({
  fontzie,
}) => {
  const { panel } = fontzie;
  const toggle = (id: string) =>
    panel.locator(
      `[data-card="${id}"] > .disclosure-header .disclosure-trigger`,
    );
  await expect(toggle("rules")).toBeDisabled();
  await expect(
    panel.getByRole("img", {
      name: "Rule preview. Choose a target to create your first rule.",
    }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "New", exact: true }),
  ).toBeDisabled();
  await expect(panel.locator(".target-pick")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Presets", exact: true }),
  ).toBeEnabled();
  for (const id of ["font-browser", "typography"]) {
    await expect(toggle(id)).toBeDisabled();
    const body = panel.locator(
      `[data-card="${id}"] > .disclosure-content > .disclosure-body`,
    );
    await expect(body).toHaveCSS("filter", "blur(1.2px)");
    await expect(panel.locator(".ui-card").filter({ has: body })).toHaveCSS(
      "filter",
      "none",
    );
    await expect(body.locator("..")).toHaveJSProperty("inert", true);
  }
  for (const name of ["Save preset", "Show original", "Export"]) {
    await expect(
      panel.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  }
  // Other pages on this site can have edits even when this page has none.
  await panel.getByRole("button", { name: "Clear edits", exact: true }).click();
  await expect(
    panel.getByRole("menuitem", { name: "Clear page edits", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("menuitem", { name: "Clear site edits…", exact: true }),
  ).toBeEnabled();
  await panel.keyboard.press("Escape");
  await panel.locator("#selector").fill("#hero");
  await panel.locator(".selector-add").press("Enter");
  await expect(panel.locator(".rule-row")).toHaveCount(1);
  await expect(toggle("rules")).toHaveAttribute("aria-expanded", "true");
  await expect(toggle("font-browser")).toHaveAttribute("aria-expanded", "true");
  for (const id of ["typography"]) {
    await expect(toggle(id)).toBeEnabled();
    await expect(toggle(id)).toHaveAttribute("aria-expanded", "false");
  }
  await expect(panel.locator(".target-pick")).toHaveCount(0);
  await expect(
    panel
      .locator('[data-card="targets"] > .disclosure-header')
      .getByRole("button", { name: "Pick element", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Export", exact: true }),
  ).toBeDisabled();
  await toggle("typography").click();
  await expect(panel.getByLabel("Weight", { exact: true })).toBeVisible();
});

test("Settings is available before targeting, traps focus and preserves data confirmation", async ({
  fontzie,
}) => {
  const { panel, resetCurrentPage, openSettings, closeSettings } = fontzie;
  await resetCurrentPage();
  await panel.setViewportSize({ width: 320, height: 480 });
  const gear = panel.getByRole("button", { name: "Settings", exact: true });
  await expect(gear).toBeEnabled();
  await expect(panel.locator('main [data-card="settings"]')).toHaveCount(0);
  await openSettings();
  const dialog = panel.getByRole("dialog", { name: "Settings", exact: true });
  await expect(
    dialog.getByRole("heading", { name: "Appearance" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Website access" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close Settings" }),
  ).toBeFocused();
  const backup = dialog.getByRole("button", {
    name: "Backup & data",
    exact: true,
  });
  await expect(backup).toHaveAttribute("aria-expanded", "false");
  for (let tab = 0; tab < 12; tab++) {
    await panel.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await backup.click();
  await dialog
    .getByRole("button", { name: "Clear all Fontzie data", exact: true })
    .click();
  const confirmation = panel.getByRole("dialog", {
    name: "Clear all Fontzie data?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(confirmation).toBeHidden();
  await expect(
    dialog.getByRole("button", { name: "Clear all Fontzie data", exact: true }),
  ).toBeFocused();
  const geometry = await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const close = el
      .querySelector('[aria-label="Close Settings"]')!
      .getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      close: close.top >= r.top && close.bottom <= r.bottom,
      width: innerWidth,
      height: innerHeight,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
  expect(geometry.close).toBe(true);
  await closeSettings();
  await expect(gear).toBeFocused();
  await gear.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(backup).toHaveAttribute("aria-expanded", "false");
  await panel.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(gear).toBeFocused();
  await fontzie.inspect("#hero");
  await openSettings();
  await panel.keyboard.press("Control+z");
  await closeSettings();
  await expect(panel.locator(".rule-row")).toHaveCount(1);
});

test("theme persists and System follows operating system changes", async ({
  fontzie,
}) => {
  const { panel } = fontzie;

  await fontzie.openSettings();
  await fontzie.setTheme("dark");
  await expect(panel.locator("html")).toHaveAttribute("data-theme", "dark");
  await panel.reload();
  await expect(panel.locator("html")).toHaveAttribute("data-theme", "dark");
  await fontzie.openSettings();
  await fontzie.setTheme("system");
  await panel.emulateMedia({ colorScheme: "light" });
  await expect(panel.locator("html")).toHaveAttribute("data-theme", "light");
  await panel.emulateMedia({ colorScheme: "dark" });
  await expect(panel.locator("html")).toHaveAttribute("data-theme", "dark");
  await fontzie.setTheme("light");
  await panel.emulateMedia({ colorScheme: "dark" });
  await expect(panel.locator("html")).toHaveAttribute("data-theme", "light");
});

test("header cycles Light, Dark and System, follows OS changes and persists", async ({
  fontzie,
}) => {
  const { panel, openSettings } = fontzie;

  await panel.emulateMedia({ colorScheme: "light" });
  await openSettings();
  await fontzie.setTheme("light");
  await fontzie.closeSettings();
  const toggle = panel.getByRole("button", { name: /^Theme:/ });
  for (const [current, next, resolved] of [
    ["Light", "Dark", "dark"],
    ["Dark", "System", "light"],
    ["System", "Light", "light"],
  ] as const) {
    await expect(toggle).toHaveAccessibleName(
      `Theme: ${current}. Switch to ${next}.`,
    );
    await panel.locator("header").screenshot({
      path: `tests/screenshots/header-theme-${current.toLowerCase()}.png`,
    });
    await toggle.click();
    await expect(panel.locator("html")).toHaveAttribute("data-theme", resolved);
    await expect(
      panel.getByRole("button", { name: "Settings", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
  }
  await expect(toggle).toHaveAccessibleName("Theme: Light. Switch to Dark.");
  await expect(toggle).toBeEnabled();
  await panel.reload();
  await expect(toggle).toHaveAccessibleName("Theme: Light. Switch to Dark.");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Theme: Dark. Switch to System.");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Theme: System. Switch to Light.");
  await panel.emulateMedia({ colorScheme: "dark" });
  await expect(panel.locator("html")).toHaveAttribute("data-theme", "dark");
  await panel.emulateMedia({ colorScheme: "light" });
  await expect(panel.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle).toBeEnabled();
  await panel.reload();
  await expect(toggle).toHaveAccessibleName("Theme: System. Switch to Light.");
});

test("renders both themes at 320, 390, 420px and passes accessibility basics", async ({
  fontzie,
}) => {
  const {
    resetCurrentPage,
    inspect,
    panel,
    size,
    sliderValue,
    target,
    colors,
    contrastRatio,
  } = fontzie;

  await resetCurrentPage();
  await inspect("#hero");
  await panel
    .getByRole("group", { name: "Font provider" })
    .getByRole("button", { name: "Google", exact: true })
    .click();
  await panel.getByLabel("Search fonts", { exact: true }).fill("Manrope");
  await panel.locator(".font-choice").filter({ hasText: "Manrope" }).click();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await size("48");
  await sliderValue("Font weight", 600);
  await expect(target.locator("#hero")).toHaveCSS("font-weight", "600");
  await inspect(".copy");
  await panel.getByLabel("Search fonts", { exact: true }).fill("Inter");
  await panel
    .locator(".font-choice")
    .filter({ has: panel.getByText("Inter", { exact: true }) })
    .click();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await size("16");
  await panel.locator(".rule-select").first().click();
  await panel.getByLabel("Search fonts", { exact: true }).fill("");
  await panel.evaluate(() =>
    document
      .querySelectorAll<HTMLButtonElement>(
        '[data-slot="collapsible-trigger"][aria-expanded="true"]',
      )
      .forEach((trigger) => {
        if (
          !trigger.closest(
            '[data-card="rules"], #targets, #font-browser, #typography',
          )
        )
          trigger.click();
      }),
  );
  await fs.mkdir("tests/screenshots", { recursive: true });
  const results = [];
  for (const theme of ["light", "dark"]) {
    await fontzie.openSettings();
    await fontzie.setTheme(theme);
    await fontzie.closeSettings();
    // Monochrome actions invert with the theme and retain contrast on hover.
    const primary = panel.getByRole("button", { name: "Export", exact: true });
    await panel.mouse.move(0, 0);
    const resting = await colors(primary);
    expect(resting).toEqual({
      background: theme === "light" ? "rgb(71, 71, 71)" : "rgb(230, 230, 230)",
      foreground: theme === "light" ? "rgb(255, 255, 255)" : "rgb(37, 37, 37)",
    });
    expect(
      contrastRatio(resting.foreground, resting.background),
    ).toBeGreaterThanOrEqual(4.5);
    await primary.hover();
    const hovered = await colors(primary);
    expect(hovered.foreground).toBe(resting.foreground);
    expect(
      contrastRatio(hovered.foreground, hovered.background),
    ).toBeGreaterThanOrEqual(4.5);
    await primary.click();
    const copy = panel.getByRole("button", { name: "Copy code", exact: true });
    expect(await colors(copy)).toEqual(resting);
    await copy.hover();
    expect(await colors(copy)).toEqual(hovered);
    await panel
      .getByRole("button", { name: "Close export", exact: true })
      .click();
    const shownRule = panel
      .locator('.rule-visibility[aria-pressed="true"]')
      .first();
    const checked = await shownRule.evaluate((el) => ({
      foreground: getComputedStyle(el).color,
      background: getComputedStyle(el.closest(".rule-row")!).backgroundColor,
    }));
    expect(
      contrastRatio(checked.foreground, checked.background),
    ).toBeGreaterThanOrEqual(3);
    await expect(panel.locator('.ui-switch[data-state="checked"]')).toHaveCSS(
      "background-color",
      resting.background,
    );
    const thumb = panel.getByRole("slider", {
      name: "Size slider",
      exact: true,
    });
    const sliderContrast = await thumb.evaluate((el) => ({
      thumb: getComputedStyle(el).backgroundColor,
      track: getComputedStyle(
        el.closest('[data-slot="slider"]')!.querySelector(".ui-slider-track")!,
      ).backgroundColor,
    }));
    expect(
      contrastRatio(sliderContrast.thumb, sliderContrast.track),
    ).toBeGreaterThanOrEqual(3);
    await panel.mouse.move(0, 0);
    for (const w of [320, 390, 420]) {
      if (
        process.env.FONTZIE_CAPTURE_ONLY &&
        process.env.FONTZIE_CAPTURE_ONLY !== `${theme}-${w}`
      )
        continue;
      await panel.setViewportSize({ width: w, height: 900 });
      await panel.evaluate(() => window.scrollTo(0, 0));
      await panel.screenshot({
        path: `tests/screenshots/${theme}-${w}-viewport.png`,
      });
      const height = await panel.evaluate(
        () => document.documentElement.scrollHeight,
      );
      await panel.setViewportSize({ width: w, height });
      await panel.evaluate(
        () =>
          new Promise<number>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await panel.screenshot({
        path: `tests/screenshots/${theme}-${w}.png`,
      });
      await panel.setViewportSize({ width: w, height: 900 });
      await panel
        .getByLabel("Letter spacing", { exact: true })
        .scrollIntoViewIfNeeded();
      const numericBottom = await panel
        .getByLabel("Letter spacing", { exact: true })
        .evaluate((el) => el.getBoundingClientRect().bottom);
      const footerTop = await panel
        .locator("footer")
        .evaluate((el) => el.getBoundingClientRect().top);
      expect(numericBottom).toBeLessThan(footerTop);
      const overflow = await panel.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      expect(overflow).toBe(false);
      results.push({ theme, width: w, overflow });
    }
    // Scrolling to Typography reveals the rule switcher with an opacity transition.
    // Contrast must be measured with its final foreground and background colors.
    await panel
      .getByLabel("Letter spacing", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(panel.locator('.editing-bar[data-visible="true"]')).toHaveCSS(
      "opacity",
      "1",
    );
    const a = await new AxeBuilder({ page: panel })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(a.violations).toEqual([]);
  }
  if (!process.env.FONTZIE_CAPTURE_ONLY)
    await fs.writeFile(
      "tests/screenshots/render-results.json",
      JSON.stringify(results, null, 2),
    );
});

test("native selects stay inset at panel widths", async ({ fontzie }) => {
  const { panel, inspect, size, openSettings } = fontzie;
  await inspect("#hero");
  await size("24");
  for (const theme of ["light", "dark"]) {
    await openSettings();
    await fontzie.setTheme(theme);
    for (const width of [320, 390, 420]) {
      await panel.setViewportSize({ width, height: 900 });
      for (const [field, inSettings] of [
        [panel.getByLabel("Size unit", { exact: true }), false],
        [panel.getByLabel("Theme", { exact: true }), true],
      ] as const) {
        if (inSettings) await fontzie.openSettings();
        else await fontzie.closeSettings();
        await field.scrollIntoViewIfNeeded();
        const geometry = await field.evaluate((select) => {
          const icon = select.parentElement!.querySelector("svg")!;
          const s = select.getBoundingClientRect(),
            i = icon.getBoundingClientRect();
          return {
            inset: s.right - i.right,
            center: Math.abs(s.top + s.height / 2 - (i.top + i.height / 2)),
            padding: parseFloat(getComputedStyle(select).paddingRight),
            appearance: getComputedStyle(select).appearance,
          };
        });
        expect(geometry.inset).toBeGreaterThanOrEqual(8);
        expect(geometry.center).toBeLessThanOrEqual(1);
        expect(geometry.padding).toBeGreaterThanOrEqual(22);
        expect(geometry.appearance).toBe("none");
      }
      await fontzie.closeSettings();
      expect(
        await panel.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});

test("annotated controls keep decimals visible, group focus and align rule controls", async ({
  fontzie,
}) => {
  const { panel, resetCurrentPage, inspect, size, openSettings, target } =
    fontzie;

  await panel.reload();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await resetCurrentPage();
  await expect(panel.locator("[data-rule-id]")).toHaveCount(0);
  await inspect("#hero");
  await size("40.5");
  await panel
    .getByRole("button", { name: "Advanced typography", exact: true })
    .click();
  for (const theme of ["light", "dark"]) {
    await openSettings();
    await fontzie.setTheme(theme);
    for (const width of [320, 390, 420]) {
      await panel.setViewportSize({ width, height: 900 });
      const input = panel.getByLabel("Size", { exact: true });
      await input.fill("140.5");
      await input.press("Tab");
      await expect(target.locator("#hero")).toHaveCSS("font-size", "140.5px");
      await input.focus();
      const geometry = await input.evaluate((el) => {
        const style = getComputedStyle(el);
        const canvas = document.createElement("canvas").getContext("2d")!;
        canvas.font = `${style.fontSize} ${style.fontFamily}`;
        return {
          required: canvas.measureText((el as HTMLInputElement).value).width,
          available:
            el.clientWidth -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight),
          inputOutlineStyle: style.outlineStyle,
          groupOutline: getComputedStyle(el.closest(".number-box")!)
            .outlineWidth,
        };
      });
      expect(geometry.available).toBeGreaterThanOrEqual(geometry.required);
      expect(geometry.inputOutlineStyle).toBe("none");
      expect(geometry.groupOutline).toBe("2px");
      const tabs = panel.getByRole("group", { name: "Font provider" });
      expect(
        await tabs.evaluate((el) => getComputedStyle(el).borderRadius),
      ).toBe("8px");
      const chosen = panel
        .getByRole("group", { name: "Transform", exact: true })
        .getByRole("radio", { name: "None", exact: true });
      expect(
        await chosen.evaluate((el) => ({
          color: getComputedStyle(el).color,
          background: getComputedStyle(el).backgroundColor,
          border: getComputedStyle(el).borderTopColor,
        })),
      ).toEqual({
        color: theme === "light" ? "rgb(255, 255, 255)" : "rgb(37, 37, 37)",
        background:
          theme === "light" ? "rgb(71, 71, 71)" : "rgb(230, 230, 230)",
        border: theme === "light" ? "rgb(71, 71, 71)" : "rgb(230, 230, 230)",
      });
      const alignment = await panel
        .locator(".rule-row")
        .first()
        .evaluate((el) => {
          const visibility = el
            .querySelector(".rule-visibility")!
            .getBoundingClientRect();
          const options = el
            .querySelector(".rule-actions .icon-button")!
            .getBoundingClientRect();
          return Math.abs(
            visibility.top +
              visibility.height / 2 -
              (options.top + options.height / 2),
          );
        });
      expect(alignment).toBeLessThanOrEqual(2);
      expect(
        await panel.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const audit = await new AxeBuilder({ page: panel })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(audit.violations).toEqual([]);
      await panel.locator('[aria-labelledby="type-heading"]').screenshot({
        path: `tests/screenshots/annotations-${theme}-${width}.png`,
      });
    }
  }
});

test("all section cards expose matching level-two headings and keyboard controls", async ({
  fontzie,
}) => {
  const { panel, inspect, size, ruleAction } = fontzie;
  await inspect("#hero");
  await size("24");
  await ruleAction(1, "Duplicate");

  const sections = [/^Rules$/, /^Targets/, /^Font family$/, /^Typography$/];
  for (const name of sections) {
    await expect(panel.getByRole("heading", { name, level: 2 })).toHaveCount(1);
  }
  const cards = panel.locator("main .ui-card");
  await expect(cards).toHaveCount(sections.length);
  for (const card of await cards.all()) {
    await expect(card.getByRole("heading", { level: 2 })).toHaveCount(1);
  }
  for (const name of sections) {
    const heading = panel.getByRole("heading", { name, level: 2 });
    const trigger = heading.getByRole("button");
    const expanded = await trigger.getAttribute("aria-expanded");
    await trigger.focus();
    await trigger.press("Space");
    await expect(trigger).toHaveAttribute(
      "aria-expanded",
      String(expanded !== "true"),
    );
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", expanded!);
  }

  await fs.mkdir("tests/screenshots", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await fontzie.setTheme(theme);
    for (const width of [320, 390, 420]) {
      await panel.setViewportSize({ width, height: 900 });
      const styles = await panel
        .getByRole("main")
        .getByRole("heading", { level: 2 })
        .evaluateAll((headings) =>
          headings.map((heading) => {
            const style = getComputedStyle(
              heading.querySelector("button") ?? heading,
            );
            return [
              style.fontFamily,
              style.fontSize,
              style.fontWeight,
              style.lineHeight,
              style.letterSpacing,
            ];
          }),
        );
      expect(
        styles.every(
          (style) => JSON.stringify(style) === JSON.stringify(styles[0]),
        ),
      ).toBe(true);
      expect(
        await panel.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await panel
        .getByRole("heading", {
          name: /^Rules$/,
          level: 2,
        })
        .scrollIntoViewIfNeeded();
      await panel.screenshot({
        path: `tests/screenshots/section-headings-${theme}-${width}.png`,
      });
    }
    const audit = await new AxeBuilder({ page: panel })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
  }
});

test("provider pills track results through rapid switches, keyboard use and reduced motion", async ({
  fontzie,
}) => {
  const { panel, inspect, size } = fontzie;
  await inspect("#hero");
  await size("24");
  await panel.emulateMedia({ reducedMotion: "no-preference" });
  const providers = panel.getByRole("group", {
    name: "Font provider",
    exact: true,
  });
  const indicator = providers.locator(".pill-indicator");
  const results = panel.locator(".font-results");
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveCSS(
    "transition-duration",
    "0.18s, 0.18s, 0.18s",
  );
  await providers.getByRole("button", { name: "Local", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Load installed fonts", exact: true }),
  ).toBeVisible();
  const forward = await results.evaluate((el) =>
    el
      .getAnimations()
      .flatMap((animation) =>
        animation.effect instanceof KeyframeEffect
          ? animation.effect.getKeyframes()
          : [],
      ),
  );
  expect(forward.some((frame) => frame.transform === "translateX(48px)")).toBe(
    true,
  );
  await expect(
    panel.getByText("Fonts on this device", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("region", { name: "Font families" }),
  ).toBeHidden();
  await expect(
    panel.getByRole("searchbox", { name: "Search fonts" }),
  ).toBeHidden();
  await expect(panel.locator("#font-filters")).toHaveCount(0);
  await providers.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Add fonts", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: /^Custom font files/ }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("region", { name: "Font families", exact: true }),
  ).toBeHidden();
  await expect(
    panel.getByRole("searchbox", { name: "Search fonts" }),
  ).toBeHidden();
  await expect(panel.locator("#font-filters")).toHaveCount(0);
  await expect(panel.locator(".font-choice")).toHaveCount(0);
  await providers.getByRole("button", { name: "Google", exact: true }).click();
  await providers
    .getByRole("button", { name: "Fontshare", exact: true })
    .click();
  const all = providers.getByRole("button", { name: "All", exact: true });
  await all.focus();
  await all.press("Space");
  await expect(all).toBeFocused();
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator(".font-choice").first()).toContainText("Inter");
  await results.evaluate(async (el) => {
    await Promise.all(
      el.getAnimations().map((animation) => animation.finished),
    );
  });
  for (const width of [320, 390, 420]) {
    await panel.setViewportSize({ width, height: 900 });
    await expect
      .poll(async () =>
        indicator.evaluate((el) => {
          const pill = el.getBoundingClientRect();
          const selected = el
            .closest(".provider-tabs")!
            .querySelector('button[aria-pressed="true"]')!
            .getBoundingClientRect();
          return Math.max(
            Math.abs(pill.left - selected.left),
            Math.abs(pill.width - selected.width),
          );
        }),
      )
      .toBeLessThan(1);
    expect(
      await panel.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await panel.emulateMedia({ reducedMotion: "reduce" });
  await providers.getByRole("button", { name: "Local", exact: true }).click();
  await expect(indicator).toHaveCSS("transition-duration", "0s");
  expect(await results.evaluate((el) => el.getAnimations().length)).toBe(0);
  await expect(
    providers.getByRole("button", { name: "Local", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "Export", exact: true }).click();
  const formats = panel.getByRole("group", {
    name: "Export format",
    exact: true,
  });
  await formats.getByRole("button", { name: "AI prompt", exact: true }).click();
  await expect(
    formats.getByRole("button", { name: "AI prompt", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    panel.getByRole("dialog").getByRole("textbox", { name: "Export preview" }),
  ).toHaveValue(/Fontzie, a browser extension/);
  await expect(formats.locator(".pill-indicator")).toBeVisible();
  await panel
    .getByRole("button", { name: "Close export", exact: true })
    .click();
  await panel.emulateMedia({ reducedMotion: "no-preference" });
  await providers.getByRole("button", { name: "All", exact: true }).click();
  await results.evaluate(async (el) => {
    await Promise.all(
      el.getAnimations().map((animation) => animation.finished),
    );
  });
  await panel
    .locator('[aria-labelledby="font-heading"]')
    .screenshot({ path: "tests/screenshots/animated-font-browser.png" });
});

test("primary cards and rules collapse independently and search reopens with its filters intact", async ({
  fontzie,
}) => {
  const { panel, inspect, size } = fontzie;
  await inspect("#hero");
  await size("24");
  const fonts = panel.locator('[aria-labelledby="font-heading"]');
  const fontToggle = panel
    .getByRole("heading", { name: "Font family", exact: true })
    .getByRole("button");
  await panel.getByRole("searchbox", { name: "Search fonts" }).fill("Inter");
  await expect(
    fonts.getByLabel("Font category", { exact: true }),
  ).toBeVisible();
  await fontToggle.click();
  await expect(fontToggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    panel.getByRole("searchbox", { name: "Search fonts" }),
  ).toBeHidden();
  await fontToggle.press("/");
  await expect(fontToggle).toHaveAttribute("aria-expanded", "true");
  const search = panel.getByRole("searchbox", { name: "Search fonts" });
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("Inter");
  await expect(
    panel.getByLabel("Font category", { exact: true }),
  ).toBeVisible();

  await search.fill("");
  await fonts.getByRole("button", { name: "Next font", exact: true }).click();
  await expect(fontToggle).toHaveAttribute("aria-expanded", "true");

  const targets = panel.locator('[aria-labelledby="target-heading"]');
  const rules = panel.locator('[aria-labelledby="rules-heading"]');
  expect(
    await rules.evaluate((el) =>
      el.nextElementSibling?.getAttribute("aria-labelledby"),
    ),
  ).toBe("target-heading");
  await expect(targets.locator(".rule-row")).toHaveCount(0);
  const targetToggle = panel
    .getByRole("heading", { name: /^Targets/, level: 2 })
    .getByRole("button");
  const rulesToggle = panel
    .getByRole("heading", { name: "Rules", exact: true, level: 2 })
    .getByRole("button");
  await rulesToggle.click();
  await expect(rules.locator(".rule-row")).toBeHidden();
  await expect(
    targets.getByRole("textbox", { name: "CSS selector", exact: true }),
  ).toBeVisible();
  await rulesToggle.click();
  await targetToggle.click();
  await expect(rules.locator(".rule-row")).toBeVisible();
  await rules.getByRole("button", { name: "New", exact: true }).click();
  await expect(rulesToggle).toHaveAttribute("aria-expanded", "true");
  await expect(targetToggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel.locator("#selector")).toBeFocused();
  await targetToggle.click();
  await expect(
    targets.getByRole("textbox", { name: "CSS selector", exact: true }),
  ).toBeHidden();
  await expect(rules.locator(".rule-row")).toHaveCount(2);
  await rules.locator(".rule-select").last().click();
  await expect(rules.locator(".rule-row.editing")).toContainText("#hero");
  await targetToggle.click();
  await expect(rules.locator(".rule-row")).toHaveCount(2);

  const typography = panel.locator('[aria-labelledby="type-heading"]');
  const typeToggle = typography
    .getByRole("heading", { level: 2 })
    .getByRole("button");
  await typeToggle.click();
  await expect(panel.getByLabel("Weight", { exact: true })).toBeHidden();
  await typeToggle.click();
  await expect(panel.getByLabel("Weight", { exact: true })).toBeVisible();
});

test("card headings respond at both edges and the footer fills short viewports", async ({
  fontzie,
}) => {
  const { panel } = fontzie;
  await fontzie.inspect("#hero");
  await fontzie.size("24");
  await panel.emulateMedia({ reducedMotion: "reduce" });
  const triggers = panel.locator(
    ".ui-card > .ui-card-body > .disclosure > .disclosure-header > .disclosure-heading > .disclosure-trigger",
  );
  for (const trigger of await triggers.all()) {
    if ((await trigger.getAttribute("aria-expanded")) === "true")
      await trigger.click();
  }
  for (const width of [320, 390, 420]) {
    await panel.setViewportSize({ width, height: 1000 });
    const rules = panel.getByRole("button", { name: "Rules", exact: true });
    const bounds = (await rules.boundingBox())!;
    await panel.mouse.click(
      bounds.x + bounds.width - 3,
      bounds.y + bounds.height / 2,
    );
    await expect(rules).toHaveAttribute("aria-expanded", "true");
    await panel.mouse.click(bounds.x + 3, bounds.y + bounds.height / 2);
    await expect(rules).toHaveAttribute("aria-expanded", "false");
    await expect
      .poll(async () => {
        const footer = (await panel.locator("footer").boundingBox())!;
        return Math.round(footer.y + footer.height);
      })
      .toBe(1000);
  }
  await panel.setViewportSize({ width: 390, height: 500 });
  await panel.getByRole("button", { name: "Typography", exact: true }).click();
  await expect(panel.getByLabel("Weight", { exact: true })).toBeVisible();
  const footer = (await panel.locator("footer").boundingBox())!;
  expect(Math.round(footer.y + footer.height)).toBe(500);
});

test("collapsible section text inherits the h2's typography and text transform", async ({
  fontzie,
}) => {
  const { panel } = fontzie;
  await fontzie.inspect("#hero");
  const sheet = await panel.addStyleTag({
    content: "h2 { text-transform: uppercase; font-style: italic; }",
  });
  for (const name of [/^Typography$/]) {
    const heading = panel.getByRole("heading", { name, level: 2 });
    await expect(heading).toHaveClass(/disclosure-title/);
    const button = heading.getByRole("button");
    await expect(button).toHaveCSS("text-transform", "uppercase");
    await expect(button).toHaveCSS("font-style", "italic");
    if ((await button.getAttribute("aria-expanded")) === "true")
      await button.click();
    await button.focus();
    await button.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await button.press("Space");
    await expect(button).toHaveAttribute("aria-expanded", "false");
  }
  await sheet.evaluate((el) => el.parentNode?.removeChild(el));
});

test("cards resize smoothly and disclosures animate both ways with reduced motion support", async ({
  fontzie,
}) => {
  const { panel, inspect, size } = fontzie;
  await panel.emulateMedia({ reducedMotion: "no-preference" });
  await inspect("#hero");
  await size("24");
  const fonts = panel.locator('[aria-labelledby="font-heading"]');
  const settleCards = () =>
    expect
      .poll(() =>
        panel.locator("main").evaluate(
          (el) =>
            el.getAnimations({ subtree: true }).filter((animation) => {
              const target =
                animation.effect instanceof KeyframeEffect
                  ? animation.effect.target
                  : undefined;
              return (
                (animation.pending || animation.playState === "running") &&
                target instanceof Element &&
                target.matches(".ui-card")
              );
            }).length,
        ),
      )
      .toBe(0);
  const sampleHeightAnimation = async (card: typeof fonts) =>
    card.evaluate(async (el) => {
      // Wait for async rule creation and inspect the element owning the resize.
      const deadline = performance.now() + 1000;
      let animation: Animation | undefined;
      do {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        animation = el
          .getAnimations({ subtree: true })
          .find(
            (candidate) =>
              candidate.playState === "running" &&
              candidate.effect instanceof KeyframeEffect &&
              candidate.effect
                .getKeyframes()
                .some((frame) => "height" in frame),
          );
      } while (!animation && performance.now() < deadline);
      if (!animation || !(animation.effect instanceof KeyframeEffect))
        return undefined;
      const target = animation.effect.target;
      if (!(target instanceof Element)) return undefined;
      animation.pause();
      animation.currentTime =
        Number(animation.effect.getComputedTiming().duration) / 2;
      // Measure in this task: another stack update can replace this animation
      // on the next frame. Reading bounds flushes the seek synchronously.
      const frames = animation.effect.getKeyframes();
      const start = parseFloat(String(frames[0]!.height));
      const end = parseFloat(String(frames.at(-1)!.height));
      const current = target.getBoundingClientRect().height;
      animation.finish();
      return { start, end, current };
    });
  await settleCards();
  const [filtering] = await Promise.all([
    sampleHeightAnimation(fonts),
    fonts
      .getByRole("heading", { name: "Font family", exact: true })
      .getByRole("button")
      .click(),
  ]);
  expect(filtering).toBeDefined();
  expect(filtering!.current).toBeGreaterThan(
    Math.min(filtering!.start, filtering!.end),
  );
  expect(filtering!.current).toBeLessThan(
    Math.max(filtering!.start, filtering!.end),
  );
  const rules = panel.locator('[aria-labelledby="rules-heading"]');
  await settleCards();
  const [addingRule] = await Promise.all([
    sampleHeightAnimation(rules),
    rules.getByRole("button", { name: "New", exact: true }).click(),
  ]);
  expect(addingRule).toBeDefined();
  expect(addingRule!.end).toBeGreaterThan(addingRule!.start);
  expect(addingRule!.current).toBeGreaterThan(addingRule!.start);
  expect(addingRule!.current).toBeLessThan(addingRule!.end);
  await rules.locator(".rule-select").last().click();

  await fontzie.openSettings();
  const backup = panel.getByRole("button", {
    name: "Backup & data",
    exact: true,
  });
  const content = panel.locator(
    '#backup-data > [data-slot="collapsible-content"]',
  );
  await backup.click();
  await expect(content).toHaveCSS("animation-name", "disclosure-open");
  await content.evaluate(async (el) => {
    await Promise.all(
      el.getAnimations().map((animation) => animation.finished),
    );
  });
  await expect(
    panel.getByRole("button", { name: "Export backup", exact: true }),
  ).toBeVisible();
  await backup.click();
  await expect(content).toHaveCSS("animation-name", "disclosure-close");
  await expect(content).toHaveJSProperty("inert", true);
  await expect(content).toBeHidden();
  await backup.click();
  await backup.click();
  await backup.click();
  await expect(backup).toHaveAttribute("aria-expanded", "true");
  await expect(
    panel.getByRole("button", { name: "Export backup", exact: true }),
  ).toBeVisible();

  await panel.emulateMedia({ reducedMotion: "reduce" });
  await backup.click();
  await expect(content).toBeHidden();
  await backup.click();
  await expect(content).toHaveCSS("animation-name", "none");
  await expect(
    panel.getByRole("button", { name: "Export backup", exact: true }),
  ).toBeVisible();
  await fontzie.closeSettings();
  expect(await fonts.evaluate((el) => el.getAnimations().length)).toBe(0);
  const fontHeading = fonts
    .getByRole("heading", { name: "Font family", exact: true })
    .getByRole("button");
  if ((await fontHeading.getAttribute("aria-expanded")) !== "true")
    await fontHeading.click();
  await expect(
    fonts.getByLabel("Font category", { exact: true }),
  ).toBeVisible();
  expect(await fonts.evaluate((el) => el.getAnimations().length)).toBe(0);
});

test("card preferences survive closing and reopening the panel", async ({
  fontzie,
}) => {
  const { worker, inspect, size, ruleAction } = fontzie;
  let panel = fontzie.panel;
  const toggle = (id: string) =>
    panel.locator(
      `[data-card="${id}"] > .disclosure-header .disclosure-trigger`,
    );
  await inspect("#hero");
  await size("24");
  await ruleAction(1, "Duplicate");
  for (const id of ["rules", "targets", "font-browser"])
    await toggle(id).click();
  await toggle("typography").click();
  await toggle("typography").click();
  const expected = {
    "panel:card:rules": false,
    "panel:card:targets": false,
    "panel:card:font-browser": false,
    "panel:card:typography": true,
  };
  await expect
    .poll(() =>
      worker.evaluate(
        (keys) => chrome.storage.local.get(keys),
        Object.keys(expected),
      ),
    )
    .toEqual(expected);
  const url = panel.url();
  await panel.close();
  panel = await fontzie.reopenPanel(url);
  for (const [key, open] of Object.entries(expected)) {
    const id = key.replace("panel:card:", "");
    await expect(toggle(id)).toHaveAttribute("aria-expanded", String(open));
  }
  await expect(
    panel.getByRole("searchbox", { name: "Search fonts" }),
  ).toBeHidden();
  await toggle("targets").click();
  await expect(toggle("rules")).toHaveAttribute("aria-expanded", "false");
  await toggle("rules").click();
  await expect(panel.locator(".rule-row")).toHaveCount(2);
});
