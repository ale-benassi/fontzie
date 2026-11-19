import { test, expect } from "./fixtures/extension";
import fs from "node:fs/promises";

test("top rules win and dynamic matching, reorder and deletion work", async ({
  fontzie,
}) => {
  const { inspect, size, target, ruleAction, panel } = fontzie;

  await inspect(".card-title");
  await size("36");
  await target.locator("#add-card").click();
  await expect(target.locator(".dynamic")).toHaveCSS("font-size", "36px");
  await inspect("h2");
  await size("29");
  await expect(target.locator(".dynamic")).toHaveCSS("font-size", "29px");
  await ruleAction(2, "Move");
  await expect(target.locator(".dynamic")).toHaveCSS("font-size", "36px");
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await expect(panel.locator(".rule-select").nth(1)).toContainText("h2");
  await ruleAction(2, "Delete");
  await expect(target.locator(".dynamic")).toHaveCSS("font-size", "36px");
});

test("advanced properties, resets, rule duplication and batch font edits work", async ({
  fontzie,
}) => {
  const { inspect, panel, target, ruleAction, openDisclosure } = fontzie;

  await inspect("#hero");
  await panel
    .getByRole("group", { name: "Font provider" })
    .getByRole("button", { name: "Google", exact: true })
    .click();
  await panel.getByLabel("Search fonts", { exact: true }).fill("Inter");
  await panel
    .locator(".font-choice")
    .filter({ has: panel.getByText("Inter", { exact: true }) })
    .click();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  const opticalSize = panel.getByLabel("Optical size", { exact: true });
  await expect(opticalSize).toBeVisible();
  await opticalSize.fill("24");
  await opticalSize.press("Tab");
  await expect(target.locator("#hero")).toHaveCSS(
    "font-variation-settings",
    /"opsz" 24/,
  );
  await openDisclosure("Advanced typography");
  const italic = panel
    .getByRole("group", { name: "Style", exact: true })
    .getByRole("radio", { name: "Italic", exact: true });
  await expect(italic).not.toBeChecked();
  await italic.click();
  await expect(target.locator("#hero")).toHaveCSS("font-style", "italic");
  await expect(target.locator("#hero")).toHaveCSS(
    "font-variation-settings",
    /"opsz" 24/,
  );
  await panel
    .getByRole("button", { name: "Reset Optical size", exact: true })
    .click();
  await expect(target.locator("#hero")).not.toHaveCSS(
    "font-variation-settings",
    /"opsz"/,
  );
  await expect(target.locator("#hero")).toHaveCSS(
    "font-optical-sizing",
    "auto",
  );
  await expect(italic).toBeChecked();
  await panel.getByRole("button", { name: "Reset Style", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-style", "normal");
  await expect(italic).not.toBeChecked();
  await panel
    .getByRole("group", { name: "Transform", exact: true })
    .getByRole("radio", { name: "Uppercase", exact: true })
    .check();
  await expect(target.locator("#hero")).toHaveCSS(
    "text-transform",
    "uppercase",
  );
  await panel
    .getByRole("button", { name: "Reset Transform", exact: true })
    .click();
  await expect(target.locator("#hero")).toHaveCSS("text-transform", "none");
  const count = await panel.locator(".rule-row").count();
  await ruleAction(count, "Duplicate");
  await expect(panel.locator(".rule-row")).toHaveCount(count + 1);
  await openDisclosure("Rules");
  await panel.getByRole("button", { name: "Rules actions" }).click();
  await panel.getByRole("menuitem", { name: "Select all rules" }).click();
  await expect(panel.getByText(`Editing ${count + 1} rules`)).toBeVisible();
  const browser = panel.locator("#font-browser");
  await browser
    .getByRole("group", { name: "Font provider" })
    .getByRole("button", { name: "All", exact: true })
    .click();
  await browser
    .getByRole("searchbox", { name: "Search fonts" })
    .fill("Georgia");
  await browser
    .locator(".font-choice")
    .filter({ has: panel.getByText("Georgia", { exact: true }) })
    .click();
  await expect(target.locator("#hero")).toHaveCSS("font-family", /Georgia/);
  await expect(panel.getByRole("checkbox", { name: /Georgia/ })).toHaveCount(
    count + 1,
  );
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-family", /Inter/);
});

test("batch typography marks mixed values and edits only checked rules", async ({
  fontzie,
}) => {
  const { inspect, size, panel, target, openDisclosure } = fontzie;
  await inspect("#hero");
  await size("24");
  await inspect("h2");
  await size("36");
  await inspect("p");
  await size("48");
  await openDisclosure("Rules");
  await panel.getByRole("button", { name: "Rules actions" }).click();
  await panel.getByRole("menuitem", { name: "Select all rules" }).click();
  const sizeField = panel.getByRole("spinbutton", {
    name: "Size",
    exact: true,
  });
  await expect(sizeField).toHaveAttribute("placeholder", "Mixed");
  await panel.getByRole("checkbox", { name: /: p ·/ }).click();
  await sizeField.fill("28");
  await sizeField.press("Tab");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "28px");
  await expect(target.locator("h2").first()).toHaveCSS("font-size", "28px");
  await expect(target.locator("p").first()).toHaveCSS("font-size", "48px");
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "24px");
  await expect(target.locator("h2").first()).toHaveCSS("font-size", "36px");
  await expect(sizeField).toHaveAttribute("placeholder", "Mixed");
});

