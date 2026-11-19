import { ConfigProvider } from "reka-ui";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createApp, h } from "vue";
import App from "./App.vue";
import LocalFontsSetup from "../../components/LocalFontsSetup.vue";
import "./style.css";

import { radiusTokens } from "../../core/ui-radii";
import { initializeCardState } from "../../storage/card-state";
for (const [name, value] of Object.entries(radiusTokens))
  document.documentElement.style.setProperty(name, value);
const localSetup =
  new URLSearchParams(location.search).get("local-fonts") === "setup";
const fontStyles = document.createElement("link");
fontStyles.rel = "stylesheet";
fontStyles.href = chrome.runtime.getURL("fonts/ui-fonts.css");
document.head.append(fontStyles);
if (!localSetup) await initializeCardState();
createApp({
  render: () =>
    h(
      ConfigProvider,
      // CSS reserves the scrollbar gutter; a second padding compensation shifts
      // the editor when a modal menu or dialog locks background scrolling.
      { scrollBody: { padding: 0, margin: 0 } },
      {
        default: () =>
          h(
            TooltipProvider,
            { delayDuration: 400 },
            { default: () => h(localSetup ? LocalFontsSetup : App) },
          ),
      },
    ),
}).mount("#app");
