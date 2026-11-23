import { test, expect } from "./fixtures/extension";
import AxeBuilder from "@axe-core/playwright";

test("typography applies across viewport widths and exports CSS and Tailwind", async ({
  fontzie,
}) => {
  const { inspect, size, target, panel } = fontzie;

  await inspect("#hero");
  await size("54");
  await target.setViewportSize({ width: 600, height: 850 });
  await expect(target.locator("#hero")).toHaveCSS("font-size", "54px");
  await target.setViewportSize({ width: 1100, height: 850 });
  await panel.getByRole("button", { name: "Export", exact: true }).click();
  await expect(
    panel.getByRole("dialog").getByRole("textbox", { name: "Export preview" }),
  ).not.toHaveValue(/@media/);
  await panel
    .getByRole("group", { name: "Export format", exact: true })
    .getByRole("button", { name: "Tailwind CSS v4", exact: true })
    .click();
  await expect(
    panel.getByRole("dialog").getByRole("textbox", { name: "Export preview" }),
  ).toHaveValue(/@theme/);
  await panel
    .getByRole("button", { name: "Close export", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Export", exact: true }),
  ).toBeFocused();
  await panel
    .getByRole("button", { name: "Export", exact: true })
    .press("Enter");
  await expect(panel.getByRole("dialog")).toBeVisible();
  await panel.keyboard.press("Escape");
  await expect(panel.getByRole("dialog")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Export", exact: true }),
  ).toBeFocused();
});

test("original comparison toggles until restored without changing saved preview or history", async ({
  fontzie,
}) => {
  const { inspect, size, panel, target } = fontzie;

  await inspect("#hero");
  await size("57");
  // Separate subsequent edits from the 500ms slider-history grouping window.
  await panel.waitForTimeout(550);
  const original = panel.getByRole("button", {
    name: "Show original",
    exact: true,
  });
  const edited = panel.getByRole("button", {
    name: "Back to edited",
    exact: true,
  });
  const savedConfig = await panel.evaluate(
    async () => await chrome.storage.session.get(null),
  );
  await original.click();
  await expect(edited).toBeVisible();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "64px");
  await panel.getByRole("button", { name: "Export", exact: true }).focus();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "64px");
  await edited.press("Space");
  await expect(original).toBeVisible();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "57px");
  expect(
    await panel.evaluate(async () => chrome.storage.session.get(null)),
  ).toEqual(savedConfig);
  await original.press("Enter");
  await expect(edited).toBeVisible();
  await size("59");
  await expect(original).toBeVisible();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "59px");
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "57px");
  await original.click();
  await expect(edited).toBeVisible();
  await panel.reload();
  await expect(original).toBeVisible();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "57px");
  const toggle = panel.getByRole("switch", { name: "Preview", exact: true });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(original).toBeDisabled();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "64px");
  await toggle.click();
  await expect(original).toBeEnabled();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "57px");
});