test("rule drag ordering changes priority, supports keyboard moves, Undo and persistence", async ({
  fontzie,
}) => {
  const { resetCurrentPage, inspect, size, target, panel, context } = fontzie;

  await resetCurrentPage();
  await inspect("#hero");
  await size("42");
  await inspect("h1");
  await size("29");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "29px");
  await panel.getByRole("button", { name: "Export", exact: true }).click();
  const formats = panel.getByRole("group", {
    name: "Export format",
    exact: true,
  });
  await formats.getByRole("button", { name: "CSS", exact: true }).click();
  await expect(
    formats.getByRole("button", { name: "CSS", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const reference = await context.newPage();
  await reference.setContent('<h1 id="hero">Export priority</h1>');
  await reference.addStyleTag({
    content: await panel
      .getByRole("dialog")
      .getByRole("textbox", { name: "Export preview" })
      .inputValue(),
  });
  await expect(reference.locator("#hero")).toHaveCSS("font-size", "29px");
  await reference.close();
  await panel
    .getByRole("button", { name: "Close export", exact: true })
    .click();
  const rows = panel.locator(".rule-row");
  const original = await rows.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-rule-id")),
  );
  await rows
    .nth(0)
    .getByRole("button", { name: "Reorder rule 1", exact: true })
    .dragTo(rows.nth(1), {
      targetPosition: {
        x: 40,
        y: (await rows.nth(1).boundingBox())!.height - 5,
      },
    });
  await expect
    .poll(() =>
      rows.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-rule-id")),
      ),
    )
    .toEqual([...original].reverse());
  await expect(target.locator("#hero")).toHaveCSS("font-size", "42px");
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "29px");
  await panel.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "42px");
  const moveSecond = panel.getByRole("button", {
    name: "Reorder rule 2",
    exact: true,
  });
  await expect(moveSecond).toBeEnabled();
  await moveSecond.press("ArrowUp");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "29px");
  const moveFirst = panel.getByRole("button", {
    name: "Reorder rule 1",
    exact: true,
  });
  await expect(moveFirst).toBeEnabled();
  await moveFirst.press("ArrowDown");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "42px");
  await panel.reload();
  await expect
    .poll(() =>
      rows.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-rule-id")),
      ),
    )
    .toEqual([...original].reverse());
  await expect(panel.locator(".rule-selector-tag").first()).toHaveCSS(
    "font-size",
    "11px",
  );
  await expect(panel.locator(".rule-selector-tag button")).toHaveCount(0);
  await expect(panel.locator("#rules-heading")).toHaveText("Rules");
  await expect(panel.locator("#target-heading")).toHaveText("Targets");
  await resetCurrentPage();
});

