import type { createQueue } from "../core/queue";
const styleIndex = (tabId: number) => `css-frames:${tabId}`;
function indexedFrames(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((id): id is number => Number.isInteger(id) && id >= 0)
    : [];
}
async function storageKeys(area: chrome.storage.StorageArea) {
  // Chrome 120–129 have no getKeys. The fallback runs only during migration/startup.
  return typeof area.getKeys === "function"
    ? area.getKeys()
    : Object.keys(await area.get(null));
}
export async function indexLegacyStyles() {
  const marker = "migration:css-frame-index:v1";
  if ((await chrome.storage.local.get(marker))[marker]) return;
  const entries = new Map<number, Set<number>>();
  for (const area of [chrome.storage.local, chrome.storage.session]) {
    for (const key of await storageKeys(area)) {
      const match = /^css:(\d+):(\d+)$/.exec(key);
      if (!match) continue;
      const tab = Number(match[1]);
      if (!entries.has(tab)) entries.set(tab, new Set());
      entries.get(tab)!.add(Number(match[2]));
    }
  }
  await chrome.storage.local.set({
    ...Object.fromEntries(
      [...entries].map(([tab, ids]) => [styleIndex(tab), [...ids]]),
    ),
    [marker]: true,
  });
}
export async function removeTabStyles(tabId: number) {
  const index = styleIndex(tabId);
  const frames = indexedFrames((await chrome.storage.local.get(index))[index]);
  const keys = frames.map((id) => `css:${tabId}:${id}`);
  await Promise.all([
    chrome.storage.local.remove([index, ...keys]),
    chrome.storage.session.remove([
      `tab:${tabId}`,
      `frames:${tabId}`,
      `floating:${tabId}`,
      ...keys,
    ]),
  ]);
}
export async function clearClosedDocumentStyles() {
  const keys = await storageKeys(chrome.storage.local);
  await chrome.storage.local.remove(
    keys.filter(
      (key) => key.startsWith("css:") || key.startsWith("css-frames:"),
    ),
  );
}
export async function applyOwnedCSS(
  sender: chrome.runtime.MessageSender,
  css: string,
  serial: ReturnType<typeof createQueue>,
) {
  const tabId = sender.tab!.id!,
    frameId = sender.frameId ?? 0;
  if (typeof css !== "string" || css.length > 500000)
    throw Error("Stylesheet is too large.");
  return serial(`css:${tabId}`, async () => {
    const key = `css:${tabId}:${frameId}`;
    const index = styleIndex(tabId);
    const stored = await chrome.storage.local.get([key, index]);
    // USER styles survive extension reloads, but storage.session does not.
    // Keep their ownership durable so comparison/reset can remove them.
    // Fall back to the old session entry during the first live upgrade.
    const old = (stored[key] ??
      (await chrome.storage.session.get(key))[key]) as
      { css: string; documentId: string } | undefined;
    if (old?.documentId === sender.documentId && old?.css === css) {
      if (!stored[key]) {
        await chrome.storage.local.set({
          [key]: old,
          [index]: [...new Set([...indexedFrames(stored[index]), frameId])],
        });
        await chrome.storage.session.remove(key);
      }
      return true;
    }
    if (!old && !css) return true;
    if (css)
      await chrome.scripting.insertCSS({
        target: sender.documentId
          ? { tabId, documentIds: [sender.documentId] }
          : { tabId, frameIds: [frameId] },
        css: css,
        origin: "USER",
      });
    if (old?.css && old.documentId === sender.documentId)
      await chrome.scripting.removeCSS({
        target: { tabId, frameIds: [frameId] },
        css: old.css,
        origin: "USER",
      });
    const frames = indexedFrames(stored[index]);
    if (css) {
      await chrome.storage.local.set({
        [key]: { css, documentId: sender.documentId },
        ...(!frames.includes(frameId) && { [index]: [...frames, frameId] }),
      });
    } else {
      await chrome.storage.local.remove(key);
      await chrome.storage.local.set({
        [index]: frames.filter((id) => id !== frameId),
      });
    }
    await chrome.storage.session.remove(key);
    return true;
  });
}
