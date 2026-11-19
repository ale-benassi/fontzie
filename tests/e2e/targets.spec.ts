import { test, expect } from "./fixtures/extension";
import fs from "node:fs/promises";
import type { TabState } from "../../core/schema";
import type { Locator } from "@playwright/test";

function visibleMatchCount(locator: Locator) {
  return locator.evaluateAll(
    (elements) =>
      elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < innerHeight &&
          rect.left < innerWidth
        );
      }).length,
  );
}

test("picks without navigation, preserves exact identity and cancels with Escape", async ({
  fontzie,
}) => {
  const { panel, target, openTargetOptions, size } = fontzie;

  if (
    await panel
      .getByRole("button", { name: "Clear target", exact: true })
      .count()
  )
    await panel
      .getByRole("button", { name: "Clear target", exact: true })
      .click();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#nav-link").hover();
  await target.locator("#nav-link").click();
  await openTargetOptions();
  await expect(panel.locator(".exact-target")).toContainText("#nav-link");
  await expect(panel.locator(".rule-row")).toHaveCount(1);
  await expect(panel.locator(".rule-row.editing")).toContainText("#nav-link");
  await expect(panel.locator(".rule-row.editing")).toContainText(
    "Original font",
  );
  await expect(panel.locator(".rule-row.editing")).toContainText("0 changes");
  expect(target.url()).not.toContain("#article");
  await openTargetOptions();
  await expect(panel.locator(".exact-target")).toHaveCount(1);
  await size("24");
  await expect(target.locator("#nav-link")).toHaveCSS("font-size", "24px");
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await expect(panel.locator(".notification-title")).toHaveText(
    "Click an element on the website. Escape cancels.",
  );
  await target.bringToFront();
  await target.keyboard.press("Escape");
  await expect(
    panel.getByRole("button", { name: "Pick element", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("selector errors do not alter styles and important inline values restore", async ({
  fontzie,
}) => {
  const { openTargetOptions, panel, inspect, size, target } = fontzie;

  await openTargetOptions();
  await panel.locator("#selector").fill("h1 > > p");
  await panel.locator(".selector-add").press("Enter");
  await expect(panel.getByRole("alert")).toBeVisible();
  await inspect("#inline");
  await size("28");
  await expect(target.locator("#inline")).toHaveCSS("font-size", "28px");
  await panel.getByRole("switch", { name: "Preview", exact: true }).uncheck();
  await expect(target.locator("#inline")).toHaveCSS("font-size", "19px");
  await panel.getByRole("switch", { name: "Preview", exact: true }).check();
  await expect(target.locator("#inline")).toHaveCSS("font-size", "28px");
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(target.locator("#inline")).toHaveCSS("font-size", "19px");
  await panel.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(target.locator("#inline")).toHaveCSS("font-size", "28px");
});

test("open shadow roots and eligible frames use independent targets", async ({
  fontzie,
}) => {
  const { inspect, size, target, panel } = fontzie;

  await inspect(".shadow-title");
  await size("38");
  await expect(target.locator("#open-shadow .shadow-title")).toHaveCSS(
    "font-size",
    "38px",
  );
  await target.locator("#shadow").click();
  await expect(target.locator("#cards .shadow-title")).toHaveCSS(
    "font-size",
    "38px",
  );
  await panel.getByRole("button", { name: "New", exact: true }).click();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.frameLocator("#same-frame").locator("#frame-heading").click();
  await size("33");
  await expect(
    target.frameLocator("#same-frame").locator("#frame-heading"),
  ).toHaveCSS("font-size", "33px");
  await expect(target.locator("#open-shadow .shadow-title")).toHaveCSS(
    "font-size",
    "38px",
  );
});

test("duplicate iframe URLs retain their live target and pause ambiguous restoration", async ({
  fontzie,
}) => {
  const { target, panel, size } = fontzie;
  await target.route("**/playground/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        "</main>",
        '<iframe id="duplicate-frame" name="fontzie-second-frame" src="/playground/frame.html" title="Repeated frame"></iframe></main>',
      ),
    });
  });
  await target.reload();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target
    .frameLocator("#duplicate-frame")
    .locator("#frame-heading")
    .click();
  await size("53");
  const first = target.frameLocator("#same-frame").locator("#frame-heading");
  const second = target
    .frameLocator("#duplicate-frame")
    .locator("#frame-heading");
  await expect(first).toHaveCSS("font-size", "24px");
  await expect(second).toHaveCSS("font-size", "53px");

  await panel.reload();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await expect(first).toHaveCSS("font-size", "24px");
  await expect(second).toHaveCSS("font-size", "53px");
  await expect(
    panel.getByRole("button", { name: "Rule 1 visibility", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await target
    .locator("#duplicate-frame")
    .evaluate((element) => element.remove());
  await panel.reload();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await expect(panel.locator(".session-notice")).toContainText(
    "1 rule was paused",
  );
  await expect(
    panel.getByRole("button", { name: "Rule 1 visibility", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(first).toHaveCSS("font-size", "24px");

  await target.reload();
  await expect(panel.locator(".session-notice")).toContainText(
    "1 rule was paused",
  );
  await expect(
    panel.getByRole("button", { name: "Rule 1 visibility", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(first).toHaveCSS("font-size", "24px");
  await expect(second).toHaveCSS("font-size", "24px");
});

test("an exact iframe pick remains usable after frame reload and repeated panel reconnects", async ({
  fontzie,
}) => {
  const { target, panel, size } = fontzie;
  const heading = target.frameLocator("#same-frame").locator("#frame-heading");
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await heading.click();
  await expect(
    panel.getByRole("button", { name: "Clear target", exact: true }),
  ).toBeVisible();
  await size("47");
  await expect(heading).toHaveCSS("font-size", "47px");

  const frame = target
    .frames()
    .find(
      (candidate) =>
        candidate.url() === "http://127.0.0.1:4318/playground/frame.html",
    )!;
  await frame.goto(frame.url());
  await expect(heading).toHaveCSS("font-size", "24px");
  for (let reconnect = 0; reconnect < 3; reconnect++) {
    await panel.reload();
    await expect(
      panel.getByRole("button", { name: "Pick element", exact: true }),
    ).toBeEnabled();
    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
    await expect(heading).toHaveCSS("font-size", "47px");
  }
});

test("missing and ambiguous picked targets pause safely after reload", async ({
  fontzie,
}) => {
  const { resetCurrentPage, panel, target, size } = fontzie;

  for (const replacement of [
    "",
    '<a id="nav-link">One</a><a id="nav-link">Two</a>',
  ]) {
    await resetCurrentPage();
    await panel
      .getByRole("button", { name: "Pick element", exact: true })
      .click();
    await target.locator("#nav-link").click();
    await size("27");
    await target.route("**/playground/", async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace(
        /<a href="#article" id="nav-link">.*?<\/a>/,
        replacement,
      );
      await route.fulfill({ response, body: html });
    });
    await target.reload();
    const notice = panel.locator(".session-notice").getByRole("alert");
    await expect(notice).toContainText("1 rule was paused");
    await expect(notice).toContainText("pick its target again");
    await expect(
      panel.getByRole("button", { name: "Rule 1 visibility", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await panel.reload();
    await expect(notice).toContainText("1 rule was paused");
    await target.unroute("**/playground/");
    await target.reload();
  }
});

test("mixed targets retain exact picks, append selectors, and support undo and restore", async ({
  fontzie,
}) => {
  const { resetCurrentPage, target, panel, size, expectSelectors } = fontzie;

  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#hero").click();
  await expect(panel.locator(".exact-target")).toContainText("#hero");
  await size("43");
  await panel.getByRole("button", { name: "Paragraphs", exact: true }).click();
  await expectSelectors("p");
  await expect(panel.locator(".exact-target")).toHaveCount(1);
  await expect(panel.locator(".rule-row")).toHaveCount(1);
  await expect(target.locator("#hero")).toHaveCSS("font-size", "43px");
  await expect(target.locator("#intro")).toHaveCSS("font-size", "43px");
  await panel.getByRole("button", { name: "Paragraphs", exact: true }).click();
  await expectSelectors("p");
  await expect(panel.locator(".selector-token")).toHaveCount(1);
  await panel
    .getByRole("button", { name: "Remove picked element #hero", exact: true })
    .press("Enter");
  await expect(panel.locator(".exact-target")).toHaveCount(0);
  await expect(target.locator("#hero")).not.toHaveCSS("font-size", "43px");
  await expect(target.locator("#intro")).toHaveCSS("font-size", "43px");
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(panel.locator(".exact-target")).toHaveCount(1);
  await expect(target.locator("#hero")).toHaveCSS("font-size", "43px");
  await target.reload();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "43px");
  await expect(target.locator("#intro")).toHaveCSS("font-size", "43px");
  await panel.reload();
  await panel.locator(".rule-select").first().click();
  await expect(panel.locator(".exact-target")).toContainText("#hero");
  await expectSelectors("p");
  await panel.locator(".selector-token").first().hover();
  await expect(target.locator("[data-fontzie-highlight]")).toHaveCount(
    await visibleMatchCount(target.locator("p")),
  );
  await panel.locator(".exact-target").hover();
  await expect(target.locator("[data-fontzie-highlight]")).toHaveCount(1);
  await panel.locator(".rule-row").hover();
  await expect(target.locator("[data-fontzie-highlight]")).toHaveCount(
    await visibleMatchCount(target.locator("p, #hero")),
  );
});

test("one target field exposes exact picks and four append shortcuts", async ({
  fontzie,
}) => {
  const {
    resetCurrentPage,
    target,
    panel,
    size,
    chooseTargetMode,
    expectSelectors,
  } = fontzie;

  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  const topTarget = panel.locator('[aria-labelledby="target-heading"]');
  await expect(
    topTarget.getByRole("group", { name: "Targeting", exact: true }),
  ).toHaveCount(0);
  await expect(
    topTarget.getByRole("group", { name: "Targets", exact: true }),
  ).toBeVisible();
  await expect(
    topTarget
      .getByRole("group", { name: "CSS selector shortcuts", exact: true })
      .getByRole("button"),
  ).toHaveCount(4);
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#hero").click();
  await expect(panel.locator(".exact-target")).toContainText("#hero");
  await size("47");
  await chooseTargetMode("tag");
  await expect(panel.locator(".exact-target")).toHaveCount(1);
  await expectSelectors("h1, h2, h3, h4, h5, h6");
  await expect(
    target.locator(
      'div[data-fontzie-ui][aria-hidden="true"]:not([data-fontzie-highlight])',
    ),
  ).toHaveCount(0);
  await expect(target.locator("#hero")).toHaveCSS("font-size", "47px");
  await resetCurrentPage();
});

test("new rules start blank and manual commits update automatically", async ({
  fontzie,
}) => {
  const { resetCurrentPage, inspect, size, panel, target } = fontzie;

  await resetCurrentPage();
  await inspect("#hero");
  await size("49");
  const create = panel.getByRole("button", { name: "New", exact: true });
  await expect(
    panel.getByRole("button", { name: "Inspect", exact: true }),
  ).toHaveCount(0);
  await create.click();
  await expect(panel.locator(".rule-row")).toHaveCount(2);
  await expect(panel.locator(".rule-row").first()).toContainText("Blank rule");
  await expect(panel.locator(".rule-row.editing")).toContainText("Blank rule");
  await expect(panel.locator("#selector")).toHaveValue("");
  await expect(panel.locator("#selector")).toBeFocused();
  await expect(panel.locator('[data-card="typography"]')).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(panel.getByLabel("Size", { exact: true })).toBeHidden();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "49px");
  // Blank rules survive reopening and can be selected without inspecting an empty query.
  await panel.reload();
  await expect(panel.locator(".rule-row")).toHaveCount(2);
  await panel.locator(".rule-select").filter({ hasText: "Blank rule" }).click();
  await expect(panel.locator("#selector")).toHaveValue("");
  await panel.locator("#selector").fill("h1 > > p");
  await panel.locator(".selector-add").press("Enter");
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel.locator(".rule-row.editing")).toContainText("Blank rule");
  await panel.locator("#selector").fill("#intro");
  await panel.locator(".selector-add").press("Tab");
  await expect(panel.locator(".rule-row.editing")).toContainText("#intro");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await size("27");
  await expect(target.locator("#intro")).toHaveCSS("font-size", "27px");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "49px");
  await create.click();
  await expect(panel.locator("#selector")).toHaveValue("");
  await expect(panel.locator(".rule-row")).toHaveCount(3);
  await panel.locator("#selector").fill(".future-target");
  await panel.locator(".selector-add").press("Enter");
  await expect(panel.locator(".rule-row.editing")).toContainText(
    ".future-target",
  );
  await expect(target.locator(".future-target")).toHaveCount(0);
  await size("31");
  await target.evaluate(() => {
    const el = document.createElement("p");
    el.className = "future-target";
    el.textContent = "Added after creating the rule";
    document.body.append(el);
  });
  await expect(target.locator(".future-target")).toHaveCSS("font-size", "31px");
  await panel.reload();
  await expect(panel.locator(".rule-row")).toHaveCount(3);
  await panel
    .locator(".rule-select")
    .filter({ hasText: ".future-target" })
    .click();
  await expect(panel.getByLabel("Size", { exact: true })).toHaveValue("31");
  await resetCurrentPage();
  await expect(create).toBeDisabled();
  await inspect("#intro");
  // Picking fills the new blank row instead of creating another row.
  await create.click();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#hero").click();
  await expect(panel.locator(".rule-row")).toHaveCount(2);
  await expect(panel.locator(".rule-row.editing")).toContainText("#hero");
  await size("33");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "33px");
  await resetCurrentPage();
});

test("the active picker follows scrolling and resizing, and clears on cancellation or selection", async ({
  fontzie,
}) => {
  const { target, panel } = fontzie;

  await target.reload();
  await panel.reload();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  const highlight = target.locator('div[data-fontzie-ui][aria-hidden="true"]');
  const cursor = target.locator("[data-fontzie-cursor]");
  await target.locator("#hero").hover();
  await expect(highlight).toHaveCount(1);
  await expect(cursor).toHaveText("Picking");
  await expect(cursor).toHaveCSS("pointer-events", "none");
  const label = await highlight.locator("span").elementHandle();
  const originalCursor = await cursor.boundingBox();
  await target.locator("#hero").hover({ position: { x: 10, y: 10 } });
  await expect
    .poll(async () => (await cursor.boundingBox())?.x)
    .not.toBe(originalCursor?.x);
  expect(
    await highlight
      .locator("span")
      .evaluate((element, original) => element === original, label),
  ).toBe(true);
  await label?.dispose();
  await target.evaluate(() => window.scrollBy(0, 80));
  await expect
    .poll(async () =>
      target.evaluate(() => {
        const rect = document.querySelector("#hero")!.getBoundingClientRect();
        const overlay = document.querySelector<HTMLDivElement>(
          'div[data-fontzie-ui][aria-hidden="true"]',
        )!;
        return Math.abs(parseFloat(overlay.style.top) - rect.top);
      }),
    )
    .toBeLessThan(1);
  await target.setViewportSize({ width: 800, height: 700 });
  await expect
    .poll(async () =>
      target.evaluate(() => {
        const rect = document.querySelector("#hero")!.getBoundingClientRect();
        const overlay = document.querySelector<HTMLDivElement>(
          'div[data-fontzie-ui][aria-hidden="true"]',
        )!;
        return Math.abs(parseFloat(overlay.style.width) - rect.width);
      }),
    )
    .toBeLessThan(1);
  await panel
    .getByRole("button", { name: "Cancel picking", exact: true })
    .click();
  await expect(highlight).toHaveCount(0);
  await expect(cursor).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#hero").hover();
  await expect(highlight).toHaveCount(1);
  await target.keyboard.press("Escape");
  await expect(highlight).toHaveCount(0);
  await expect(cursor).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#hero").hover();
  await target.locator("#hero").click();
  await expect(highlight).toHaveCount(0);
  await expect(cursor).toHaveCount(0);
  await target.evaluate(() => window.scrollBy(0, 40));
  await expect(highlight).toHaveCount(0);
  await target.setViewportSize({ width: 1100, height: 850 });
});

test("shortcuts append to one rule across headings, paragraphs and links", async ({
  fontzie,
}) => {
  const {
    resetCurrentPage,
    target,
    panel,
    inspect,
    size,
    expectSelectors,
    tabId,
  } = fontzie;

  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  await inspect("#hero");
  await size("44");
  const readRule = () =>
    panel.evaluate(async (id) => {
      const key = `tab:${id}`;
      const state = (await chrome.storage.session.get(key))[key] as TabState;
      return state.config.rules[0]!;
    }, tabId);
  const original = await readRule();
  const presets = panel.getByRole("group", {
    name: "CSS selector shortcuts",
    exact: true,
  });
  let accumulated = "#hero";
  for (const [label, selector] of [
    ["Headings", "h1, h2, h3, h4, h5, h6"],
    ["Paragraphs", "p"],
    ["Links", "a"],
  ] as const) {
    await presets.getByRole("button", { name: label, exact: true }).click();
    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
    accumulated += ", " + selector;
    await expectSelectors(accumulated);
    await expect(panel.locator(".rule-row")).toHaveCount(1);
    await expect(panel.locator("#selector")).toBeVisible();
    for (const el of await target.locator(selector).all())
      await expect(el).toHaveCSS("font-size", "44px");
    const current = await readRule();
    expect(current.id).toBe(original.id);
    expect(current.properties).toEqual(original.properties);
  }
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expectSelectors("#hero, h1, h2, h3, h4, h5, h6, p");
  await target.evaluate(() => {
    const paragraph = document.createElement("p");
    paragraph.id = "preset-dynamic-paragraph";
    paragraph.textContent = "A paragraph added later";
    document.body.append(paragraph);
  });
  await expect(target.locator("#preset-dynamic-paragraph")).toHaveCSS(
    "font-size",
    "44px",
  );
  await panel.reload();
  await panel.locator(".rule-select").first().click();
  await expectSelectors("#hero, h1, h2, h3, h4, h5, h6, p");
  await resetCurrentPage();
});

test("clearing targets updates the selected rule and restores the website's original typography", async ({
  fontzie,
}) => {
  const {
    resetCurrentPage,
    target,
    panel,
    size,
    chooseTargetMode,
    expectSelectors,
  } = fontzie;

  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  const originalSize = await target
    .locator("#hero")
    .evaluate((el) => getComputedStyle(el).fontSize);
  await expect(panel.locator("#selector")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Edit selector", exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#hero").hover();
  await target.locator("#hero").click();
  await expect(panel.locator(".exact-target")).toContainText("#hero");
  await expect(
    panel.getByRole("button", { name: "Picked #hero", exact: true }),
  ).toBeEnabled();
  await size("42");
  await chooseTargetMode("tag");
  await expect(panel.locator(".exact-target")).toHaveCount(1);
  await expectSelectors("h1, h2, h3, h4, h5, h6");
  await expect(panel.locator("#selector")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Whole page", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Clear target", exact: true })
    .click();
  await expect(panel.locator(".selector-token")).toHaveCount(0);
  await expect(panel.locator("#selector")).toHaveValue("");
  await expect(panel.locator(".exact-target")).toHaveCount(0);
  await expect(panel.locator(".rule-row")).toHaveCount(1);
  await expect(panel.locator(".rule-row.editing .rule-select")).toContainText(
    "No targets",
  );
  await expect(target.locator("#hero")).toHaveCSS("font-size", originalSize);
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "42px");
  await panel.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-size", originalSize);
  await panel.reload();
  await expect(panel.locator(".selector-token")).toHaveCount(0);
  await expect(panel.locator("#selector")).toHaveValue("");
  await expect(panel.locator(".rule-row")).toHaveCount(1);
  await resetCurrentPage();
});

test("the selector editor tags, edits and removes selectors without splitting nested commas", async ({
  fontzie,
}) => {
  const {
    resetCurrentPage,
    target,
    panel,
    inspect,
    size,
    openSettings,
    expectSelectors,
  } = fontzie;

  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  await inspect("#hero");
  await size("40");
  await panel.locator(".selector-token input").fill("h1, h2, h3, h4, h5, h6");
  await panel.locator(".selector-add").press("Enter");
  await expect(panel.locator(".selector-editor")).toHaveCount(1);
  await expect(panel.locator("#target-heading")).toHaveText("Targets");
  await expect(panel.locator(".selector-token")).toHaveCount(6);
  await fs.mkdir("tests/screenshots", { recursive: true });
  for (const [theme, width] of [
    ["light", 320],
    ["dark", 420],
  ] as const) {
    await openSettings();
    await fontzie.setTheme(theme);
    await fontzie.closeSettings();
    await panel.setViewportSize({ width, height: 900 });
    await panel.evaluate(() => window.scrollTo(0, 0));
    expect(
      await panel.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await panel.screenshot({
      path: `tests/screenshots/selector-tags-${theme}-${width}.png`,
    });
  }
  await panel
    .getByRole("button", { name: "Remove selector h2", exact: true })
    .click();
  await expectSelectors("h1, h3, h4, h5, h6");
  await expect(panel.locator(".selector-token")).toHaveCount(5);
  await expect(panel.locator(".rule-row")).toHaveCount(1);
  await expect(target.locator("#hero")).toHaveCSS("font-size", "40px");
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(panel.locator(".selector-token")).toHaveCount(6);
  await panel
    .getByRole("button", { name: "Clear target", exact: true })
    .click();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false", {
    timeout: 30000,
  });
  await expect(panel.locator(".selector-token")).toHaveCount(0);
  await panel.locator("#selector").fill(':is(h1, h2), a[data-label="a,b"]');
  await panel.locator("#selector").press("Enter");
  await expect(panel.locator(".selector-token")).toHaveCount(2);
  await expect(panel.locator(".selector-token input").nth(0)).toHaveValue(
    ":is(h1, h2)",
  );
  await expect(panel.locator(".selector-token input").nth(1)).toHaveValue(
    'a[data-label="a,b"]',
  );
  await panel
    .getByRole("textbox", { name: "Selector 2", exact: true })
    .fill("p");
  await panel.locator(".selector-add").press("Enter");
  await expectSelectors(":is(h1, h2), p");
  await panel
    .getByRole("textbox", { name: "Add selector", exact: true })
    .fill("a");
  await panel
    .getByRole("textbox", { name: "Add selector", exact: true })
    .press("Enter");
  await expect(panel.locator(".selector-token")).toHaveCount(3);
  await expectSelectors(":is(h1, h2), p, a");
  await panel
    .getByRole("button", { name: "Clear target", exact: true })
    .click();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false", {
    timeout: 30000,
  });
  await expect(panel.locator(".selector-token")).toHaveCount(0);
  await panel.locator(".selector-add").pressSequentially(".card a");
  await expect(panel.locator(".selector-token")).toHaveCount(0);
  await panel.locator(".selector-add").press(",");
  await expect(panel.locator(".selector-token input")).toHaveValue(".card a");
  await expect(panel.locator(".selector-add")).toBeFocused();
  await expectSelectors(".card a");
  await panel.locator(".selector-add").press(",");
  await panel.locator(".selector-add").press(",");
  await expect(panel.locator(".selector-token")).toHaveCount(1);
  await expect(panel.locator(".selector-add")).toHaveValue("");
  await expect(panel.locator(".selector-add")).toBeFocused();
  await expectSelectors(".card a");
  await panel.locator(".selector-add").pressSequentially(":is(h1, h2)");
  await expect(panel.locator(".selector-token")).toHaveCount(1);
  await panel.locator(".selector-add").press(",");
  await expect(panel.locator(".selector-token")).toHaveCount(2);
  await expect(panel.locator(".selector-token input").nth(1)).toHaveValue(
    ":is(h1, h2)",
  );
  await panel.locator(".selector-add").fill("p, a,");
  await expect(panel.locator(".selector-token")).toHaveCount(4);
  await expect(panel.locator(".selector-add")).toBeFocused();
  await expectSelectors(".card a, :is(h1, h2), p, a");
  await panel.locator(".selector-token input").nth(2).fill("p, button,");
  await expect(panel.locator(".selector-token")).toHaveCount(5);
  await expectSelectors(".card a, :is(h1, h2), p, button, a");
  await resetCurrentPage();
});

test("hover previews highlight each selector and the full rule without changing saved state", async ({
  fontzie,
}) => {
  const { resetCurrentPage, target, panel, inspect, size } = fontzie;

  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  await inspect("#hero, .copy");
  await size("37");
  const before = await panel.evaluate(() => chrome.storage.session.get(null));
  const highlights = target.locator("[data-fontzie-highlight]");
  await panel.locator(".selector-token").first().hover();
  await expect(highlights).toHaveCount(1);
  await expect(highlights.locator("[data-fontzie-highlight-label]")).toHaveText(
    "#hero",
  );
  await target.screenshot({
    path: "tests/screenshots/target-highlight-label.png",
  });
  await target.evaluate(() => window.scrollBy(0, 60));
  await expect
    .poll(() =>
      target.evaluate(() => {
        const box = document.querySelector("#hero")!.getBoundingClientRect();
        return Math.abs(
          parseFloat(
            (document.querySelector("[data-fontzie-highlight]") as HTMLElement)
              .style.top,
          ) - box.top,
        );
      }),
    )
    .toBeLessThan(1);
  await panel.locator(".selector-token").nth(1).hover();
  await expect(highlights).toHaveCount(
    await visibleMatchCount(target.locator(".copy")),
  );
  await panel.locator(".rule-row").first().hover();
  await expect(highlights).toHaveCount(
    await visibleMatchCount(target.locator("#hero, .copy")),
  );
  await panel.locator("#target-heading").hover();
  await expect(highlights).toHaveCount(0);
  expect(await panel.evaluate(() => chrome.storage.session.get(null))).toEqual(
    before,
  );
  // Keyboard focus gets the same preview, and moving outside clears it.
  await panel.locator(".rule-select").first().focus();
  await expect(highlights).toHaveCount(
    await visibleMatchCount(target.locator("#hero, .copy")),
  );
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .focus();
  await expect(highlights).toHaveCount(0);
  // Reloading the editor closes its preview connection, even with the pointer over a rule.
  await panel.locator(".rule-row").first().hover();
  await expect(highlights).not.toHaveCount(0);
  await panel.reload();
  await expect(highlights).toHaveCount(0);
});

test("hover previews preserve exact picks and respect shadow roots and frames", async ({
  fontzie,
}) => {
  const { resetCurrentPage, target, panel, size, inspect } = fontzie;

  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  await target.evaluate(() => {
    for (let i = 0; i < 2; i++) {
      const el = document.createElement("p");
      el.className = "shared-hover-target";
      el.textContent = `Exact pick ${i}`;
      document.querySelector("#hero")!.after(el);
    }
  });
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator(".shared-hover-target").first().click();
  await size("31");
  const highlights = target.locator("[data-fontzie-highlight]");
  await panel.locator(".exact-target").first().hover();
  await expect(highlights).toHaveCount(1);
  await panel.locator(".rule-row").first().hover();
  await expect(highlights).toHaveCount(1);
  await inspect(".shadow-title");
  await panel.locator(".selector-token").first().hover();
  await expect(highlights).toHaveCount(
    await visibleMatchCount(target.locator(".shadow-title")),
  );
  await panel.getByRole("button", { name: "New", exact: true }).click();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.frameLocator("#same-frame").locator("#frame-heading").click();
  await size("32");
  await target.locator("#same-frame").scrollIntoViewIfNeeded();
  await panel.locator(".rule-row.editing").hover();
  await expect(
    target.frameLocator("#same-frame").locator("[data-fontzie-highlight]"),
  ).toHaveCount(1);
  await expect(highlights).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await expect(
    target.frameLocator("#same-frame").locator("[data-fontzie-highlight]"),
  ).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Cancel picking", exact: true })
    .click();
});

test("Backspace removes the last target only from an empty addition field", async ({
  fontzie,
}) => {
  const { resetCurrentPage, target, panel, size, expectSelectors } = fontzie;

  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  const originalSize = await target
    .locator("#hero")
    .evaluate((el) => getComputedStyle(el).fontSize);
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#hero").click();
  await expect(panel.locator(".exact-target")).toHaveCount(1);
  await size("38");
  await panel.locator(".selector-add").fill("p, a");
  await panel.locator(".selector-add").press("Enter");
  await expect(panel.locator(".selector-token")).toHaveCount(2);
  await panel.locator(".selector-add").fill("h2");
  await panel.locator(".selector-add").press("Backspace");
  await expect(panel.locator(".selector-add")).toHaveValue("h");
  await expect(panel.locator(".selector-token")).toHaveCount(2);
  await panel.locator(".selector-add").press("Backspace");
  await panel.locator(".selector-add").press("Backspace");
  await expectSelectors("p");
  await expect(panel.locator(".selector-add")).toBeFocused();
  await panel.locator(".selector-add").press("Backspace");
  await expect(panel.locator(".selector-token")).toHaveCount(0);
  await expect(panel.locator(".exact-target")).toHaveCount(1);
  await panel.locator(".selector-add").press("Backspace");
  await expect(panel.locator(".exact-target")).toHaveCount(0);
  await expect(panel.locator(".rule-row")).toHaveCount(1);
  await expect(panel.locator(".rule-row.editing .rule-select")).toContainText(
    "No targets",
  );
  await expect(target.locator("#hero")).toHaveCSS("font-size", originalSize);
});

test("highlight labels name only the related targets", async ({ fontzie }) => {
  const { resetCurrentPage, target, panel, inspect, size } = fontzie;

  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  await inspect("a, #nav-link");
  await size("25");
  const labels = target.locator("[data-fontzie-highlight-label]");
  await panel.locator(".selector-token").first().hover();
  await expect(labels).toHaveText(
    Array(await visibleMatchCount(target.locator("a"))).fill("a"),
  );
  await panel.locator(".rule-row").first().hover();
  await expect(labels.filter({ hasText: /^a · #nav-link$/ })).toHaveCount(1);
  await expect(labels.filter({ hasText: /^a$/ })).toHaveCount(
    (await visibleMatchCount(target.locator("a"))) - 1,
  );
  await panel
    .getByRole("button", { name: "Clear target", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#hero").click();
  await expect(panel.locator(".exact-target")).toHaveCount(1);
  await panel.locator(".exact-target").hover();
  await expect(labels).toHaveText(["#hero"]);
  await expect(labels.locator("[data-fontzie-exact-icon]")).toHaveCount(1);
  await target.screenshot({
    path: "tests/screenshots/scoped-target-label.png",
  });
});

test("exact pick menus add live tag and class selectors without replacing picks", async ({
  fontzie,
}) => {
  const { resetCurrentPage, target, panel, size, expectSelectors } = fontzie;

  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  await target.evaluate(() => {
    document.querySelector("#hero")!.classList.add("shared:heading");
    const peer = document.createElement("p");
    peer.id = "class-menu-peer";
    peer.className = "shared:heading";
    peer.textContent = "Class targeting peer";
    document.querySelector("#hero")!.after(peer);
  });
  for (const selector of ["#hero", "#class-menu-peer"]) {
    await panel
      .getByRole("button", { name: "Pick element", exact: true })
      .click();
    await target.locator(selector).click();
  }
  await size("43");
  await target.evaluate(() =>
    document.querySelector("#hero")!.classList.add("added-after-pick"),
  );
  await panel
    .getByRole("button", { name: "Picked #hero", exact: true })
    .click();
  await expect(
    panel.getByText("Add targets by tag or class", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("menuitem", { name: ".added-after-pick", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("menuitem", { name: ".hero-title", exact: true }),
  ).toBeVisible();
  const savedBeforePreview = await panel.evaluate(() =>
    chrome.storage.session.get(null),
  );
  const classMatches = target.locator("[data-fontzie-highlight]");
  const sharedClass = panel.getByRole("menuitem", {
    name: ".shared\\:heading",
    exact: true,
  });
  await sharedClass.hover();
  await expect(classMatches).toHaveCount(2);
  await expect(
    classMatches.locator("[data-fontzie-highlight-label]"),
  ).toHaveText([".shared\\:heading", ".shared\\:heading"]);
  await panel
    .getByRole("menuitem", { name: ".hero-title", exact: true })
    .hover();
  await expect(classMatches).toHaveCount(1);
  await panel.getByText("Add targets by tag or class", { exact: true }).hover();
  await expect(classMatches).toHaveCount(0);
  await sharedClass.focus();
  await expect(classMatches).toHaveCount(2);
  expect(await panel.evaluate(() => chrome.storage.session.get(null))).toEqual(
    savedBeforePreview,
  );
  await expect(panel.locator(".exact-target-menu-arrow")).toBeVisible();
  const alignment = await panel.evaluate(() => {
    const label = document.querySelector(".exact-target-menu-label")!;
    const item = document.querySelector(".exact-target-menu .ui-menu-item")!;
    return Math.abs(
      label.getBoundingClientRect().left - item.getBoundingClientRect().left,
    );
  });
  expect(alignment).toBeLessThan(1);
  await panel.screenshot({ path: "tests/screenshots/exact-class-tooltip.png" });
  await panel.keyboard.press("Escape");
  await panel
    .getByRole("button", {
      name: "Picked #class-menu-peer",
      exact: true,
    })
    .click();
  await expect(
    panel.getByRole("menuitem", { name: ".hero-title", exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole("menuitem", { name: ".shared\\:heading", exact: true })
    .click();
  await expect(panel.locator(".exact-target")).toHaveCount(2);
  await expectSelectors(".shared\\:heading");
  await target.evaluate(() => {
    const peer = document.createElement("p");
    peer.id = "class-menu-new-peer";
    peer.className = "shared:heading";
    peer.textContent = "New matching element";
    document.body.append(peer);
  });
  await expect(target.locator("#class-menu-new-peer")).toHaveCSS(
    "font-size",
    "43px",
  );
  await panel.reload();
  await panel.locator(".rule-select").first().click();
  await panel
    .getByRole("button", {
      name: "Picked #class-menu-peer",
      exact: true,
    })
    .click();
  await expect(
    panel.getByRole("menuitem", {
      name: ".shared\\:heading Already added",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("menuitem", { name: "p All paragraphs", exact: true }),
  ).toBeVisible();
  await panel.keyboard.press("Escape");
  await target.evaluate(() => {
    document.querySelector("#class-menu-peer")!.removeAttribute("class");
    const peer = document.createElement("p");
    peer.id = "tag-menu-peer";
    peer.textContent = "Paragraph matched by tag only";
    document.body.append(peer);
  });
  await panel
    .getByRole("button", {
      name: "Picked #class-menu-peer",
      exact: true,
    })
    .click();
  const tagOption = panel.getByRole("menuitem", {
    name: "p All paragraphs",
    exact: true,
  });
  await expect(tagOption).toBeVisible();
  await expect(panel.getByRole("menuitem")).toHaveCount(1);
  await expect(target.locator("#tag-menu-peer")).not.toHaveCSS(
    "font-size",
    "43px",
  );
  await tagOption.hover();
  await expect(
    classMatches.locator("[data-fontzie-highlight-label]"),
  ).toHaveText(Array(await visibleMatchCount(target.locator("p"))).fill("p"));
  await tagOption.click();
  await expect(panel.locator(".exact-target")).toHaveCount(2);
  await expectSelectors(".shared\\:heading, p");
  await expect(target.locator("#tag-menu-peer")).toHaveCSS("font-size", "43px");
  const pickedChip = panel.getByRole("button", {
    name: "Picked #class-menu-peer",
    exact: true,
  });
  await expect(pickedChip.getByText("Picked", { exact: true })).toBeVisible();
  await pickedChip.click();
  await expect(
    panel.getByRole("menuitem", { name: "p Already added", exact: true }),
  ).toBeDisabled();
  await panel.keyboard.press("Escape");
  await resetCurrentPage();
});
test("attribute-only changes update match counts and a removed iframe leaves main-page edits usable", async ({
  fontzie,
}) => {
  const { panel, target, inspect, openTargetOptions, size } = fontzie;
  const heading = target.locator("#hero");
  await heading.evaluate((el) => el.setAttribute("data-release-target", "yes"));
  await inspect("[data-release-target=yes]");
  await openTargetOptions();
  await expect(
    panel.getByText("1 element selected.", { exact: true }),
  ).toBeVisible();
  await heading.evaluate((el) => el.removeAttribute("data-release-target"));
  await expect(
    panel.getByText("0 elements selected.", { exact: true }),
  ).toBeVisible();
  await heading.evaluate((el) => el.setAttribute("data-release-target", "yes"));
  await expect(
    panel.getByText("1 element selected.", { exact: true }),
  ).toBeVisible();
  await target.locator("#same-frame").evaluate((el) => el.remove());
  await size("37");
  await expect(heading).toHaveCSS("font-size", "37px");
});
