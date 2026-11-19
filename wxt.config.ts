import { defineConfig } from "wxt";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import tailwindcss from "@tailwindcss/vite";
import { allWebsiteOrigins } from "./core/site-access";
const iconRevision = createHash("sha256")
  .update(readFileSync(resolve("public/icons/fontzie-mark-badge.svg")))
  .digest("hex")
  .slice(0, 12);
const extensionIcons = {
  16: `icons/fontzie-mark-badge-${iconRevision}-16.png`,
  32: `icons/fontzie-mark-badge-${iconRevision}-32.png`,
  48: `icons/fontzie-mark-badge-${iconRevision}-48.png`,
  128: `icons/fontzie-mark-badge-${iconRevision}-128.png`,
};
export default defineConfig({
  modules: ["@wxt-dev/module-vue"],
  // Keep the installed unpacked extension's path (and therefore its identity).
  // Stop dev before building: both modes intentionally use the same directory.
  outDirTemplate: "{{browser}}-mv{{manifestVersion}}",
  zip: {
    exclude: [
      "branding/fontzie-mark.svg",
      "branding/fontzie-wordmark.svg",
      "icons/fontzie-mark-badge.svg",
    ],
  },
  // WXT 0.21.4's installed types and runner use `disabled`, not `enabled`.
  webExt: { disabled: true },
  dev: {
    server: {
      host: "127.0.0.1",
      origin: "http://127.0.0.1:3000",
      port: 3000,
      strictPort: true,
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
  hooks: {
    "build:publicAssets": (wxt, files) => {
      files.push({
        absoluteSrc: resolve(wxt.config.root, "LICENSE"),
        relativeDest: "licenses/Fontzie.txt",
      });
      for (const provider of ["google", "fontshare"])
        files.push({
          absoluteSrc: resolve(wxt.config.root, `catalogs/${provider}.json`),
          relativeDest: `catalogs/${provider}.json`,
        });
    },
  },
  manifest: ({ command }) => ({
    name: "Fontzie",
    homepage_url: "https://fontzie.app/",
    description:
      "Try type on. A private typography playground for live websites.",
    minimum_chrome_version: "120",
    permissions: ["activeTab", "scripting", "storage", "sidePanel"],
    host_permissions: [
      "https://fonts.googleapis.com/*",
      "https://fonts.gstatic.com/*",
      "https://cdn.fontshare.com/*",
    ],
    optional_host_permissions: allWebsiteOrigins,
    web_accessible_resources: [
      { resources: ["sidepanel.html"], matches: ["http://*/*", "https://*/*"] },
    ],
    action: { default_title: "Open Fontzie", default_icon: extensionIcons },
    icons: extensionIcons,
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; font-src 'self' data: blob: https://fonts.gstatic.com https://cdn.fontshare.com; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.fontshare.com" +
        (command === "serve"
          ? " http://127.0.0.1:3000 ws://127.0.0.1:3000"
          : ""),
    },
  }),
});
