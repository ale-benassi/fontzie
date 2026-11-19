import {
  test as base,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

import { stageExtension } from "./build";

async function createFontzie(liveProviders = false, legacyFont = false) {
  let context!: BrowserContext,
    worker!: Worker,
    target!: Page,
    panel!: Page,
    extensionId!: string,
    tabId!: number;
  const traffic: Array<{ url: string; method: string; body: string | null }> =
    [];
  const pageErrors: string[] = [];

  const extension = await fs.mkdtemp(path.join(os.tmpdir(), "fontzie-e2e-"));
  await fs.mkdir("tests/results", { recursive: true });
  try {
    await stageExtension(extension, liveProviders);
    context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
      viewport: { width: 1100, height: 850 },
    });
    context.on("request", (request) =>
      traffic.push({
        url: request.url(),
        method: request.method(),
        body: request.postData(),
      }),
    );
    worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    extensionId = new URL(worker.url()).host;
    // Run setup APIs from an extension page instead of evaluating the MV3
    // worker while Chrome is still starting its execution context.
    panel = await context.newPage();
    panel.on("pageerror", (error) => pageErrors.push(error.message));
    await panel.goto(`chrome-extension://${extensionId}/fixture-api.html`);
    if (legacyFont) {
      const bytes = (
        await fs.readFile("tests/fixtures/fonts/ABeeZee-Regular.ttf")
      ).toString("base64");
      await panel.evaluate(async (encoded) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("fontzie-fonts", 1);
          request.onupgradeneeded = () =>
            request.result.createObjectStore("faces", { keyPath: "id" });
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction("faces", "readwrite");
        transaction.objectStore("faces").put({
          id: "legacy",
          family: "Legacy fixture",
          weight: 400,
          style: "normal",
          axes: [],
          fileName: "legacy.ttf",
          mime: "font/ttf",
          bytes: Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)).buffer,
        });
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
        database.close();
      }, bytes);
    }
    target = await context.newPage();
    target.on("pageerror", (error) => pageErrors.push(error.message));
    await target.goto("http://127.0.0.1:4318/playground/");
    await target.bringToFront();
    tabId = await panel.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url);
      return tab!.id!;
    }, target.url());
    await panel.goto(
      `chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`,
    );
    await panel.bringToFront();
    await expect(
      panel.getByRole("button", { name: "Pick element", exact: true }),
    )
      .toBeEnabled({ timeout: 30000 })
      .catch(async (error) => {
        console.error("Extension startup", {
          tabId,
          errors: pageErrors,
          feedback: await panel.locator(".feedback").innerText(),
          tabs: await panel.evaluate(() => chrome.tabs.query({})),
        });
        throw error;
      });

    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
    async function reopenPanel(url: string) {
      panel = await context.newPage();
      panel.on("pageerror", (error) => pageErrors.push(error.message));
      await panel.goto(url);
      return panel;
    }
    async function openDisclosure(label: string) {
      if (label === "Settings") return openSettings();
      if (label === "Backup & data") await openSettings();
      const trigger = panel.getByRole("button", { name: label, exact: true });
      if ((await trigger.getAttribute("aria-expanded")) !== "true")
        await trigger.click();
    }
    async function expectPresetControls() {
      await expect(panel.getByLabel("Presets", { exact: true })).toBeVisible();
    }
    async function openPresetSave() {
      const input = panel.getByLabel("Preset name", { exact: true });
      if (!(await input.isVisible())) {
        await panel
          .getByRole("button", { name: "Presets", exact: true })
          .click();
        await panel
          .getByRole("menuitem", { name: "Save as new…", exact: true })
          .click();
      }
      await expect(input).toBeFocused();
    }
    async function choosePreset(name: string) {
      await panel.getByRole("button", { name: "Presets", exact: true }).click();
      await panel
        .getByRole("menuitem", { name: `Apply ${name}`, exact: true })
        .click();
      await expect(panel.locator(".panel")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await panel.locator(".notification-toast").evaluate(async (el) => {
        await Promise.all(
          el.getAnimations().map((animation) => animation.finished),
        );
      });
    }
    async function presetAction(name: string, action: string) {
      await panel.getByRole("button", { name: "Presets", exact: true }).click();
      await panel
        .getByRole("menuitem", {
          name: `${action.replace("…", "")} ${name}`,
          exact: true,
        })
        .click();
    }
    async function openTargetOptions() {
      await expect(panel.locator("#selector")).toBeVisible();
    }
    function targetMode(value: string) {
      const shortcuts = panel.getByRole("group", {
        name: "CSS selector shortcuts",
        exact: true,
      });
      if (value === "class")
        return shortcuts.getByRole("button", { name: /^Class / });
      if (value === "tag")
        return shortcuts.getByRole("button", {
          name: "Headings",
          exact: true,
        });
      if (value === "page")
        return shortcuts.getByRole("button", {
          name: "Whole page",
          exact: true,
        });
      return panel
        .getByRole("group", { name: "Targeting", exact: true })
        .getByRole("button", {
          name: value === "exact" ? "Picked element" : "CSS selector",
          exact: true,
        });
    }
    async function chooseTargetMode(value: string) {
      await targetMode(value).click();
      await expect(panel.locator(".panel")).toHaveAttribute(
        "aria-busy",
        "false",
      );
    }
    async function resetCurrentPage() {
      const rules = panel.locator('[data-card="rules"]');
      if ((await rules.getAttribute("data-inactive")) === "true") return;
      await panel
        .getByRole("button", { name: "Clear edits", exact: true })
        .click();
      await panel
        .getByRole("menuitem", { name: "Clear page edits", exact: true })
        .click();
      await expect(rules).toHaveAttribute("data-inactive", "true");
      await expect(
        panel.getByRole("button", { name: "Clear target", exact: true }),
      ).toHaveCount(0);
    }
    async function ruleAction(index: number, action: string) {
      await panel
        .getByRole("button", { name: `Actions for rule ${index}`, exact: true })
        .click();
      await panel
        .getByRole("menuitem", {
          name: `${action} rule ${index}${action === "Move" ? " up" : ""}`,
          exact: true,
        })
        .click();
      if (action === "Delete") {
        await panel
          .getByRole("dialog")
          .getByRole("button", { name: "Delete rule", exact: true })
          .click();
        await expect(panel.getByRole("dialog")).toHaveCount(0);
      }
    }
    async function expectSelectors(value: string) {
      await expect
        .poll(async () => {
          const tokens = await panel
            .locator(".selector-token input")
            .evaluateAll((elements) =>
              elements.map((el) => (el as HTMLInputElement).value),
            );
          const addition = await panel.locator(".selector-add").inputValue();
          return [...tokens, ...(addition ? [addition] : [])].join(", ");
        })
        .toBe(value);
    }
    async function inspect(selector: string) {
      // Each helper call starts an independent rule. Clearing targets now
      // deliberately keeps the current rule and its typography settings.
      const rules = panel.locator('[data-card="rules"]');
      if ((await rules.getAttribute("data-inactive")) !== "true") {
        await panel.getByRole("button", { name: "New", exact: true }).click();
        await expect(panel.locator(".rule-row.editing")).toContainText(
          "Blank rule",
        );
      }
      await openTargetOptions();
      // An invalid first selector can leave input tokens without a saved rule.
      if (await panel.locator(".selector-token").count())
        await panel
          .getByRole("button", { name: "Clear target", exact: true })
          .click();
      await expect(panel.locator(".selector-token")).toHaveCount(0);
      await panel.locator("#selector").fill(selector);
      await panel.locator(".selector-add").press("Enter");
      await expect(panel.locator(".panel")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await expect(
        panel.locator(".selector-token input").first(),
      ).toBeVisible();
      await openTypography();
    }
    async function closeNativePanel() {
      await worker.evaluate(async (id) => {
        const api = chrome.sidePanel as typeof chrome.sidePanel & {
          close?: (options: { windowId: number }) => Promise<void>;
        };
        const tab = await chrome.tabs.get(id);
        await api.close?.({ windowId: tab.windowId });
      }, tabId);
    }
    async function openSettings() {
      const dialog = panel.getByRole("dialog", {
        name: "Settings",
        exact: true,
      });
      if (!(await dialog.isVisible()))
        await panel
          .getByRole("button", { name: "Settings", exact: true })
          .click();
      await expect(dialog).toBeVisible();
    }
    async function closeSettings() {
      const dialog = panel.getByRole("dialog", {
        name: "Settings",
        exact: true,
      });
      if (await dialog.isVisible())
        await dialog
          .getByRole("button", { name: "Close Settings", exact: true })
          .click();
      await expect(dialog).toBeHidden();
    }
    async function setTheme(theme: string) {
      await openSettings();
      const select = panel.getByLabel("Theme", { exact: true });
      await select.selectOption(theme);
      await expect(select).toHaveValue(theme);
      await expect(select).toBeEnabled();
      await closeSettings();
    }
    async function openTypography() {
      const trigger = panel.locator(
        '[data-card="typography"] > .disclosure-header .disclosure-trigger',
      );
      await expect(trigger).toBeEnabled();
      if ((await trigger.getAttribute("aria-expanded")) !== "true")
        await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
    }
    async function size(value: string) {
      await openTypography();
      await panel.getByLabel("Size", { exact: true }).fill(value);
      await panel.getByLabel("Size", { exact: true }).press("Tab");
      await expect(panel.locator(".panel")).toHaveAttribute(
        "aria-busy",
        "false",
      );
    }
    async function sliderValue(label: string, value: number) {
      const thumb = panel.getByRole("slider", { name: label, exact: true });
      await thumb.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const root = thumb.locator('xpath=ancestor::*[@data-slot="slider"]');
      const box = (await root.boundingBox())!;
      const knob = (await thumb.boundingBox())!;
      const min = Number(await thumb.getAttribute("aria-valuemin"));
      const max = Number(await thumb.getAttribute("aria-valuemax"));
      await root.click({
        position: {
          x:
            knob.width / 2 +
            ((box.width - knob.width) * (value - min)) / (max - min),
          y: box.height / 2,
        },
      });
      let current = Number(await thumb.getAttribute("aria-valuenow"));
      for (let n = 0; current !== value && n < 3; n++) {
        await expect(panel.locator(".panel")).toHaveAttribute(
          "aria-busy",
          "false",
        );
        await thumb.press(current < value ? "ArrowRight" : "ArrowLeft");
        current = Number(await thumb.getAttribute("aria-valuenow"));
      }
      await expect(thumb).toHaveAttribute("aria-valuenow", String(value));
      await expect(panel.locator(".panel")).toHaveAttribute(
        "aria-busy",
        "false",
      );
    }
    function contrastRatio(foreground: string, background: string) {
      const luminance = (color: string) => {
        const channels = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((n) => {
            const value = n / 255;
            return value <= 0.04045
              ? value / 12.92
              : ((value + 0.055) / 1.055) ** 2.4;
          });
        return (
          channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
        );
      };
      const a = luminance(foreground),
        b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }
    async function colors(locator: ReturnType<Page["locator"]>) {
      return locator.evaluate((el) => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, foreground: style.color };
      });
    }
    return {
      context,
      worker,
      target,
      get panel() {
        return panel;
      },
      reopenPanel,
      extensionId,
      tabId,
      traffic,
      pageErrors,
      openDisclosure,
      expectPresetControls,
      openPresetSave,
      choosePreset,
      presetAction,
      openTargetOptions,
      targetMode,
      chooseTargetMode,
      resetCurrentPage,
      ruleAction,
      expectSelectors,
      inspect,
      closeNativePanel,
      openSettings,
      closeSettings,
      setTheme,
      size,
      sliderValue,
      contrastRatio,
      colors,
      async dispose() {
        await context.close();
        await fs.rm(extension, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await context?.close();
    await fs.rm(extension, { recursive: true, force: true });
    throw error;
  }
}
type FontzieFixture = Awaited<ReturnType<typeof createFontzie>>;
export const test = base.extend<{
  fontzie: FontzieFixture;
  legacyFont: boolean;
}>({
  legacyFont: [false, { option: true }],
  fontzie: async ({ legacyFont }, use, info) => {
    const app = await createFontzie(
      info.project.name === "providers",
      legacyFont,
    );
    try {
      await use(app);
    } finally {
      await app.dispose();
    }
  },
});
export { expect };
