import { test, expect } from "./fixtures/extension";
import fs from "node:fs/promises";

test("export reproduces a styled heading and the priority of overlapping rules", async ({
  fontzie,
}) => {
  const { panel, target, inspect, size, context } = fontzie;
  const consumer = await context.newPage();
  await consumer.setContent(
    '<style>h1 {font-size:64px} #hero {font-size:48px}</style><h1>Heading</h1><h1 id="hero">Hero</h1>',
  );
  async function installExport() {
    await panel.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = panel.getByRole("dialog", { name: "Export typography" });
    const css = await dialog
      .getByRole("textbox", { name: "Export preview" })
      .inputValue();
    await dialog.getByRole("button", { name: "Close export" }).click();
    return consumer.addStyleTag({ content: css });
  }
  await inspect("h1");
  await size("65");
  const first = await installExport();
  await expect(consumer.locator("h1").first()).toHaveCSS("font-size", "65px");
  await first.evaluate((style) => {
    style.parentNode?.removeChild(style);
  });
  await inspect("#hero");
  await size("80");
  await installExport();
  const preview = await target
    .locator("#hero")
    .evaluate((el) => getComputedStyle(el).fontSize);
  await expect(consumer.locator("#hero")).toHaveCSS("font-size", preview);
  await expect(consumer.locator("h1").first()).toHaveCSS("font-size", "65px");
  await consumer.close();
});

