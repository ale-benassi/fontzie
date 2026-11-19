import { test, expect } from "./fixtures/extension";
import type { Config } from "../../core/schema";
import type { TabState } from "../../core/schema";
import { draftKey } from "../../storage/drafts";

test("SPA navigation with the panel closed clears the previous route and restores it on return", async ({
  fontzie,
}) => {
  const { target, panel, inspect, size } = fontzie;
  const original = await target
    .locator("#hero")
    .evaluate((element) => getComputedStyle(element).fontSize);
  await inspect("#hero");
  await size("41");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "41px");
  await panel.close();
  await target.locator("#spa").click();
  await expect(target).toHaveURL(/\?route=next$/);
  await expect(target.locator("#hero")).toHaveCSS("font-size", original);
  await target.goBack();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "41px");
});

test("picked edits restore on reload with the panel closed and stay on their page", async ({
  fontzie,
}) => {
  const { target, reopenPanel, size } = fontzie;
  let { panel } = fontzie;
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await target.locator("#nav-link").click();
  await size("24");

  await expect(target.locator("#nav-link")).toHaveCSS("font-size", "24px");
  await panel.getByRole("switch", { name: "Preview", exact: true }).uncheck();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  const original = await target
    .locator("#nav-link")
    .evaluate((el) => getComputedStyle(el).fontSize);
  const panelUrl = panel.url();
  await panel.close();
  await target.reload();
  await expect(target.locator("#nav-link")).toHaveCSS("font-size", original);
  panel = await reopenPanel(panelUrl);
  await expect(
    panel.getByRole("switch", { name: "Preview", exact: true }),
  ).not.toBeChecked();
  await expect(
    panel.locator(".rule-select").filter({ hasText: "#nav-link" }),
  ).toBeVisible();
  await panel.getByRole("switch", { name: "Preview", exact: true }).check();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await expect(target.locator("#nav-link")).toHaveCSS("font-size", "24px");
  await target.reload();
  await expect(target.locator("#nav-link")).toHaveCSS("font-size", "24px");
  await expect(panel.getByLabel("Size", { exact: true })).toHaveValue("24");
  await panel.reload();
  await expect(panel.getByLabel("Size", { exact: true })).toHaveValue("24");
  await target.goto("http://127.0.0.1:4318/playground/?different-page=1");
  await expect(target.locator("#nav-link")).toHaveCSS("font-size", original);
  await expect(panel.locator("[data-rule-id]")).toHaveCount(0);
  await target.goto("http://127.0.0.1:4318/playground/");
});

test("page persistence restores after reload and JSON rejects malformed imports", async ({
  fontzie,
}) => {
  const {
    inspect,
    size,
    target,
    panel,
    expectPresetControls,
    openSettings,
    openDisclosure,
  } = fontzie;

  await inspect("#hero");
  await size("59");
  await target.reload();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "59px");
  await panel.reload();
  await expectPresetControls();
  await openSettings();
  await openDisclosure("Backup & data");
  await panel
    .getByLabel("Import configuration", { exact: true })
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":2}'),
    });
  await expect(
    panel
      .getByRole("dialog", { name: "Settings", exact: true })
      .getByRole("alert"),
  ).toContainText("invalid");
});

test("removes saved responsive entries from drafts, presets and tab state", async ({
  fontzie,
}) => {
  const { panel, resetCurrentPage, inspect, size, tabId, target } = fontzie;

  await panel.reload();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await resetCurrentPage();
  await inspect("#hero");
  await size("43");
  const beforeSettings = await panel.evaluate(async (id) => {
    const tabKey = `tab:${id}`;
    const state = (await chrome.storage.session.get(tabKey))[
      tabKey
    ] as TabState;
    const legacy = {
      ...state.config,
      rules: state.config.rules.map((rule) => ({
        ...rule,
        breakpoints: Array.from({ length: 25 }, (_, i) => ({
          id: `old-${i}`,
          label: "Mobile",
          min: 0,
          max: 10000,
          properties: { "font-size": "99px" },
        })),
      })),
    };
    const url = new URL(state.url);
    const page = url.origin + url.pathname + url.search;
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      [`draft:page:${page}`]: {
        config: legacy,
        selection: { selector: "#hero" },
      },
      presets: [{ name: "Before removal", config: legacy }],
    });
    await chrome.storage.session.set({
      [tabKey]: { ...state, config: legacy },
    });
    await chrome.storage.local.remove("migration:remove-responsive-rules:v1");
    return settings;
  }, tabId);
  await panel.reload();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  const saved = await panel.evaluate(async () => ({
    local: await chrome.storage.local.get(null),
    session: await chrome.storage.session.get(null),
  }));
  expect(saved.local["migration:remove-responsive-rules:v1"]).toBe(true);
  expect(JSON.stringify(saved)).not.toContain('"breakpoints"');
  expect(saved.local.settings).toEqual(beforeSettings);
  expect(
    (saved.local.presets as Array<{ config: Config }>)[0]!.config.rules[0]!
      .properties["font-size"],
  ).toBe("43px");
  await expect(
    panel.getByRole("button", { name: /^Responsive rules/ }),
  ).toHaveCount(0);
  await expect(panel.getByLabel("Editing width", { exact: true })).toHaveCount(
    0,
  );
  await expect(panel.getByRole("alert")).toHaveCount(0);
  for (const width of [600, 1100]) {
    await target.setViewportSize({ width, height: 850 });
    await expect(target.locator("#hero")).toHaveCSS("font-size", "43px");
  }
  await target.reload();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "43px");
  await panel.reload();
  await expect(panel.locator(".rule-row")).toHaveCount(1);
  await panel.getByRole("button", { name: "Export", exact: true }).click();
  const code = panel
    .getByRole("dialog")
    .getByRole("textbox", { name: "Export preview" });
  await expect(code).toHaveValue(/font-size: 43px/);
  await expect(code).not.toHaveValue(/@media/);
  await panel
    .getByRole("button", { name: "Close export", exact: true })
    .click();
  await panel.screenshot({
    path: "tests/screenshots/typography-without-breakpoints.png",
    fullPage: true,
  });
});

