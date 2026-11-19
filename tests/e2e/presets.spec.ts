import { test, expect } from "./fixtures/extension";
import path from "node:path";
import os from "node:os";
import AxeBuilder from "@axe-core/playwright";
import type { Config } from "../../core/schema";
import { emptyConfig, newRule } from "../../core/schema";

test("restores an old Satoshi preset using the page font and its saved typography", async ({
  fontzie,
}) => {
  const { panel, target, choosePreset } = fontzie;
  const heading = target.locator("#hero");
  const originalFamily = await heading.evaluate(
    (el) => getComputedStyle(el).fontFamily,
  );
  const rule = newRule("#hero");
  rule.font = {
    id: "fontshare:satoshi",
    family: "Satoshi",
    provider: "fontshare",
  };
  rule.properties = {
    "font-family": '"Satoshi", sans-serif',
    "font-variation-settings": '"wght" 537',
    "font-synthesis": "none",
    "font-size": "37px",
    "font-weight": "537",
    "letter-spacing": "2px",
  };
  const config = { ...emptyConfig(), rules: [rule] };
  await panel.evaluate(
    (config) =>
      chrome.storage.local.set({
        presets: [{ name: "Legacy Satoshi", config }],
      }),
    config,
  );
  await choosePreset("Legacy Satoshi");
  await expect(panel.locator(".session-notice")).toContainText(
    "The Fontshare font “Satoshi” is unavailable.",
  );
  await expect(heading).toHaveCSS("font-family", originalFamily);
  await expect(heading).toHaveCSS("font-size", "37px");
  await expect(heading).toHaveCSS("font-weight", "537");
  await expect(heading).toHaveCSS("letter-spacing", "2px");
  await panel.getByRole("button", { name: "Export", exact: true }).click();
  const preview = panel.getByRole("dialog").getByRole("textbox");
  for (const format of ["CSS", "Tailwind CSS v4", "AI prompt"]) {
    await panel
      .getByRole("dialog")
      .getByRole("button", { name: format, exact: true })
      .click();
    await expect(preview).toHaveValue(/37px/);
    await expect(preview).not.toHaveValue(/satoshi|fontshare\.com/i);
  }
  expect(
    await panel.evaluate(
      async () => (await chrome.storage.local.get("presets")).presets,
    ),
  ).toEqual([{ name: "Legacy Satoshi", config }]);
});

