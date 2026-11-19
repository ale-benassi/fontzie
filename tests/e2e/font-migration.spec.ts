import { test, expect } from "./fixtures/extension";
import { alias } from "../../core/fonts";
test.use({ legacyFont: true });
test("existing custom files migrate to separate metadata and remain usable", async ({
  fontzie,
}) => {
  const { panel, target } = fontzie;
  const stored = await panel.evaluate(async () => {
    const request = indexedDB.open("fontzie-fonts", 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(["faces", "binaries"], "readonly");
    const read = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const metadata = await read(transaction.objectStore("faces").get("legacy"));
    const bytes = (await read(
      transaction.objectStore("binaries").get("legacy"),
    )) as ArrayBuffer;
    database.close();
    return { version: database.version, metadata, size: bytes.byteLength };
  });
  expect(stored.version).toBe(2);
  expect(stored.metadata).not.toHaveProperty("bytes");
  expect(stored.metadata.size).toBe(stored.size);
  expect(stored.size).toBeGreaterThan(12);
  await fontzie.inspect("#hero");
  await panel
    .getByRole("group", { name: "Font provider" })
    .getByRole("button", { name: "Custom", exact: true })
    .click();
  await panel
    .locator(".font-choice")
    .filter({ has: panel.getByText("Legacy fixture", { exact: true }) })
    .click();
  await expect(target.locator("#hero")).toHaveCSS(
    "font-family",
    new RegExp(alias("custom:Legacy fixture")),
  );
  await expect
    .poll(() =>
      target.evaluate(
        (family) =>
          [...document.fonts].some(
            (face) => face.family === family && face.status === "loaded",
          ),
        alias("custom:Legacy fixture"),
      ),
    )
    .toBe(true);
});
