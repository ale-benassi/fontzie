export const allWebsiteOrigins = ["http://*/*", "https://*/*"];

export function inspectableWebsite(url?: string): URL | undefined {
  if (!url || !URL.canParse(url)) return;
  const page = new URL(url);
  if (page.protocol !== "https:" && page.protocol !== "http:") return;
  if (
    page.hostname === "chromewebstore.google.com" ||
    (page.hostname === "chrome.google.com" &&
      /^\/webstore(?:\/|$)/.test(page.pathname))
  )
    return;
  return page;
}