test("preset overwrites ignore case and require confirmation", async ({
  fontzie,
}) => {
  const {
    resetCurrentPage,
    panel,
    target,
    size,
    expectPresetControls,
    openPresetSave,
    choosePreset,
  } = fontzie;

  await resetCurrentPage();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#hero").click();
  await size("31");
  await expectPresetControls();
  const name = panel.getByLabel("Preset name", { exact: true });
  const save = panel.getByRole("button", { name: "Save", exact: true });
  const readMatches = () =>
    panel.evaluate(async () => {
      const { presets } = await chrome.storage.local.get("presets");
      return (presets as Array<{ name: string; config: Config }>).filter(
        (p) => p.name.toLowerCase() === "overwrite example",
      );
    });
  await openPresetSave();
  await name.fill("Overwrite example");
  await save.click();
  await expect(panel.locator(".notification-title")).toContainText(
    "Preset saved",
  );
  const original = await readMatches();
  expect(original).toHaveLength(1);
  await choosePreset("Overwrite example");
  await size("42");
  await panel.getByRole("button", { name: "Save preset", exact: true }).click();
  const dialog = panel.getByRole("dialog", { name: "Overwrite this preset?" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await readMatches()).toEqual(original);
  await openPresetSave();
  await name.fill("  OVERWRITE EXAMPLE  ");
  await save.click();
  await expect(dialog).toContainText("Overwrite example");
  await panel.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(await readMatches()).toEqual(original);
  await save.click();
  await dialog
    .getByRole("button", { name: "Overwrite preset", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(panel.locator(".notification-title")).toContainText(
    "Preset saved",
  );
  const updated = await readMatches();
  expect(updated).toHaveLength(1);
  expect(updated[0]!.name).toBe("OVERWRITE EXAMPLE");
  expect(updated[0]!.config.rules[0]!.properties["font-size"]).toBe("42px");
  await expect(panel.getByLabel("Presets", { exact: true })).toContainText(
    "OVERWRITE EXAMPLE",
  );
  await panel.reload();
  expect(await readMatches()).toEqual(updated);
});

test("favorites and named presets persist", async ({ fontzie }) => {
  const { panel, expectPresetControls, openPresetSave } = fontzie;
  await fontzie.inspect("#hero");
  await fontzie.size("24");

  await panel.getByLabel("Search fonts", { exact: true }).fill("Inter");
  await panel
    .getByRole("group", { name: "Font provider" })
    .getByRole("button", { name: "Google", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Favorite Inter", exact: true })
    .click();
  await expectPresetControls();
  await openPresetSave();
  await panel
    .getByLabel("Preset name", { exact: true })
    .fill("Test typography");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.locator(".notification-title")).toContainText(
    "Preset saved",
  );
  await panel.reload();
  await expectPresetControls();
  await panel.getByRole("button", { name: "Presets", exact: true }).click();
  await expect(
    panel.getByRole("menuitem", { name: "Apply Test typography", exact: true }),
  ).toBeVisible();
  await panel.keyboard.press("Escape");
  const settings = await panel.evaluate(async () => {
    return (await chrome.storage.local.get("settings")).settings as {
      favorites: string[];
    };
  });
  expect(settings.favorites).toContain("google:inter");
});

test("export dialog confirms when CSS is copied", async ({ fontzie }) => {
  const { panel, inspect, size } = fontzie;

  await panel.reload();
  await inspect("#hero");
  await size("42");
  await panel.getByRole("button", { name: "Export", exact: true }).click();
  await panel
    .getByRole("dialog")
    .getByRole("button", { name: "Copy code", exact: true })
    .click();
  await expect(
    panel
      .getByRole("dialog")
      .getByRole("button", { name: "Copy code", exact: true }),
  ).toHaveText("Copied");
  await panel
    .getByRole("button", { name: "Close export", exact: true })
    .click();
});

test("broad resets confirm their scope, cancel safely and clear only intended data", async ({
  fontzie,
}) => {
  const { panel, inspect, size, target, openSettings, openDisclosure } =
    fontzie;

  await fontzie.openSettings();
  await fontzie.setTheme("light");
  await panel.reload();
  await inspect("#hero");
  await size("47");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "47px");
  await panel.evaluate(async () =>
    chrome.storage.local.set({
      "draft:page:http://127.0.0.1:4318/another-page": {
        sentinel: "site-page",
      },
      "draft:page:https://unrelated.example/": { sentinel: "other-site" },
    }),
  );
  await panel.getByRole("button", { name: "Clear edits", exact: true }).click();
  await panel
    .getByRole("menuitem", { name: "Clear site edits…", exact: true })
    .click();
  const dialog = panel.getByRole("dialog", {
    name: /Clear site edits\?|Clear all Fontzie data\?/,
  });
  await expect(dialog).toContainText("every page");
  await expect(dialog).toContainText("This can’t be undone.");
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "47px");
  expect(
    await panel.evaluate(
      async () =>
        (
          await chrome.storage.local.get(
            "draft:page:http://127.0.0.1:4318/another-page",
          )
        )["draft:page:http://127.0.0.1:4318/another-page"],
    ),
  ).toBeTruthy();
  await panel.getByRole("button", { name: "Clear edits", exact: true }).click();
  await panel
    .getByRole("menuitem", { name: "Clear site edits…", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Clear site edits", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.locator("[data-rule-id]")).toHaveCount(0);
  const stored = await panel.evaluate(() => chrome.storage.local.get(null));
  expect(
    stored["draft:page:http://127.0.0.1:4318/another-page"],
  ).toBeUndefined();
  expect(stored["draft:page:https://unrelated.example/"]).toBeTruthy();
  expect(stored.settings).toBeTruthy();
  await openSettings();
  await openDisclosure("Backup & data");
  await panel
    .getByRole("button", { name: "Clear all Fontzie data", exact: true })
    .click();
  await expect(dialog).toContainText("uploaded font files");
  await panel.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(
    await panel.evaluate(
      async () => (await chrome.storage.local.get(null)).settings,
    ),
  ).toBeTruthy();
  await panel
    .getByRole("button", { name: "Clear all Fontzie data", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Clear all Fontzie data", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await fontzie.closeSettings();
  await expect(panel.locator(".notification-title")).toHaveText(
    "Fontzie data cleared.",
  );
  await expect(panel.locator(".custom-face")).toHaveCount(0);
  expect(
    await panel.evaluate(
      async () =>
        (await chrome.storage.local.get(null))[
          "draft:page:https://unrelated.example/"
        ],
    ),
  ).toBeUndefined();
});

test("presets save and load exact and mixed targets with all rule settings", async ({
  fontzie,
}) => {
  const {
    resetCurrentPage,
    target,
    panel,
    size,
    expectPresetControls,
    openPresetSave,
    choosePreset,
  } = fontzie;

  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#hero").click();
  await size("41");
  await panel.getByRole("button", { name: "New", exact: true }).click();
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#intro").click();
  await panel.getByRole("button", { name: "Links", exact: true }).click();
  await size("23");
  await panel
    .getByRole("button", { name: "Rule 1 visibility", exact: true })
    .click();
  await expectPresetControls();
  await openPresetSave();
  await panel.getByLabel("Preset name", { exact: true }).fill("All targets");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.locator(".notification-title")).toContainText(
    "Preset saved",
  );
  const saved = await panel.evaluate(
    async () =>
      (
        (await chrome.storage.local.get("presets")).presets as Array<{
          name: string;
          config: Config;
        }>
      ).find((p) => p.name === "All targets")!.config,
  );
  expect(saved.rules).toHaveLength(2);
  expect(saved.rules[0]!.targets!.map((t) => t.kind)).toEqual([
    "exact",
    "selector",
  ]);
  expect(saved.rules[1]!.targets![0]!.kind).toBe("exact");
  expect(JSON.stringify(saved)).not.toContain('"handle"');
  await resetCurrentPage();
  await target.reload();
  await panel.reload();
  await expectPresetControls();
  await choosePreset("All targets");
  await expectPresetControls();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await expect(panel.locator(".rule-row")).toHaveCount(2);
  await expect(target.locator("#hero")).toHaveCSS("font-size", "41px");
  await expect(
    panel.getByRole("button", { name: "Rule 1 visibility", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await panel
    .getByRole("button", { name: "Rule 1 visibility", exact: true })
    .click();
  await expect(target.locator("#intro")).toHaveCSS("font-size", "23px");
  await expect(target.locator("#nav-link")).toHaveCSS("font-size", "23px");
  await target.evaluate(() => {
    const copy = document.querySelector("#hero")!.cloneNode(true);
    document.body.append(copy);
  });
  await expectPresetControls();
  await choosePreset("All targets");
  await expect(panel.locator(".session-notice")).toContainText(
    "1 rule was paused because its saved target couldn’t be identified.",
  );
  await expect(
    panel.getByRole("button", { name: "Rule 2 visibility", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(panel.locator(".rule-row")).toHaveCount(2);
  await resetCurrentPage();
  await target.reload();
});

test("footer presets remain reachable and support keyboard saving", async ({
  fontzie,
}) => {
  const {
    panel,
    resetCurrentPage,
    inspect,
    size,
    openPresetSave,
    choosePreset,
    target,
  } = fontzie;

  await panel.evaluate(async () => {
    const { settings = {} } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      presets: [],
      settings: { ...(settings as object), theme: "system" },
    });
  });
  await panel.reload();
  await resetCurrentPage();
  await inspect("#hero");
  await size("35");
  const trigger = panel.getByRole("button", {
    name: "Save preset",
    exact: true,
  });
  const load = panel.getByRole("button", { name: "Load preset", exact: true });
  const select = panel.getByLabel("Presets", { exact: true });
  const dialog = panel.getByRole("dialog", {
    name: "Save preset",
    exact: true,
  });
  await panel.evaluate(() => window.scrollTo(0, 0));
  await expect(trigger).toBeInViewport();
  await expect(select).toBeEnabled();
  await select.click();
  await expect(
    panel.getByText("No presets yet", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("menuitem", { name: "Save as new…", exact: true }),
  ).toBeVisible();
  await panel.keyboard.press("Escape");
  await expect(load).toHaveCount(0);
  await trigger.focus();
  await panel.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(panel.getByLabel("Preset name", { exact: true })).toBeFocused();
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await panel.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await openPresetSave();
  await panel
    .getByLabel("Preset name", { exact: true })
    .fill("Editorial headings");
  await panel.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(panel.locator(".notification-title")).toContainText(
    "Preset saved",
  );
  await expect(select).toContainText("Editorial headings");
  await expect(trigger).toBeFocused();
  await size("48");
  await expect(select).toContainText("Modified");
  await choosePreset("Editorial headings");
  await expect(select).toContainText("Editorial headings");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "35px");
  await expect(panel.locator(".notification-title")).toHaveText(
    "Preset applied",
  );
  await panel
    .locator(".notification-toast")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "48px");
  await expect(select).toContainText("Modified");
  await choosePreset("Editorial headings");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "35px");
});

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 390, 420]) {
    test(`footer presets fit ${width}px in ${theme} theme`, async ({
      fontzie,
    }) => {
      const { panel, tabId, inspect, size, openPresetSave, choosePreset } =
        fontzie;
      await inspect("#hero");
      await size("35");
      const trigger = panel.getByRole("button", {
        name: "Save preset",
        exact: true,
      });
      const select = panel.getByLabel("Presets", { exact: true });
      const longName =
        "Editorial typography with a deliberately long descriptive preset name for headings".slice(
          0,
          80,
        );
      await panel.evaluate(
        async ({ longName, tabId }) => {
          const state = (await chrome.storage.session.get(`tab:${tabId}`))[
            `tab:${tabId}`
          ] as { config: Config };
          const { settings = {} } = await chrome.storage.local.get("settings");
          await chrome.storage.local.set({
            settings: { ...(settings as object), theme: "system" },
            presets: Array.from({ length: 100 }, (_, i) => ({
              name: i === 0 ? longName : `Saved typography ${i}`,
              config: state.config,
            })),
          });
        },
        { longName, tabId },
      );
      await panel.emulateMedia({ colorScheme: theme });
      await panel.setViewportSize({ width, height: 720 });
      await panel.evaluate(() => window.scrollTo(0, 0));
      await choosePreset(longName);
      await expect(trigger).toBeInViewport();
      await expect(select).toBeInViewport();
      const bounds = await panel.locator("footer").evaluate((el) => ({
        overflow: el.scrollWidth > el.clientWidth,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
      }));
      expect(bounds).toEqual({ overflow: false, pageOverflow: false });
      expect(
        (
          await new AxeBuilder({ page: panel })
            .include("footer")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await panel.screenshot({
        path: path.join(os.tmpdir(), `fontzie-footer-${theme}-${width}.png`),
      });
      await select.click();
      await expect(panel.locator(".preset-menu")).toBeInViewport();
      const menuBounds = await panel.locator(".preset-menu").boundingBox();
      const pickerBounds = await select.boundingBox();
      expect(menuBounds!.width).toBeCloseTo(pickerBounds!.width, 0);
      await expect(
        panel.getByRole("menuitem", { name: "Save as new…", exact: true }),
      ).toBeInViewport();
      expect(
        (
          await new AxeBuilder({ page: panel })
            .include(".preset-menu")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await panel.screenshot({
        path: path.join(
          os.tmpdir(),
          `fontzie-preset-menu-${theme}-${width}.png`,
        ),
      });
      await panel.keyboard.press("Escape");
      await openPresetSave();
      await panel.getByLabel("Preset name", { exact: true }).fill(longName);
      expect(
        (
          await new AxeBuilder({ page: panel })
            .include(".preset-save-dialog")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await panel.screenshot({
        path: path.join(
          os.tmpdir(),
          `fontzie-save-dialog-${theme}-${width}.png`,
        ),
      });
      await panel.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    });
  }
}

test("original fonts restore after reload clears session style ownership", async ({
  fontzie,
}) => {
  const { resetCurrentPage, target, panel, size, worker } = fontzie;

  await resetCurrentPage();
  const originalFamily = await target
    .locator("#hero")
    .evaluate((el) => getComputedStyle(el).fontFamily);
  await panel.locator("#selector").fill("h1");
  await panel.locator(".selector-add").press("Enter");
  await panel.getByLabel("Search fonts", { exact: true }).fill("system-ui");
  await panel.locator(".font-choice").filter({ hasText: "system-ui" }).click();
  await size("35");
  await expect(target.locator("#hero")).toHaveCSS("font-family", "system-ui");
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  for (let i = 0; i < 2; i++) {
    // Extension reload clears session storage while USER styles remain in the document.
    // Reproduce that loss of ownership without depending on Chrome's extension-management UI.
    await worker.evaluate(() => chrome.storage.session.clear());
    await panel.reload();
    await size(String(36 + i));
    const original = panel.getByRole("button", {
      name: "Show original",
      exact: true,
    });
    await expect(original).toBeEnabled();
    await original.click();
    await expect(
      panel.getByRole("button", { name: "Back to edited", exact: true }),
    ).toBeVisible();
    await expect(target.locator("#hero")).toHaveCSS(
      "font-family",
      originalFamily,
    );
    await expect(target.locator("#hero")).toHaveCSS("font-size", "64px");
    await panel
      .getByRole("button", { name: "Back to edited", exact: true })
      .click();
    await expect(target.locator("#hero")).toHaveCSS("font-family", "system-ui");
    await expect(target.locator("#hero")).toHaveCSS("font-size", `${36 + i}px`);
  }
  await resetCurrentPage();
  await expect(target.locator("#hero")).toHaveCSS(
    "font-family",
    originalFamily,
  );
});

test("preset toast pauses for keyboard use, undoes safely and leaves footer stationary", async ({
  fontzie,
}) => {
  const {
    resetCurrentPage,
    inspect,
    size,
    openPresetSave,
    panel,
    choosePreset,
    target,
  } = fontzie;

  await resetCurrentPage();
  await inspect("#hero");
  await size("33");
  await openPresetSave();
  await panel.getByLabel("Preset name", { exact: true }).fill("Toast check");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  const toast = panel.locator(".notification-toast");
  await expect(toast).toContainText("Preset saved");
  await size("47");
  const settleLayout = () =>
    panel.locator("main").evaluate(async (el) => {
      await Promise.allSettled(
        el
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished),
      );
    });
  await settleLayout();
  const footerBefore = (await panel.locator("footer").boundingBox())!;
  const expectFooterUnmoved = async () => {
    await settleLayout();
    const current = (await panel.locator("footer").boundingBox())!;
    // Reject visible shifts while allowing fractional CSS-pixel rounding.
    for (const key of ["x", "y", "width", "height"] as const)
      expect(current[key]).toBeCloseTo(footerBefore[key], 0);
  };
  const select = panel.getByLabel("Presets", { exact: true });
  await choosePreset("Toast check");
  await expect(toast).toContainText("Preset applied");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "33px");
  await expectFooterUnmoved();
  await panel.keyboard.press("F8");
  await panel.keyboard.press("Tab");
  await expect(toast).toBeFocused();
  await panel.keyboard.press("Tab");
  const undoToast = toast.getByRole("button", { name: "Undo", exact: true });
  await expect(undoToast).toBeFocused();
  const progress = toast.locator(".notification-progress");
  const pausedProgress = Number(await progress.getAttribute("aria-valuenow"));
  await panel.waitForTimeout(7200);
  await expect(toast).toBeVisible();
  expect(Number(await progress.getAttribute("aria-valuenow"))).toBeCloseTo(
    pausedProgress,
    0,
  );
  await panel.keyboard.press("Enter");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "47px");
  await expect(select).toBeFocused();
  await expect(toast).toContainText("Preset undone");
  await toast.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(toast).toBeHidden();
  await expectFooterUnmoved();
  await choosePreset("Toast check");
  await expect(undoToast).toBeVisible();
  await size("51");
  await expect(undoToast).toHaveCount(0);
  await panel.mouse.move(0, 0);
  const startProgress = Number(await progress.getAttribute("aria-valuenow"));
  await panel.waitForTimeout(3000);
  const laterProgress = Number(await progress.getAttribute("aria-valuenow"));
  expect(startProgress - laterProgress).toBeGreaterThan(35);
  expect(startProgress - laterProgress).toBeLessThan(50);
  await expect(toast).toBeHidden({ timeout: 4500 });
  await expect(target.locator("#hero")).toHaveCSS("font-size", "51px");
});

test("presets update, save as new, rename and delete without applying management actions", async ({
  fontzie,
}) => {
  const {
    resetCurrentPage,
    inspect,
    size,
    openPresetSave,
    panel,
    presetAction,
    target,
    choosePreset,
  } = fontzie;

  await resetCurrentPage();
  await inspect("#hero");
  await size("34");
  await openPresetSave();
  await panel
    .getByLabel("Preset name", { exact: true })
    .fill("Manage original");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  const picker = panel.getByRole("button", {
    name: "Presets",
    exact: true,
  });
  await expect(picker).toHaveText("Manage original");
  await size("46");
  await expect(picker).toContainText("Modified");
  await panel.getByRole("button", { name: "Save preset", exact: true }).click();
  await expect(
    panel.getByRole("dialog", { name: "Save preset", exact: true }),
  ).toBeHidden();
  await panel
    .getByRole("button", { name: "Overwrite preset", exact: true })
    .click();
  await expect(picker).toHaveText("Manage original");
  await openPresetSave();
  await expect(panel.getByLabel("Preset name", { exact: true })).toHaveValue(
    "",
  );
  await panel.getByLabel("Preset name", { exact: true }).fill("Manage copy");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await size("53");
  await presetAction("Manage original", "Rename…");
  const naming = panel.getByRole("dialog", {
    name: "Rename preset",
    exact: true,
  });
  await expect(panel.getByLabel("Preset name", { exact: true })).toBeFocused();
  await panel.getByLabel("Preset name", { exact: true }).fill("MANAGE COPY");
  await naming.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(naming.getByRole("alert")).toContainText("already exists");
  await panel
    .getByLabel("Preset name", { exact: true })
    .fill("Renamed original");
  await naming.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(naming).toBeHidden();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "53px");
  await expect(picker).toContainText("Manage copy");
  await presetAction("Manage copy", "Rename…");
  await panel.getByLabel("Preset name", { exact: true }).fill("Renamed copy");
  await naming.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(picker).toContainText("Renamed copy");
  await expect(picker).toContainText("Modified");
  await presetAction("Renamed copy", "Delete…");
  const deletion = panel.getByRole("dialog", { name: "Delete this preset?" });
  await expect(
    deletion.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await deletion.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toContainText("Renamed copy");
  await presetAction("Renamed copy", "Delete…");
  await deletion
    .getByRole("button", { name: "Delete preset", exact: true })
    .click();
  await expect(picker).toHaveText("Presets");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "53px");
  await panel.reload();
  await choosePreset("Renamed original");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "46px");
  await panel.getByRole("button", { name: "Presets", exact: true }).click();
  await expect(
    panel.getByRole("menuitem", { name: "Apply Renamed copy", exact: true }),
  ).toHaveCount(0);
  await panel.keyboard.press("Escape");
});

test("preset search filters names and supports keyboard application", async ({
  fontzie,
}) => {
  const { panel, resetCurrentPage, inspect, size, openPresetSave, target } =
    fontzie;

  await panel.evaluate(() => chrome.storage.local.set({ presets: [] }));
  await panel.reload();
  await resetCurrentPage();
  await inspect("#hero");
  for (const [name, value] of [
    ["Editorial headings", "33"],
    ["Body reading", "44"],
  ]) {
    await size(value!);
    await openPresetSave();
    await panel.getByLabel("Preset name", { exact: true }).fill(name!);
    await panel.getByRole("button", { name: "Save", exact: true }).click();
  }
  const picker = panel.getByRole("button", { name: "Presets", exact: true });
  const search = panel.getByRole("searchbox", { name: "Search presets" });
  const rows = panel.locator(".preset-menu-row");
  await picker.click();
  await expect(search).toBeFocused();
  await search.fill("  EDITORIAL  ");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Editorial headings");
  await search.fill("nothing matches");
  await expect(rows).toHaveCount(0);
  await expect(
    panel.getByText("No matching presets", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("menuitem", { name: "Save as new…", exact: true }),
  ).toBeVisible();
  await search.fill("");
  await search.press("Escape");
  await expect(picker).toBeFocused();
  await picker.click();
  await search.fill("reading");
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(rows).toHaveCount(2);
  await search.fill("EDITORIAL");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(panel.locator(".preset-menu")).toBeHidden();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "33px");
  await picker.click();
  await expect(search).toHaveValue("");
  await expect(rows).toHaveCount(2);
  await search.press("Escape");
});
