import { engineCSS, quote } from "../core/css";
import { emptyConfig, type Config } from "../core/schema";
import { alias, fontRequest, fontRequestKey } from "../core/fonts";
import { forEachConcurrent } from "../core/concurrency";
import {
  loadFont,
  retainFontFamilies,
  releaseFontFamilies,
  clearLoadedFonts,
  pruneCustomFonts,
} from "../providers/load";
import { watchRoots } from "./roots";
import { roots, matches } from "./inspector";
import { ruleTargets, targetQuery } from "../core/targets";
export class Engine {
  config: Config = emptyConfig();
  private sheets = new Map<ShadowRoot, CSSStyleSheet>();
  private stopRootWatch?: () => void;
  async apply(config: Config, frameId: number) {
    for (const r of config.rules.filter(
      (r) => r.frameId === frameId && r.selector,
    )) {
      document.querySelectorAll(r.selector);
      for (const [property, value] of Object.entries(r.properties))
        if (!CSS.supports(property, value!))
          throw Error(`Unsupported value for ${property}.`);
      if (
        r.enabled &&
        ruleTargets(r).some(
          (target) =>
            target.kind === "exact" &&
            (!target.handle || !matches(targetQuery(target)).length),
        )
      )
        throw Error(
          "This picked element is no longer available. Pick it again on the current page.",
        );
    }
    const activeFonts = (value: Config) =>
      value.rules
        .filter((rule) => rule.enabled && rule.frameId === frameId && rule.font)
        .map((rule) => rule.font!.id);
    retainFontFamilies(this, [
      ...activeFonts(this.config),
      ...activeFonts(config),
    ]);
    try {
      const effective = structuredClone(config);
      const fonts = new Map<string, ReturnType<typeof fontRequest>>();
      if (config.preview) {
        for (const r of effective.rules.filter(
          (r) => r.enabled && r.frameId === frameId && r.font,
        )) {
          if (r.font!.provider === "system" || r.font!.provider === "local")
            continue;
          const request = fontRequest(r);
          fonts.set(fontRequestKey(request), request);
          if (r.properties["font-family"])
            r.properties["font-family"] =
              `${quote(alias(r.font!.id))}, ${r.properties["font-family"]}`;
        }
        await forEachConcurrent([...fonts.values()], (request) =>
          loadFont(request, "content"),
        );
      }
      const css = engineCSS(effective, frameId);
      const result = await chrome.runtime.sendMessage({
        channel: "fontzie-content",
        type: "css",
        css,
      });
      if (!result.ok) throw Error(result.error);
      pruneCustomFonts(
        new Set(
          config.rules
            .filter((r) => r.font?.provider === "custom")
            .map((r) => alias(r.font!.id)),
        ),
      );
      this.config = structuredClone(config);
      this.shadowCSS = css;
      this.refreshRoots();
      if (css && !this.stopRootWatch)
        this.stopRootWatch = watchRoots(() => this.refreshRoots());
      if (!css) {
        this.stopRootWatch?.();
        this.stopRootWatch = undefined;
      }
    } finally {
      retainFontFamilies(this, activeFonts(this.config));
    }
  }
  private shadowCSS = "";
  private refreshRoots() {
    for (const root of roots()) {
      if (!(root instanceof ShadowRoot)) continue;
      let sheet = this.sheets.get(root);
      if (!this.shadowCSS) {
        if (sheet)
          root.adoptedStyleSheets = root.adoptedStyleSheets.filter(
            (x) => x !== sheet,
          );
        this.sheets.delete(root);
        continue;
      }
      if (!sheet) {
        sheet = new CSSStyleSheet();
        this.sheets.set(root, sheet);
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      }
      sheet.replaceSync(this.shadowCSS);
    }
    for (const [root, sheet] of this.sheets)
      if (!root.host.isConnected) {
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter(
          (x) => x !== sheet,
        );
        this.sheets.delete(root);
      }
  }
  dispose() {
    this.stopRootWatch?.();
    this.stopRootWatch = undefined;
    for (const [root, sheet] of this.sheets)
      root.adoptedStyleSheets = root.adoptedStyleSheets.filter(
        (x) => x !== sheet,
      );
    this.sheets.clear();
    releaseFontFamilies(this);
    clearLoadedFonts();
  }
}
