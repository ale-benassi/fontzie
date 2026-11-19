import { test, expect } from "./fixtures/extension";

test("rule switcher moves focus before hiding the editor from screen readers", async ({
  fontzie,
}) => {
  const { panel, inspect } = fontzie;
  await inspect("#hero");
  await panel.setViewportSize({ width: 390, height: 600 });
  await panel.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const trigger = panel.getByRole("button", {
    name: "Switch rule",
    exact: true,
  });
  await expect(trigger).toBeVisible();
  await expect(panel.locator(".editing-bar")).toHaveAttribute(
    "data-visible",
    "true",
  );
  const session = await panel.context().newCDPSession(panel);
  const warnings: string[] = [];
  session.on("Log.entryAdded", ({ entry }) => {
    if (entry.text.includes("Blocked aria-hidden")) warnings.push(entry.text);
  });
  await session.send("Log.enable");
  try {
    for (const keyboard of [true, false]) {
      if (keyboard) {
        await trigger.focus();
        await trigger.press("Enter");
      } else await trigger.click();
      const menu = panel.locator(".editing-menu");
      await expect(menu).toBeVisible();
      await expect
        .poll(() => menu.evaluate((el) => el.contains(document.activeElement)))
        .toBe(true);
      await panel.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    }
    expect(warnings).toEqual([]);
  } finally {
    await session.detach();
  }
});