test("advanced icon controls preserve values, keyboard use and resets", async ({
  fontzie,
}) => {
  const { inspect, panel, target, openDisclosure } = fontzie;

  await inspect("#hero");
  await panel.getByLabel("Search fonts", { exact: true }).fill("Inter");
  await panel
    .locator(".font-choice")
    .filter({ has: panel.getByText("Inter", { exact: true }) })
    .click();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await openDisclosure("Advanced typography");
  const group = (name: string) =>
    panel.getByRole("group", { name, exact: true });
  await group("Transform")
    .getByRole("radio", { name: "Uppercase", exact: true })
    .check();
  await expect(target.locator("#hero")).toHaveCSS(
    "text-transform",
    "uppercase",
  );
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  const uppercase = group("Transform").getByRole("radio", {
    name: "Uppercase",
    exact: true,
  });
  // Applying the previous edit temporarily disables controls and can drop focus.
  // Start keyboard navigation once the selected radio can receive keys again.
  await expect(uppercase).toBeEnabled();
  await uppercase.focus();
  await expect(uppercase).toBeFocused();
  // Reka selects the newly focused radio asynchronously while the key is held.
  // Wait for that observable result instead of relying on a fixed key delay.
  await panel.keyboard.down("ArrowRight");
  try {
    await expect(
      group("Transform").getByRole("radio", { name: "Lowercase", exact: true }),
    ).toBeChecked();
  } finally {
    await panel.keyboard.up("ArrowRight");
  }
  await expect(target.locator("#hero")).toHaveCSS(
    "text-transform",
    "lowercase",
  );
  await group("Transform")
    .getByRole("button", { name: "Reset Transform", exact: true })
    .click();
  await expect(target.locator("#hero")).toHaveCSS("text-transform", "none");
  await group("Decoration")
    .getByRole("radio", { name: "Underline", exact: true })
    .check();
  await expect(target.locator("#hero")).toHaveCSS(
    "text-decoration-line",
    "underline",
  );
  await group("Alignment")
    .getByRole("radio", { name: "Right", exact: true })
    .check();
  await expect(target.locator("#hero")).toHaveCSS("text-align", "right");
  await group("Optical sizing")
    .getByRole("radio", { name: "None", exact: true })
    .check();
  await expect(target.locator("#hero")).toHaveCSS(
    "font-optical-sizing",
    "none",
  );
  await group("Ligatures")
    .getByRole("radio", { name: "Common", exact: true })
    .check();
  await expect(target.locator("#hero")).toHaveCSS(
    "font-variant-ligatures",
    "common-ligatures",
  );
});

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 390, 420]) {
    test(`advanced icon controls fit ${width}px in ${theme} theme`, async ({
      fontzie,
    }) => {
      const { inspect, panel, openDisclosure } = fontzie;
      await inspect("#hero");
      await panel.getByLabel("Search fonts", { exact: true }).fill("Inter");
      await panel
        .locator(".font-choice")
        .filter({ has: panel.getByText("Inter", { exact: true }) })
        .click();
      await expect(panel.locator(".panel")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await openDisclosure("Advanced typography");
      for (const [name, option] of [
        ["Decoration", "Underline"],
        ["Alignment", "Right"],
        ["Optical sizing", "None"],
        ["Ligatures", "Common"],
      ] as const) {
        await panel
          .getByRole("group", { name, exact: true })
          .getByRole("radio", { name: option, exact: true })
          .check();
        await expect(panel.locator(".panel")).toHaveAttribute(
          "aria-busy",
          "false",
        );
      }
      await openDisclosure("Settings");
      await fontzie.setTheme(theme);
      await panel.setViewportSize({ width, height: 900 });
      expect(
        await panel.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const style = panel.getByRole("group", { name: "Style", exact: true });
      const transform = panel.getByRole("group", {
        name: "Transform",
        exact: true,
      });
      await expect(
        style.getByRole("button", { name: "Reset Style" }),
      ).toBeVisible();
      await expect(
        transform.getByRole("button", { name: "Reset Transform" }),
      ).toHaveCount(0);
      const styleButton = await style.getByRole("radio").first().boundingBox();
      const transformButton = await transform
        .getByRole("radio")
        .first()
        .boundingBox();
      expect(Math.abs(styleButton!.y - transformButton!.y)).toBeLessThan(1);
      for (const box of await panel
        .locator(".icon-option svg")
        .evaluateAll((icons) =>
          icons.map((icon) => {
            const box = icon.getBoundingClientRect();
            return { width: box.width, height: box.height };
          }),
        )) {
        expect(box.width).toBe(16);
        expect(box.height).toBe(16);
      }
      const results = await new AxeBuilder({ page: panel })
        .include(".advanced-grid")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
      await panel
        .locator(".advanced-grid:visible")
        .screenshot({ path: `tests/screenshots/icons-${theme}-${width}.png` });
    });
  }
}

test("Size keeps tracking the pointer while edits apply to the page", async ({
  fontzie,
}) => {
  const { inspect, size, panel, target } = fontzie;
  await inspect("#hero");
  await size("32");
  const hero = target.locator("#hero");
  await expect(hero).toHaveCSS("font-size", "32px");
  const thumb = panel.getByRole("slider", { name: "Size slider", exact: true });
  await thumb.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const probe = await thumb.evaluateHandle((el) => {
    const track = el.closest('[data-slot="slider"]')!;
    const headerButton = document.querySelector(
      '[aria-label="Float editor over webpage"]',
    )!;
    let disabledChanges = 0;
    const observer = new MutationObserver((records) => {
      disabledChanges += records.length;
    });
    observer.observe(track, {
      attributes: true,
      attributeFilter: ["data-disabled"],
    });
    observer.observe(headerButton, {
      attributes: true,
      attributeFilter: ["disabled"],
    });
    return () => {
      observer.disconnect();
      return { sameThumb: el.isConnected, disabledChanges };
    };
  });
  const knob = (await thumb.boundingBox())!;
  const x = knob.x + knob.width / 2;
  const y = knob.y + knob.height / 2;
  let finalValue: number;
  await panel.mouse.move(x, y);
  await panel.mouse.down();
  try {
    await panel.mouse.move(x + 50, y, { steps: 25 });
    const value = Number(await thumb.getAttribute("aria-valuenow"));
    expect(value).toBeGreaterThan(32);
    await expect(hero).toHaveCSS("font-size", `${value}px`);
    await panel.mouse.move(x + 90, y, { steps: 20 });
    finalValue = Number(await thumb.getAttribute("aria-valuenow"));
    expect(finalValue).toBeGreaterThan(value);
  } finally {
    await panel.mouse.up();
  }
  await expect(hero).toHaveCSS("font-size", `${finalValue}px`);
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await expect(thumb).toHaveAttribute("aria-valuenow", String(finalValue));
  expect(await probe.evaluate((finish) => finish())).toEqual({
    sameThumb: true,
    disabledChanges: 0,
  });
  await probe.dispose();
});

test("fine controls use practical ranges, unit steps and full-width sliders", async ({
  fontzie,
}) => {
  const { resetCurrentPage, inspect, size, panel, target } = fontzie;

  await resetCurrentPage();
  await inspect("#hero");
  await size("32");
  const slider = panel.getByRole("slider", {
    name: "Size slider",
    exact: true,
  });
  await expect(slider).toHaveAttribute("aria-valuemin", "8");
  await expect(slider).toHaveAttribute("aria-valuemax", "120");
  await slider.press("ArrowRight");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "33px");
  await panel
    .getByRole("button", { name: "Decrease Size", exact: true })
    .click();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "32px");
  await panel.getByLabel("Line height unit", { exact: true }).selectOption("");
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await panel.getByLabel("Line height", { exact: true }).fill("1.4");
  await panel.getByLabel("Line height", { exact: true }).press("Tab");
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await panel
    .getByRole("button", { name: "Increase Line height", exact: true })
    .click();
  await expect(panel.getByLabel("Line height", { exact: true })).toHaveValue(
    "1.45",
  );
  await expect(target.locator("#hero")).toHaveCSS("line-height", "46.4px");
  await panel.getByLabel("Letter spacing", { exact: true }).fill("0.2");
  await panel.getByLabel("Letter spacing", { exact: true }).press("Tab");
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await panel
    .getByRole("button", { name: "Increase Letter spacing", exact: true })
    .click();
  await expect(target.locator("#hero")).toHaveCSS("letter-spacing", "0.3px");
  await panel
    .getByLabel("Letter spacing unit", { exact: true })
    .selectOption("em");
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await panel
    .getByRole("button", { name: "Increase Letter spacing", exact: true })
    .click();
  await expect(panel.getByLabel("Letter spacing", { exact: true })).toHaveValue(
    "0.31",
  );
  await size("240");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "240px");
  await expect(slider).toHaveAttribute("aria-valuemax", "240");
  await panel.setViewportSize({ width: 320, height: 900 });
  const width = await slider
    .locator('xpath=ancestor::*[@data-slot="slider"]')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(240);
  expect(
    await panel.locator("html").evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("14px");
});

