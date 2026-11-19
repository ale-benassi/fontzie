import { test, expect } from "./fixtures/extension";

test("floating editor moves, resizes, minimizes, edits, picks a new target and docks", async ({
  fontzie,
}) => {
  const {
    panel,
    resetCurrentPage,
    inspect,
    size,
    target,
    context,
    worker,
    closeNativePanel,
  } = fontzie;

  test.setTimeout(120000);
  await resetCurrentPage();
  await expect(panel.locator("[data-rule-id]")).toHaveCount(0);
  await inspect("#hero");
  await size("40.5");
  await panel
    .getByRole("button", { name: "Float editor over webpage", exact: true })
    .click();
  const host = target.locator("fontzie-editor");
  await expect(host).toBeVisible();
  // The fixture opens the sidebar as a separate tab. Real floating mode lives
  // in the foreground website, so activate it before exercising its iframe.
  await target.bringToFront();
  await expect
    .poll(() => target.frames().some((f) => f.url().includes("floating=1")))
    .toBe(true);
  const floating = target.frames().find((f) => f.url().includes("floating=1"))!;
  await expect(floating.getByLabel("Size", { exact: true })).toHaveValue(
    "40.5",
  );
  await expect(floating.locator("html")).toHaveCSS("scrollbar-gutter", "auto");
  await floating.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(target.locator("#hero")).not.toHaveCSS("font-size", "40.5px");
  await floating.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(target.locator("#hero")).toHaveCSS("font-size", "40.5px");
  const start = (await host.boundingBox())!;
  await floating
    .getByRole("button", { name: "Move floating panel", exact: true })
    .press("ArrowLeft");
  await expect
    .poll(async () => (await host.boundingBox())!.x)
    .toBe(start.x - 10);
  await floating
    .getByRole("button", { name: "Resize floating panel", exact: true })
    .press("ArrowLeft");
  await expect
    .poll(async () => (await host.boundingBox())!.width)
    .toBe(start.width - 10);
  await floating
    .getByRole("button", { name: "Minimize floating panel", exact: true })
    .click();
  await expect.poll(async () => (await host.boundingBox())!.height).toBe(42);
  await floating
    .getByRole("button", { name: "Expand floating panel", exact: true })
    .click();
  await expect
    .poll(async () => (await host.boundingBox())!.height)
    .toBe(start.height);
  await floating.getByLabel("Size", { exact: true }).fill("49.1");
  await floating.getByLabel("Size", { exact: true }).press("Tab");
  await expect(target.locator("#hero")).toHaveCSS("font-size", "49.1px");
  await target.screenshot({ path: "tests/screenshots/floating-editor.png" });
  await floating
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await expect(
    floating.getByRole("button", { name: "Cancel picking", exact: true }),
  ).toBeVisible();
  await target.locator("#nav-link").click();
  await expect(floating.locator(".exact-target")).toContainText("#nav-link");
  await floating.getByLabel("Size", { exact: true }).fill("19.5");
  await floating.getByLabel("Size", { exact: true }).press("Tab");
  await expect(target.locator("#nav-link")).toHaveCSS("font-size", "19.5px");
  const other = await context.newPage();
  await other.goto("http://127.0.0.1:4318/playground/?other-floating-tab=1");
  const otherId = await worker.evaluate(
    async () =>
      (await chrome.tabs.query({})).find(
        (tab) =>
          tab.url === "http://127.0.0.1:4318/playground/?other-floating-tab=1",
      )!.id!,
  );
  const blocked = await floating.evaluate(
    async (id) =>
      chrome.runtime.sendMessage({
        channel: "fontzie-panel",
        type: "connect",
        tabId: id,
      }),
    otherId,
  );
  expect(blocked).toEqual({
    ok: false,
    error: "The floating editor belongs to a different tab.",
  });
  await other.close();
  await target.bringToFront();
  await floating
    .getByRole("button", { name: "Dock editor in sidebar", exact: true })
    .click();
  await expect(host).toHaveCount(0);
  await panel.reload();
  await expect(panel.locator(".rule-select")).toHaveCount(1);
  await expect(target.locator("#hero")).toHaveCSS("font-size", "19.5px");
  await expect(target.locator("#nav-link")).toHaveCSS("font-size", "19.5px");
  await closeNativePanel();
});

test("floating export copies the full preview and Close and Dock remove stranded editors", async ({
  fontzie,
}) => {
  const { panel, target, context, inspect, size, closeNativePanel } = fontzie;
  await inspect("#hero");
  await size("38");
  const shell = target.locator("fontzie-editor[data-fontzie-ui]");
  const leaveOldShell = () =>
    target.evaluate(() => {
      const old = document.createElement("fontzie-editor");
      old.setAttribute("data-fontzie-ui", "");
      old.setAttribute("popover", "manual");
      document.documentElement.append(old);
    });
  async function float() {
    await panel.bringToFront();
    await panel
      .getByRole("button", { name: "Float editor over webpage" })
      .click();
    await target.bringToFront();
    await expect(shell).toHaveCount(1);
    await expect
      .poll(() => target.frames().some((f) => f.url().includes("floating=1")))
      .toBe(true);
    return target.frames().find((f) => f.url().includes("floating=1"))!;
  }
  await leaveOldShell();
  const floating = await float();
  await floating.getByRole("button", { name: "Export", exact: true }).click();
  await floating
    .getByRole("button", { name: "AI prompt", exact: true })
    .click();
  const preview = await floating
    .getByRole("textbox", { name: "Export preview" })
    .inputValue();
  expect(preview).toContain("38px");
  const copy = floating.getByRole("button", { name: "Copy prompt" });
  await copy.click();
  await expect(copy).toHaveText("Copied");
  await context.grantPermissions(["clipboard-read"], {
    origin: new URL(target.url()).origin,
  });
  await floating.getByRole("button", { name: "Close export" }).click();
  await leaveOldShell();
  await floating.getByRole("button", { name: "Close floating panel" }).click();
  await expect(shell).toHaveCount(0);
  await target.bringToFront();
  await target.locator("#hero").click();
  expect(await target.evaluate(() => navigator.clipboard.readText())).toBe(
    preview,
  );
  await expect(target.locator("#hero")).toHaveCSS("font-size", "38px");
  const reopened = await float();
  await leaveOldShell();
  await reopened
    .getByRole("button", { name: "Dock editor in sidebar" })
    .click();
  await expect(shell).toHaveCount(0);
  await expect(target.locator("#hero")).toHaveCSS("font-size", "38px");
  await closeNativePanel();
  const beforeReload = await float();
  await expect(beforeReload.getByLabel("Size", { exact: true })).toHaveValue(
    "38",
  );
  // A reload can close the panel before Playwright receives the evaluation result.
  await panel.evaluate(() => {
    window.setTimeout(() => chrome.runtime.reload(), 0);
  });
  await expect(shell).toHaveCount(0, { timeout: 10000 });
});