test("removes automatic reuse data while preserving drafts, presets and settings", async ({
  fontzie,
}) => {
  const {
    resetCurrentPage,
    inspect,
    size,
    panel,
    tabId,
    expectPresetControls,
    openSettings,
    target,
    choosePreset,
  } = fontzie;

  await resetCurrentPage();
  await inspect("#hero");
  await size("43");
  // A normal reconnect persists the inspected selection. Establish that
  // baseline before the reload that exercises the migration itself.
  await panel.reload();
  await expect(
    panel.getByRole("button", { name: "Pick element", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      panel.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        draftKey(target.url()),
      ),
    )
    .toMatchObject({
      config: {
        rules: [{ selector: "#hero", properties: { "font-size": "43px" } }],
      },
      selection: { selector: "#hero" },
    });
  const before = await panel.evaluate(async (id) => {
    const saved = await chrome.storage.local.get(null);
    const state = (await chrome.storage.session.get(`tab:${id}`))[
      `tab:${id}`
    ] as TabState;
    const settings = saved.settings ?? {
      theme: "dark",
      favorites: ["google:inter"],
      recents: [],
    };
    const oldConfig = { ...state.config, preview: false };
    const presets = [
      ...((saved.presets ?? []) as Array<{ name: string; config: Config }>),
      { name: "Keep after cleanup", config: state.config },
    ];
    await chrome.storage.local.set({
      "config:page:https://legacy.example/page": oldConfig,
      "config:site:https://legacy.example": oldConfig,
      settings: {
        ...(settings as Record<string, unknown>),
        persistence: true,
      },
      presets,
    });
    await chrome.storage.session.set({
      "config:page:https://legacy.example/page": oldConfig,
      "config:site:https://legacy.example": oldConfig,
      "floating:999999": `config:page:${state.url.split("#")[0]}`,
    });
    await chrome.storage.local.remove("migration:remove-automatic-reuse:v1");
    return {
      settings,
      presets,
      drafts: Object.fromEntries(
        Object.entries(saved).filter(([key]) => key.startsWith("draft:")),
      ),
      url: state.url,
    };
  }, tabId);
  await panel.reload();
  await expect
    .poll(() =>
      panel.evaluate(
        async () =>
          (
            await chrome.storage.local.get(
              "migration:remove-automatic-reuse:v1",
            )
          )["migration:remove-automatic-reuse:v1"],
      ),
    )
    .toBe(true);
  const after = await panel.evaluate(async () => ({
    local: await chrome.storage.local.get(null),
    session: await chrome.storage.session.get(null),
  }));
  for (const area of [after.local, after.session])
    expect(
      Object.keys(area).filter((key) => /^config:(page|site):/.test(key)),
    ).toEqual([]);
  expect(after.local.settings).toEqual(before.settings);
  expect(after.local.settings).not.toHaveProperty("persistence");
  expect(after.local.presets).toEqual(before.presets);
  for (const [key, value] of Object.entries(before.drafts))
    expect(after.local[key]).toEqual(value);
  expect(after.session["floating:999999"]).toBe(
    `draft:page:${before.url.split("#")[0]}`,
  );
  await expectPresetControls();
  await expect(
    panel.getByRole("button", { name: "Automatic reuse", exact: true }),
  ).toHaveCount(0);
  await openSettings();
  await expect(
    panel.getByRole("checkbox", {
      name: "Restore saved configurations automatically",
    }),
  ).toHaveCount(0);
  await target.reload();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "43px");
  await panel.reload();
  await expectPresetControls();
  await choosePreset("Keep after cleanup");
  await expectPresetControls();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await expect(panel.locator(".notification-title")).toContainText(
    "Preset applied",
  );
  await expect(target.locator("#hero")).toHaveCSS("font-size", "43px");
});
