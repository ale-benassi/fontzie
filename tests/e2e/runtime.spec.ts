import { test, expect } from "./fixtures/extension";

test("loads a real MV3 worker and connects the panel", async ({ fontzie }) => {
  const { worker, inspect, size, target } = fontzie;

  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toContain("sidePanel");
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.host_permissions).not.toContain("<all_urls>");
  await inspect("#hero");
  await size("52");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "52px");
});

test("restrictive CSP allows supported extension CSS and buffer-loaded fonts", async ({
  fontzie,
}) => {
  const { context, worker, panel } = fontzie;

  const csp = await context.newPage();
  await csp.goto("http://127.0.0.1:4318/playground/?csp=1");
  await csp.bringToFront();
  const id = await worker.evaluate(async () => {
    return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]!
      .id!;
  });
  const r = await panel.evaluate(
    async (id) =>
      chrome.runtime.sendMessage({
        channel: "fontzie-panel",
        type: "connect",
        tabId: id,
      }),
    id,
  );
  expect(r.ok).toBe(true);
  const result = await panel.evaluate(
    async (id) =>
      chrome.runtime.sendMessage({
        channel: "fontzie-panel",
        type: "request",
        tabId: id,
        request: {
          type: "apply",
          config: {
            version: 1,
            preview: true,
            rules: [
              {
                id: "csp",
                selector: "#hero",
                mode: "selector",
                frameId: 0,
                enabled: true,
                font: {
                  id: "google:manrope",
                  family: "Manrope",
                  provider: "google",
                },
                properties: {
                  "font-family": '"Manrope", sans-serif',
                  "font-size": "47px",
                  "font-weight": "600",
                },
              },
            ],
          },
        },
      }),
    id,
  );
  expect(result.ok).toBe(true);
  await expect(csp.locator("#hero")).toHaveCSS("font-size", "47px");
  await expect(csp.locator("#hero")).toHaveCSS(
    "font-family",
    /Fontzie-google-manrope/,
  );
  expect(
    await csp.evaluate(() =>
      [...document.fonts].some(
        (f) => f.status === "loaded" && f.family === "Fontzie-google-manrope",
      ),
    ),
  ).toBe(true);
  await csp.close();
});

test("unsupported pages and origins without permission fail clearly", async ({
  fontzie,
}) => {
  const { context, worker, panel } = fontzie;

  const denied = await context.newPage();
  await denied.goto("http://localhost:4318/playground/");
  await denied.bringToFront();
  const id = await worker.evaluate(async () => {
    return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]!
      .id!;
  });
  const result = await panel.evaluate(
    async (id) =>
      chrome.runtime.sendMessage({
        channel: "fontzie-panel",
        type: "connect",
        tabId: id,
      }),
    id,
  );
  expect(result.ok).toBe(false);
  await denied.goto("chrome://version");
  const unsupported = await panel.evaluate(
    async (id) =>
      chrome.runtime.sendMessage({
        channel: "fontzie-panel",
        type: "connect",
        tabId: id,
      }),
    id,
  );
  expect(unsupported.ok).toBe(false);
  expect(unsupported.connectionBlock).toBe("unsupported-page");
  await denied.close();
});

