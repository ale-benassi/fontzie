import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import fs from "node:fs/promises";
import type { Config } from "../../core/schema";
import path from "node:path";
import os from "node:os";
import { stageExtension } from "./fixtures/build";

// A real browser shutdown clears storage.session. Reusing its on-disk profile
// verifies that drafts are independent of both worker lifetime and old tab IDs.
test.describe.serial("browser restart recovery", () => {
  let extension: string;
  let profile: string;
  let context: BrowserContext | undefined;
  let target!: Page;
  let panel!: Page;
  let api!: Page;
  let extensionId: string;
  let tabId: number;
  let original: string;
  let before: Config;
  const url = "http://127.0.0.1:4318/playground/?restart=1";
  test.beforeAll(async () => {
    extension = await fs.mkdtemp(
      path.join(os.tmpdir(), "fontzie-restart-extension-"),
    );
    profile = await fs.mkdtemp(
      path.join(os.tmpdir(), "fontzie-restart-profile-"),
    );
    await stageExtension(extension);
  });
  test.afterEach(async () => {
    await context?.close();
    context = undefined;
  });
  test.afterAll(async () => {
    await fs.rm(profile, { recursive: true, force: true });
    await fs.rm(extension, { recursive: true, force: true });
  });
  const launch = async () => {
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
      viewport: { width: 1100, height: 900 },
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    extensionId = new URL(worker.url()).host;
    api = await context.newPage();
    await api.goto(`chrome-extension://${extensionId}/fixture-api.html`);
    // There is no previous tab to look up after a restart.
    expect(
      await api.evaluate(async () =>
        Object.keys(await chrome.storage.session.get(null)),
      ),
    ).toEqual([]);
  };
  const openTarget = async () => {
    target = await context!.newPage();
    await target.goto(url);
    await target.bringToFront();
    tabId = await api.evaluate(
      async (url) => (await chrome.tabs.query({ url }))[0]!.id!,
      url,
    );
  };
  const openPanel = async () => {
    panel = await context!.newPage();
    await panel.goto(
      `chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`,
    );
    await expect(
      panel.getByRole("button", { name: "Pick element", exact: true }),
    ).toBeEnabled();
    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  };
  const editNumber = async (label: string, value: string) => {
    await panel.getByLabel(label, { exact: true }).fill(value);
    await panel.getByLabel(label, { exact: true }).press("Tab");
    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  };
  const savedConfig = () =>
    api.evaluate(async (url) => {
      const key = `draft:page:${url}`;
      const value = (await chrome.storage.local.get(key))[key] as
        { config: Config } | undefined;
      return value!.config;
    }, url);
  test("saves picked typography and a disabled rule before shutdown", async () => {
    await launch();
    await openTarget();
    original = await target
      .locator("#hero")
      .evaluate((el) => getComputedStyle(el).fontSize);
    await openPanel();
    await panel
      .getByRole("button", { name: "Pick element", exact: true })
      .click();
    await target.locator("#hero").click();
    await panel
      .getByRole("group", { name: "Font provider" })
      .getByRole("button", { name: "Fontshare", exact: true })
      .click();
    await panel.getByLabel("Search fonts", { exact: true }).fill("Work Sans");
    await panel
      .locator(".font-choice")
      .filter({ has: panel.getByText("Work Sans", { exact: true }) })
      .click();
    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
    await panel
      .locator(
        '[data-card="typography"] > .disclosure-header .disclosure-trigger',
      )
      .click();
    await panel
      .getByRole("button", { name: "Advanced typography", exact: true })
      .click();
    await panel.getByRole("radio", { name: "Italic", exact: true }).click();
    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
    await editNumber("Size", "41");
    await editNumber("Line height", "49");
    await editNumber("Letter spacing", "1.2");
    await panel.getByRole("button", { name: "New", exact: true }).click();
    await expect(panel.locator(".selector-token")).toHaveCount(0);
    await panel.locator("#selector").fill("#intro");
    await panel.locator(".selector-add").press("Enter");
    await expect(panel.locator(".selector-token input")).toHaveValue("#intro");
    await editNumber("Size", "19");
    await panel
      .getByRole("button", { name: "Rule 1 visibility", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Rule 1 visibility", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
    before = await savedConfig();
    expect(before.rules).toHaveLength(2);
    expect(before.rules[1]!.mode).toBe("exact");
    expect(before.rules[1]!.handle).toBeUndefined();
    expect(before.rules[1]!.font!.id).toBe("fontshare:work-sans");
    expect(before.rules[0]!.enabled).toBe(false);
  });

  test("restores its exact draft before opening the panel and saves Preview off", async () => {
    await launch();
    const unrelated = await context!.newPage();
    await unrelated.goto("http://127.0.0.1:4318/playground/?other-page=1");
    await expect(unrelated.locator("#hero")).toHaveCSS("font-size", original);
    await openTarget();
    // Existing site access restores on navigation before the panel is opened.
    await expect(target.locator("#hero")).toHaveCSS("font-size", "41px", {
      timeout: 30000,
    });
    await expect(target.locator("#hero")).toHaveCSS("line-height", "49px");
    await expect(target.locator("#hero")).toHaveCSS("letter-spacing", "1.2px");
    await expect(target.locator("#hero")).toHaveCSS("font-style", "italic");
    await expect(target.locator("#hero")).toHaveCSS(
      "font-family",
      /Fontzie-fontshare-work-sans/,
    );
    await expect
      .poll(() =>
        target.evaluate(() =>
          [...document.fonts].some(
            (f) =>
              f.family.includes("fontshare-work-sans") &&
              f.style === "italic" &&
              f.status === "loaded",
          ),
        ),
      )
      .toBe(true);
    await openPanel();
    await expect(panel.locator(".rule-select")).toHaveCount(2);
    await expect(
      panel.getByRole("button", { name: "Rule 1 visibility", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(await savedConfig()).toEqual(before);
    await panel.getByRole("switch", { name: "Preview", exact: true }).uncheck();
    await expect(target.locator("#hero")).toHaveCSS("font-size", original);
    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
    expect((await savedConfig()).preview).toBe(false);
  });

  test("retains Preview off after shutdown and saves reset", async () => {
    await launch();
    await openTarget();
    await openPanel();
    await expect(
      panel.getByRole("switch", { name: "Preview", exact: true }),
    ).not.toBeChecked();
    await expect(target.locator("#hero")).toHaveCSS("font-size", original);
    await panel.getByRole("switch", { name: "Preview", exact: true }).check();
    await expect(target.locator("#hero")).toHaveCSS("font-size", "41px", {
      timeout: 30000,
    });
    await panel
      .getByRole("button", { name: "Clear edits", exact: true })
      .click();
    await panel
      .getByRole("menuitem", { name: "Clear page edits", exact: true })
      .click();
    await expect(panel.locator("[data-rule-id]")).toHaveCount(0);
    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
    expect((await savedConfig()).rules).toEqual([]);
  });

  test("retains reset after the next shutdown", async () => {
    await launch();
    await openTarget();
    await openPanel();
    await expect(panel.locator("[data-rule-id]")).toHaveCount(0);
    await expect(target.locator("#hero")).toHaveCSS("font-size", original);
    expect((await savedConfig()).rules).toEqual([]);
    await fs.writeFile(
      "tests/results/browser-restart.json",
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          browser: "Chromium",
          persistentProfile: true,
          browserShutdownsAndRelaunches: 3,
          sessionStorageEmptyOnEachLaunch: true,
          restoredBeforePanelOpenWithExistingSiteAccess: true,
          checks: [
            "exact pick safely rebound",
            "Work Sans italic downloaded and loaded again",
            "font size 41px",
            "line height 49px",
            "letter spacing 1.2px",
            "disabled second rule",
            "same configuration after restart",
            "different URL isolated",
            "Preview off retained",
            "reset retained",
          ],
          permissions:
            "Test-only localhost grant; production permissions unchanged",
        },
        null,
        2,
      ) + "\n",
    );
  });
});