test("expanded cards and action spacing stay readable at the narrow width", async ({
  fontzie,
}) => {
  const { panel } = fontzie;
  await fontzie.inspect("#hero");

  for (const theme of ["light", "dark"]) {
    await panel.setViewportSize({ width: 320, height: 900 });
    for (let depth = 0; depth < 3; depth++) {
      await panel.evaluate(() =>
        document
          .querySelectorAll<HTMLButtonElement>(
            '[data-slot="collapsible-trigger"][aria-expanded="false"]',
          )
          .forEach((button) => button.click()),
      );
    }
    await fontzie.setTheme(theme);
    await expect(
      panel.getByLabel("Font category", { exact: true }),
    ).toBeVisible();
    expect(
      await panel.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const audit = await new AxeBuilder({ page: panel })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    for (const gap of await panel
      .locator(".action-row")
      .evaluateAll((rows) =>
        rows.map((row) => parseFloat(getComputedStyle(row).gap)),
      ))
      expect(gap).toBeGreaterThanOrEqual(8);
    await fontzie.openSettings();
    await panel
      .getByRole("dialog", { name: "Settings", exact: true })
      .screenshot({ path: `tests/screenshots/settings-${theme}-320.png` });
    await fontzie.closeSettings();
    await panel
      .locator("#font-filters")
      .screenshot({ path: `tests/screenshots/filters-${theme}-320.png` });
  }
});

test("everyday editing discloses expert controls without responsive scopes", async ({
  fontzie,
}) => {
  const { panel, resetCurrentPage, target, size, inspect } = fontzie;

  await panel.reload();
  await expect(
    panel.getByRole("button", { name: "Pick element", exact: true }),
  ).toBeEnabled();
  await expect(panel.locator("#selector")).toBeVisible();
  await expect(panel.locator(".specimen")).toBeHidden();
  await expect(panel.getByRole("menuitem")).toHaveCount(0);
  await resetCurrentPage();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#hero").click();
  await size("42");
  await expect(
    panel.getByRole("button", { name: /^Responsive rules/ }),
  ).toHaveCount(0);
  await expect(panel.getByLabel("Editing width", { exact: true })).toHaveCount(
    0,
  );
  await size("44");
  await target.setViewportSize({ width: 600, height: 850 });
  await expect(target.locator("#hero")).toHaveCSS("font-size", "44px");
  await target.setViewportSize({ width: 1100, height: 850 });
  await inspect("#intro");
  await size("18");
  await panel.locator(".rule-select").filter({ hasText: "#hero" }).click();
  await expect(panel.getByLabel("Size", { exact: true })).toHaveValue("44");
});