test("rule options confirm deletion and the left drag strip and top-right visibility toggle stay accessible", async ({
  fontzie,
}) => {
  const {
    resetCurrentPage,
    inspect,
    size,
    panel,
    target,
    openSettings,
    ruleAction,
  } = fontzie;

  await resetCurrentPage();
  await inspect("#hero");
  await size("42");
  await inspect("h1");
  await size("29");
  const rows = panel.locator(".rule-row");
  await expect(rows.first()).toContainText("h1");
  await expect(rows.nth(1)).toContainText("#hero");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "29px");
  await expect(
    panel.getByText("Rules at the top take priority.", { exact: true }),
  ).toBeVisible();
  await expect(panel.locator(".rule-delete")).toHaveCount(0);
  const toggle = panel.getByRole("button", {
    name: "Rule 1 visibility",
    exact: true,
  });
  const visibility = (await toggle.boundingBox())!;
  const row = (await rows.first().boundingBox())!;
  expect(visibility.width).toBe(28);
  expect(
    row.x + row.width - visibility.x - visibility.width,
  ).toBeLessThanOrEqual(13);
  expect(visibility.y - row.y).toBeLessThanOrEqual(13);
  const grip = (await rows
    .first()
    .getByRole("button", { name: "Reorder rule 1", exact: true })
    .boundingBox())!;
  // The grip fills the left edge inside the editing row's 2px outline.
  expect(grip.x - row.x).toBeCloseTo(2);
  expect(grip.y - row.y).toBeCloseTo(2);
  expect(row.y + row.height - grip.y - grip.height).toBeCloseTo(2);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveAttribute("title", "Show rule 1");
  await expect(toggle).toBeEnabled();
  await expect(rows.first().locator(".rule-main")).toHaveCSS("opacity", "0.6");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "42px");
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveAttribute("title", "Hide rule 1");
  await expect(rows.first().locator(".rule-main")).toHaveCSS("opacity", "1");
  const badge = rows.first().locator(".editing-label");
  await expect(badge).toHaveText("Editing");
  await expect(badge).toHaveCSS(
    "background-color",
    await rows.first().evaluate((el) => getComputedStyle(el).outlineColor),
  );
  await expect(target.locator("#hero")).toHaveCSS("font-size", "29px");
  const options = panel.getByRole("button", {
    name: "Actions for rule 1",
    exact: true,
  });
  await options.click();
  await panel
    .getByRole("menuitem", { name: "Delete rule 1", exact: true })
    .click();
  const dialog = panel.getByRole("dialog", { name: "Delete this rule?" });
  await expect(dialog).toContainText("h1");
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(target.locator("#hero")).toHaveCSS("font-size", "29px");
  await options.press("Enter");
  await panel
    .getByRole("menuitem", { name: "Delete rule 1", exact: true })
    .press("Enter");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await fs.mkdir("tests/screenshots", { recursive: true });
  for (const [theme, width] of [
    ["light", 320],
    ["dark", 420],
  ] as const) {
    await openSettings();
    await fontzie.setTheme(theme);
    await fontzie.closeSettings();
    await panel.setViewportSize({ width, height: 900 });
    await panel.locator(".rules-card").screenshot({
      path: `tests/screenshots/rule-actions-${theme}-${width}.png`,
    });
    // Exercise both the editing and nonediting row with ordinary pointer hits.
    for (const index of [0, 1]) {
      const row = rows.nth(index);
      const visibility = row.getByRole("button", {
        name: `Rule ${index + 1} visibility`,
        exact: true,
      });
      const actions = row.getByRole("button", {
        name: `Actions for rule ${index + 1}`,
        exact: true,
      });
      const select = row.locator(".rule-select");
      const selection = (await select.boundingBox())!;
      const menu = (await actions.boundingBox())!;
      expect(selection.x + selection.width).toBeLessThanOrEqual(menu.x);
      await actions.click();
      await expect(panel.getByRole("menu")).toBeVisible();
      await panel.keyboard.press("Escape");
      await visibility.click();
      await expect(visibility).toHaveAttribute("aria-pressed", "false");
      await expect(row.locator(".rule-main")).toHaveCSS("opacity", "0.6");
      // The opacity stacking context must not cover either action button.
      await actions.click();
      await expect(panel.getByRole("menu")).toBeVisible();
      await panel.keyboard.press("Escape");
      await expect(actions).toBeFocused();
      if (index === 1) {
        await panel.locator(".rules-card").screenshot({
          path: `tests/screenshots/rule-states-${theme}-${width}.png`,
        });
      }
      const reorder = row.getByRole("button", {
        name: `Reorder rule ${index + 1}`,
      });
      await expect(reorder).toBeEnabled();
      await reorder.focus();
      await expect(reorder).toBeFocused();
      await panel.keyboard.press("Tab");
      await expect(visibility).toBeFocused();
      await visibility.press("Space");
      await expect(visibility).toHaveAttribute("aria-pressed", "true");
      await expect(visibility).toBeEnabled();
      await visibility.press("Space");
      await expect(visibility).toHaveAttribute("aria-pressed", "false");
      // Applying a rule temporarily disables the controls; resume traversal
      // after that update has finished.
      await expect(visibility).toBeEnabled();
      await visibility.focus();
      await panel.keyboard.press("Tab");
      await expect(select).toBeFocused();
      await panel.keyboard.press("Tab");
      await expect(actions).toBeFocused();
      await panel.keyboard.press("Enter");
      await expect(panel.getByRole("menu")).toBeVisible();
      await panel.keyboard.press("Escape");
      await expect(actions).toBeFocused();
      await visibility.click();
      await expect(visibility).toHaveAttribute("aria-pressed", "true");
      await expect(row.locator(".rule-main")).toHaveCSS("opacity", "1");
    }
    await panel.getByRole("button", { name: "Export", exact: true }).click();
    await panel.getByRole("dialog").screenshot({
      path: `tests/screenshots/export-format-${theme}-${width}.png`,
    });
    await panel
      .getByRole("button", { name: "Close export", exact: true })
      .click();
  }
  await ruleAction(1, "Delete");
  await expect(rows).toHaveCount(1);
  await expect(target.locator("#hero")).toHaveCSS("font-size", "42px");
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(target.locator("#hero")).toHaveCSS("font-size", "29px");
  await resetCurrentPage();
});
