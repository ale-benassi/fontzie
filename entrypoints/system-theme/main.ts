// A spanning extension's side panel can inherit the dark Incognito window.
const media = matchMedia("(prefers-color-scheme: dark)");
const editors = new Set<chrome.runtime.Port>();
chrome.runtime.onConnect.addListener((port) => {
  if (
    port.name !== "fontzie:system-theme" ||
    port.sender?.url?.split(/[?#]/)[0] !==
      chrome.runtime.getURL("sidepanel.html")
  )
    return;
  editors.add(port);
  const publish = () => port.postMessage(media.matches);
  port.onDisconnect.addListener(() => {
    editors.delete(port);
    media.removeEventListener("change", publish);
    if (!editors.size) window.close();
  });
  media.addEventListener("change", publish);
  publish();
});
