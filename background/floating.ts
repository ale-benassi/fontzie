import { draftKey } from "../storage/drafts";
import { dismissFloatingEditor } from "../content/dismiss-floating-editor";
export function createFloatingService() {
  async function hideFloating(tabId: number) {
    await chrome.storage.session.remove(`floating:${tabId}`);
    await chrome.scripting.executeScript({
      target: { tabId },
      func: dismissFloatingEditor,
    });
  }
  async function showFloating(tabId: number) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["floating.js"],
    });
    const result = await chrome.tabs.sendMessage(
      tabId,
      { channel: "fontzie-floating", action: "show", tabId },
      { frameId: 0 },
    );
    if (!result?.ok)
      throw Error(result?.error ?? "Could not open the floating editor.");
    const tab = await chrome.tabs.get(tabId);
    if (tab.url)
      await chrome.storage.session.set({
        [`floating:${tabId}`]: draftKey(tab.url),
      });
  }

  return { hideFloating, showFloating };
}