test("optional local-font access is detected and gracefully denied or unavailable", async ({
  fontzie,
}) => {
  const { panel, context, extensionId, inspect } = fontzie;

  const capability = await panel.evaluate(
    () =>
      "queryLocalFonts" in window &&
      typeof window.queryLocalFonts === "function",
  );
  await inspect("#hero");
  if (capability) {
    const session = await context.newCDPSession(panel);
    await session.send("Browser.setPermission", {
      permission: { name: "local-fonts" },
      setting: "denied",
      origin: `chrome-extension://${extensionId}`,
    });
  }
  await panel.getByLabel("Search fonts", { exact: true }).fill("Satoshi");
  await panel
    .getByRole("button", { name: "Use installed fonts", exact: true })
    .click();
  await expect(
    panel
      .getByRole("group", { name: "Font provider", exact: true })
      .getByRole("button", { name: "Local", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    panel.locator('[aria-labelledby="font-heading"]').getByRole("alert"),
  ).toBeVisible();
});

test("network failure retains the last applied configuration", async ({
  fontzie,
}) => {
  const { target, context, panel, tabId } = fontzie;

  const previous = await target
    .locator("#hero")
    .evaluate((el) => getComputedStyle(el).fontSize);
  await context.setOffline(true);
  try {
    const result = await panel.evaluate(
      async (tabId) =>
        chrome.runtime.sendMessage({
          channel: "fontzie-panel",
          type: "request",
          tabId,
          request: {
            type: "apply",
            config: {
              version: 1,
              preview: true,
              rules: [
                {
                  id: "offline",
                  selector: "#hero",
                  mode: "selector",
                  frameId: 0,
                  enabled: true,
                  font: {
                    id: "google:bungee-spice",
                    family: "Bungee Spice",
                    provider: "google",
                  },
                  properties: {
                    "font-family": '"Bungee Spice", sans-serif',
                    "font-size": "99px",
                    "font-weight": "400",
                  },
                },
              ],
            },
          },
        }),
      tabId,
    );
    expect(result.ok).toBe(false);
    await expect(target.locator("#hero")).toHaveCSS("font-size", previous);
  } finally {
    await context.setOffline(false);
  }
});

test("worker restart retains style ownership and side-panel API opens", async ({
  fontzie,
}) => {
  const {
    worker,
    panel,
    tabId,
    closeNativePanel,
    context,
    extensionId,
    target,
  } = fontzie;

  const behavior = await worker.evaluate(() =>
    chrome.sidePanel.getPanelBehavior(),
  );
  expect(behavior.openPanelOnActionClick).toBe(false);
  await panel.evaluate((tabId) => {
    const button = document.createElement("button");
    button.id = "open-native-panel";
    button.textContent = "Open native panel";
    button.onclick = () => {
      void chrome.sidePanel
        .open({ tabId })
        .then(() => (button.dataset.result = "opened"))
        .catch((e) => (button.dataset.result = String(e)));
    };
    document.body.append(button);
  }, tabId);
  await panel.locator("#open-native-panel").click();
  await expect(panel.locator("#open-native-panel")).toHaveAttribute(
    "data-result",
    "opened",
  );
  await panel.locator("#open-native-panel").evaluate((el) => el.remove());
  await closeNativePanel();
  const cdp = await context.newCDPSession(panel);
  const targets = await cdp.send("Target.getTargets");
  const sw = targets.targetInfos.find(
    (t) =>
      t.type === "service_worker" &&
      t.url.startsWith(`chrome-extension://${extensionId}`),
  );
  expect(sw).toBeTruthy();
  await cdp.send("Target.closeTarget", { targetId: sw!.targetId });
  await panel.getByRole("switch", { name: "Preview", exact: true }).uncheck();
  await expect(target.locator("#inline")).toHaveCSS("font-size", "19px");
  await panel.getByRole("switch", { name: "Preview", exact: true }).check();
});

test("failed tab switches clear the previous page and switching back restores its edits", async ({
  fontzie,
}) => {
  const { context, extensionId, target, panel, inspect, size } = fontzie;
  await inspect("#hero");
  await size("41");
  // A docked panel follows activation; the fixture normally pins its test tab.
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await target.bringToFront();
  const picker = panel.getByRole("button", {
    name: "Pick element",
    exact: true,
  });
  await expect(picker).toBeEnabled();
  await expect(panel.getByLabel("Size", { exact: true })).toHaveValue("41");
  await expect(panel.locator("header")).not.toContainText("127.0.0.1");
  await expect(panel.locator("header")).not.toContainText("Auto-save");

  for (const url of ["chrome://version", "http://localhost:4318/playground/"]) {
    const unavailable = await context.newPage();
    await unavailable.goto(url);
    await unavailable.bringToFront();
    await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
    await expect(
      panel.getByRole("heading", { name: "Connect a website", exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("status").filter({ hasText: "Fontzie toolbar icon" }),
    ).toBeVisible();
    await expect(panel.locator(".connection")).toHaveCSS("filter", "none");
    await expect(
      panel.locator(".ui-card").filter({ has: panel.locator("#targets") }),
    ).toHaveCSS("filter", "none");
    await expect(
      panel.locator("#targets > .disclosure-content > .disclosure-body"),
    ).toHaveCSS("filter", "blur(1.2px)");
    await expect(panel.locator(".editor-footer")).toHaveCSS(
      "filter",
      "blur(1.2px)",
    );
    await expect(
      panel.getByRole("button", { name: "Targets", exact: true }),
    ).toBeDisabled();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "Retry", exact: true }),
    ).toHaveCount(0);
    await expect(picker).toBeDisabled();
    await expect(panel.locator("[data-rule-id]")).toHaveCount(0);
    await expect(panel.locator("#selector")).toHaveValue("");
    await expect(
      panel.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByRole("button", { name: "Redo", exact: true }),
    ).toBeDisabled();
    await expect(panel.locator(".session-notice")).toHaveCount(0);
    await expect(panel.locator(".notification-toast")).toBeHidden();
    await expect(target.locator("#hero")).toHaveCSS("font-size", "41px");

    await target.bringToFront();
    await expect(picker).toBeEnabled();
    await expect(panel.locator(".rule-select")).toHaveCount(1);
    await expect(panel.getByLabel("Size", { exact: true })).toHaveValue("41");
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await unavailable.close();
  }
});
