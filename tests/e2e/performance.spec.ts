import fs from "node:fs/promises";
import { test, expect } from "./fixtures/extension";
import { FONT_CACHE_FAMILIES } from "../../providers/load";
import { alias } from "../../core/fonts";

test("browsing evicts idle font previews while keeping applied fonts usable", async ({
  fontzie,
}) => {
  const { panel, target, inspect } = fontzie;
  const bytes = (
    await fs.readFile("tests/fixtures/fonts/ABeeZee-Regular.ttf")
  ).toString("base64");
  await panel.evaluate(async (encoded) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fontzie-fonts", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const buffer = Uint8Array.from(atob(encoded), (c) =>
      c.charCodeAt(0),
    ).buffer;
    const transaction = database.transaction(
      ["faces", "binaries"],
      "readwrite",
    );
    for (let index = 0; index < 32; index++) {
      const suffix = String(index).padStart(2, "0");
      transaction.objectStore("faces").put({
        id: "cache-" + suffix,
        family: "Cache fixture " + suffix,
        weight: 400,
        style: "normal",
        axes: [],
        fileName: "cache-fixture.ttf",
        mime: "font/ttf",
        size: buffer.byteLength,
      });
      transaction.objectStore("binaries").put(buffer, "cache-" + suffix);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    await chrome.storage.local.set({
      "custom-fonts:revision": crypto.randomUUID(),
    });
  }, bytes);
  await panel.reload();
  await inspect("#hero");
  await panel
    .getByRole("group", { name: "Font provider" })
    .getByRole("button", { name: "Custom", exact: true })
    .click();
  await panel
    .locator(".font-choice")
    .filter({ has: panel.getByText("Cache fixture 00", { exact: true }) })
    .click();
  await expect(target.locator("#hero")).toHaveCSS(
    "font-family",
    new RegExp(alias("custom:Cache fixture 00")),
  );
  const list = panel.getByRole("region", { name: "Font families" });
  const loaded = (index: number) =>
    panel.evaluate(
      (family) =>
        [...document.fonts].some(
          (face) => face.family === family && face.status === "loaded",
        ),
      alias("custom:Cache fixture " + String(index).padStart(2, "0")),
    );
  for (let index = 0; index < 32; index += 4) {
    await list.evaluate((element, index) => {
      element.scrollTop = index * 64;
    }, index);
    await expect.poll(() => loaded(Math.min(31, index + 3))).toBe(true);
  }
  await panel
    .getByLabel("Search fonts", { exact: true })
    .fill("Cache fixture 31");
  await expect.poll(() => loaded(31)).toBe(true);
  await expect
    .poll(() =>
      panel.evaluate(
        () =>
          [...document.fonts].filter((face) =>
            face.family.startsWith("Fontzie-custom-"),
          ).length,
      ),
    )
    .toBeLessThanOrEqual(FONT_CACHE_FAMILIES + 3);
  expect(await loaded(0)).toBe(true);
  expect(await loaded(1)).toBe(false);
  expect(await loaded(2)).toBe(false);
  await panel
    .getByLabel("Search fonts", { exact: true })
    .fill("Cache fixture 02");
  await expect.poll(() => loaded(2)).toBe(true);
  await expect(panel.locator(".font-choice")).not.toContainText("unavailable");
  await expect(target.locator("#hero")).toHaveCSS(
    "font-family",
    new RegExp(alias("custom:Cache fixture 00")),
  );
});

test("dynamic shadow roots share discovery without repeated document traversals", async ({
  fontzie,
}) => {
  const { panel, worker, tabId, target, inspect, size } = fontzie;
  await inspect(".shadow-title");
  await panel.evaluate(() => {
    const state = window as typeof window & { observedMatchCount?: number };
    chrome.runtime.onMessage.addListener((message) => {
      if (
        message.channel === "fontzie-event" &&
        message.data?.type === "matches" &&
        message.data.selector === ".shadow-title"
      )
        state.observedMatchCount = message.data.count;
    });
  });
  const matchCount = () =>
    panel.evaluate(
      () =>
        (window as typeof window & { observedMatchCount?: number })
          .observedMatchCount,
    );
  await worker.evaluate(
    async (id) =>
      chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => {
          const global = globalThis as typeof globalThis & {
            fontzieDocumentScans?: number;
          };
          global.fontzieDocumentScans = 0;
          const original = document.querySelectorAll.bind(document);
          Object.defineProperty(document, "querySelectorAll", {
            configurable: true,
            value: (selector: string) => {
              if (selector === "*") global.fontzieDocumentScans!++;
              return original(selector);
            },
          });
        },
      }),
    tabId,
  );
  const documentScans = () =>
    worker.evaluate(
      async (id) =>
        (
          await chrome.scripting.executeScript({
            target: { tabId: id },
            func: () =>
              (
                globalThis as typeof globalThis & {
                  fontzieDocumentScans: number;
                }
              ).fontzieDocumentScans,
          })
        )[0]!.result,
      tabId,
    );
  await size("38");
  // Let the edit's deferred discovery finish before measuring DOM mutations.
  await expect.poll(documentScans).toBe(1);
  await worker.evaluate(
    async (id) =>
      chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => {
          (
            globalThis as typeof globalThis & { fontzieDocumentScans: number }
          ).fontzieDocumentScans = 0;
        },
      }),
    tabId,
  );
  await target.evaluate(() => {
    const host = document.createElement("div");
    host.id = "registry-added";
    host.attachShadow({ mode: "open" }).innerHTML =
      '<h2 class="shadow-title">Added root</h2>';
    document.body.append(host);
  });
  await expect(target.locator("#registry-added .shadow-title")).toHaveCSS(
    "font-size",
    "38px",
  );
  await expect.poll(matchCount).toBe(2);
  await target.evaluate(() => {
    const subtree = document.createElement("section");
    for (let index = 0; index < 1000; index++)
      subtree.append(document.createElement("span"));
    document.body.append(subtree);
    document.querySelector("#hero")!.classList.add("registry-change");
    document.querySelector("#registry-added")!.remove();
  });
  await expect.poll(matchCount).toBe(1);
  expect(await documentScans()).toBe(0);
  await target.evaluate(() => {
    const host = document.createElement("div");
    host.id = "registry-late";
    document.body.append(host);
  });
  await target.evaluate(
    () =>
      (document
        .querySelector("#registry-late")!
        .attachShadow({ mode: "open" }).innerHTML =
        '<h2 class="late-title">Late root</h2>'),
  );
  await inspect(".late-title");
  await size("41");
  await expect(target.locator("#registry-late .late-title")).toHaveCSS(
    "font-size",
    "41px",
  );
  await target.evaluate(() => {
    const host = document.createElement("div");
    host.id = "registry-nested";
    document.querySelector("#registry-late")!.shadowRoot!.append(host);
  });
  await inspect(".late-title");
  await target.evaluate(
    () =>
      (document
        .querySelector("#registry-late")!
        .shadowRoot!.querySelector("#registry-nested")!
        .attachShadow({ mode: "open" }).innerHTML =
        '<h2 class="nested-late-title">Nested late root</h2>'),
  );
  await inspect(".nested-late-title");
  await size("43");
  await expect(
    target.locator("#registry-late #registry-nested .nested-late-title"),
  ).toHaveCSS("font-size", "43px");
});