test("AI prompt export copies scoped typography and offers a text download", async ({
  fontzie,
}) => {
  const { panel, resetCurrentPage, inspect, size, target, context } = fontzie;

  await panel.reload();
  await expect(panel.locator(".panel")).toHaveAttribute("aria-busy", "false");
  await resetCurrentPage();
  await inspect("#hero");
  await size("43");
  await inspect("#intro");
  await size("19");
  await inspect("#nav-link");
  await size("17");
  await panel
    .locator(".rule-row")
    .filter({ has: panel.getByRole("button", { name: /^#nav-link ·/ }) })
    .getByRole("button", { name: /Rule \d+ visibility/ })
    .click();
  await panel.getByRole("button", { name: /^#hero ·/ }).click();
  await panel.getByRole("button", { name: "Export", exact: true }).click();
  await panel
    .getByRole("group", { name: "Export format", exact: true })
    .getByRole("button", { name: "AI prompt", exact: true })
    .click();
  const dialog = panel.getByRole("dialog");
  const preview = dialog.getByRole("textbox", { name: "Export preview" });
  await expect(preview).toHaveValue(/Fontzie, a browser extension/);
  expect(await preview.inputValue()).toContain(target.url());
  await expect(preview).toHaveValue(/"font-size": "43px"/);
  await expect(preview).toHaveValue(/"font-size": "19px"/);
  await expect(preview).not.toHaveValue(/#nav-link/);
  await dialog
    .getByRole("button", { name: "Copy prompt", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Copy prompt", exact: true }),
  ).toHaveText("Copied");
  await context.grantPermissions(["clipboard-read"]);
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe(
    await preview.inputValue(),
  );
  const toast = dialog.locator(".notification-toast");
  await expect(toast).toContainText("Prompt copied.");
  await panel.keyboard.press("F8");
  await panel.keyboard.press("Tab");
  await panel.keyboard.press("Tab");
  const dismiss = toast.getByRole("button", { name: "Dismiss notification" });
  await expect(dismiss).toBeFocused();
  await dismiss.click();
  await expect(toast).toBeHidden();
  await expect(dialog).toBeVisible();
  await panel.getByLabel("Export scope").selectOption("selected");
  await expect(
    dialog.getByRole("button", { name: "Copy prompt", exact: true }),
  ).toHaveText("Copy prompt");
  await expect(preview).toHaveValue(/"font-size": "43px"/);
  await expect(preview).not.toHaveValue(/#intro/);
  const downloadEvent = panel.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download prompt", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("fontzie-prompt.txt");
  expect(await fs.readFile((await download.path())!, "utf8")).toBe(
    await preview.inputValue(),
  );
  for (const [theme, width] of [
    ["light", 420],
    ["dark", 320],
  ] as const) {
    await panel.evaluate(
      (theme) => document.documentElement.setAttribute("data-theme", theme),
      theme,
    );
    await panel.setViewportSize({ width, height: width === 320 ? 400 : 850 });
    const copy = dialog.getByRole("button", { name: "Copy prompt" });
    const download = dialog.getByRole("button", { name: "Download prompt" });
    await expect(copy).toBeInViewport({ ratio: 1 });
    await expect(download).toBeInViewport({ ratio: 1 });
    const before = await copy.boundingBox();
    const secondary = await download.boundingBox();
    expect(secondary!.x + secondary!.width).toBeLessThanOrEqual(before!.x);
    expect(
      await preview.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await preview.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await preview.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await copy.boundingBox()).toEqual(before);
    expect(
      await dialog
        .locator(".ui-dialog-body")
        .evaluate((el) => el.scrollHeight <= el.clientHeight),
    ).toBe(true);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await panel.screenshot({
      path: `tests/screenshots/export-prompt-${theme}.png`,
    });
  }
  await panel.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        throw new Error("Clipboard unavailable");
      },
    });
  });
  await dialog
    .getByRole("button", { name: "Copy prompt", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "copy the selected export",
  );
  await expect(preview).toBeFocused();
  expect(
    await preview.evaluate((el: HTMLTextAreaElement) =>
      el.value.slice(el.selectionStart, el.selectionEnd),
    ),
  ).toBe(await preview.inputValue());
  await panel.keyboard.press("Escape");
  await expect(
    panel.getByRole("button", { name: "Export", exact: true }),
  ).toBeFocused();
  await panel.reload();
});

test("AI export identifies one repeated heading and asks for clarification when it becomes ambiguous", async ({
  fontzie,
}) => {
  const { panel, target, size } = fontzie;
  await target.locator("main").evaluate((main) => {
    const sections = ["portfolio", "services"].map((id) => {
      const section = document.createElement("section");
      section.id = id;
      const heading = document.createElement("h2");
      heading.className = "section-kicker font-body";
      heading.textContent = id;
      section.append(heading);
      return section;
    });
    main.prepend(...sections);
  });
  const picked = target.locator("#portfolio h2");
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await picked.hover();
  await picked.click();
  await size("37");
  await expect(picked).toHaveCSS("font-size", "37px");
  await expect(target.locator("#services h2")).not.toHaveCSS(
    "font-size",
    "37px",
  );
  const open = panel.getByRole("button", { name: "Export", exact: true });
  const dialog = panel.getByRole("dialog", { name: "Export typography" });
  const preview = dialog.getByRole("textbox", { name: "Export preview" });
  await open.click();
  await dialog.getByRole("button", { name: "AI prompt", exact: true }).click();
  await expect(preview).toHaveValue(
    /"selector": "#portfolio h2\.section-kicker\.font-body"/,
  );
  await expect(preview).not.toHaveValue(
    /needs confirmation|data-fontzie-target/,
  );
  await dialog.getByRole("button", { name: "Close export" }).click();
  await picked.evaluate((heading) => {
    const sibling = heading.cloneNode(true) as Element;
    sibling.removeAttribute("data-fontzie-target");
    heading.after(sibling);
  });
  await open.click();
  await expect(preview).toHaveValue(/"status": "needs confirmation"/);
  await expect(preview).toHaveValue(
    /"selectorHint": "h2\.section-kicker\.font-body"/,
  );
  await expect(preview).not.toHaveValue(/"selector":/);
  await dialog.getByRole("button", { name: "Close export" }).click();
  await picked.first().evaluate((heading) => {
    // A framework can replace the node and copy its temporary attributes.
    heading.nextElementSibling?.remove();
    heading.replaceWith(heading.cloneNode(true));
  });
  await open.click();
  await expect(preview).toHaveValue(/"status": "needs confirmation"/);
  await expect(preview).not.toHaveValue(/#portfolio h2/);
});

test("embedded exact picks keep their frame and nested shadow hosts in the prompt", async ({
  fontzie,
}) => {
  const { panel, target, size } = fontzie;
  const frame = target.frameLocator("#same-frame");
  await frame.locator("body").evaluate((body) => {
    for (const id of ["first-card", "second-card"]) {
      const host = document.createElement("article");
      host.id = id;
      const inner = document.createElement("div");
      inner.className = "card-content";
      const heading = document.createElement("h2");
      heading.className = "title";
      heading.textContent = id;
      inner.attachShadow({ mode: "open" }).append(heading);
      host.attachShadow({ mode: "open" }).append(inner);
      body.prepend(host);
    }
  });
  const heading = frame.getByRole("heading", { name: "second-card" });
  await panel
    .getByRole("button", { name: "Pick element", exact: true })
    .click();
  await heading.hover();
  await heading.click();
  await size("36");
  await expect(heading).toHaveCSS("font-size", "36px");
  await expect(
    frame.getByRole("heading", { name: "first-card" }),
  ).not.toHaveCSS("font-size", "36px");
  await panel.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = panel.getByRole("dialog", { name: "Export typography" });
  await dialog.getByRole("button", { name: "AI prompt", exact: true }).click();
  const preview = dialog.getByRole("textbox", { name: "Export preview" });
  await expect(preview).toHaveValue(
    /"embeddedDocument": "[^"]+\/playground\/frame\.html"/,
  );
  await expect(preview).toHaveValue(
    /"shadowHosts":\s*\[\s*"#second-card",\s*"\.card-content"\s*\]/,
  );
  await expect(preview).toHaveValue(/"selector": "\.title"/);
  await expect(preview).not.toHaveValue(/#first-card|needs confirmation/);
});
