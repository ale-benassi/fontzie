import { radiusDeclarations } from "../core/ui-radii";
import type { Target } from "../core/schema";
import { targetQuery } from "../core/targets";
import { matches } from "./inspector";

export const MAX_HIGHLIGHT_OVERLAYS = 100;

/** A read-only preview: never changes inspection, rules, or page styles. */
export class TargetHighlight {
  private overlays = new Map<Element, HTMLDivElement>();
  private targets = new Map<Element, Target[]>();
  private visible = new Set<Element>();
  private animation = 0;
  private visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!this.targets.has(entry.target)) continue;
      if (entry.isIntersecting) this.visible.add(entry.target);
      else this.visible.delete(entry.target);
      if (!entry.target.isConnected) {
        this.visibility.unobserve(entry.target);
        this.targets.delete(entry.target);
      }
    }
    this.schedule();
  });
  private observer = new ResizeObserver(() => this.schedule());

  show(targets: Target[]) {
    this.clear();
    const matched = this.targets;
    try {
      for (const target of targets) {
        for (const element of matches(targetQuery(target))) {
          const related = matched.get(element) ?? [];
          related.push(target);
          matched.set(element, related);
        }
      }
    } catch {
      return; // Incomplete selector text has no hover preview.
    }
    for (const element of matched.keys()) this.visibility.observe(element);
    this.draw();
    window.addEventListener("scroll", this.schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", this.schedule, { passive: true });
  }

  private createOverlay(related: Target[]) {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-fontzie-ui", "");
    overlay.setAttribute("data-fontzie-highlight", "");
    overlay.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.setAttribute("data-fontzie-highlight-label", "");
    for (const [index, target] of related.entries()) {
      if (index) label.append(document.createTextNode(" · "));
      if (target.kind === "exact") {
        const icon = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("data-fontzie-exact-icon", "");
        icon.style.cssText =
          "all:initial!important;display:inline-block!important;width:12px!important;height:12px!important;vertical-align:-2px!important;margin-right:4px!important;fill:none!important;stroke:#fff!important;stroke-width:2!important;";
        const box = document.createElementNS(icon.namespaceURI, "path");
        box.setAttribute(
          "d",
          "M5 3H3v2M9 3h2M15 3h2M21 3v2M21 9v2M3 9v2M3 15v2M3 21h2M9 21h2M12 12l4 10 2-4 4-2Z",
        );
        icon.append(box);
        label.append(icon);
      }
      label.append(document.createTextNode(target.selector));
    }
    overlay.append(label);
    return overlay;
  }

  private schedule = () => {
    if (!this.animation) this.animation = requestAnimationFrame(this.draw);
  };

  private draw = () => {
    this.animation = 0;
    const measured: { element: Element; rect: DOMRect; related: Target[] }[] =
      [];
    for (const element of this.visible) {
      if (!element.isConnected) {
        this.visibility.unobserve(element);
        this.visible.delete(element);
        this.targets.delete(element);
        continue;
      }
      const related = this.targets.get(element);
      if (!related) continue;
      const rect = element.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < innerHeight &&
        rect.left < innerWidth
      )
        measured.push({ element, rect, related });
      if (measured.length === MAX_HIGHLIGHT_OVERLAYS) break;
    }
    // Finish geometry reads before creating, removing or positioning overlays.
    const keep = new Set(measured.map(({ element }) => element));
    for (const [element, overlay] of this.overlays) {
      if (keep.has(element)) continue;
      overlay.remove();
      this.observer.unobserve(element);
      this.overlays.delete(element);
    }
    for (const { element, rect, related } of measured) {
      let overlay = this.overlays.get(element);
      if (!overlay) {
        overlay = this.createOverlay(related);
        this.overlays.set(element, overlay);
        document.documentElement.append(overlay);
        this.observer.observe(element);
      }
      overlay.style.cssText = `all:initial!important;position:fixed!important;pointer-events:none!important;z-index:2147483647!important;display:block!important;left:${rect.left}px!important;top:${rect.top}px!important;width:${rect.width}px!important;height:${rect.height}px!important;outline:2px solid #3c3c3c!important;box-shadow:0 0 0 3px #fff!important;background:#3c3c3c14!important;box-sizing:border-box!important;`;
      const label = overlay.firstElementChild as HTMLSpanElement;
      const left = Math.max(4, Math.min(rect.left, innerWidth - 164));
      const top = Math.max(
        4,
        Math.min(
          rect.top >= 28 ? rect.top - 26 : Math.max(4, rect.top + 2),
          innerHeight - 26,
        ),
      );
      label.style.cssText = `all:initial!important;${radiusDeclarations}position:fixed!important;pointer-events:none!important;left:${left}px!important;top:${top}px!important;max-width:${Math.max(0, innerWidth - left - 4)}px!important;box-sizing:border-box!important;display:block!important;background:#3c3c3c!important;color:#fff!important;font:12px/18px monospace!important;padding:3px 6px!important;border-radius:var(--radius-sm)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;`;
    }
  };

  clear() {
    cancelAnimationFrame(this.animation);
    this.animation = 0;
    window.removeEventListener("scroll", this.schedule, true);
    window.removeEventListener("resize", this.schedule);
    this.observer.disconnect();
    this.visibility.disconnect();
    this.targets.clear();
    this.visible.clear();
    for (const overlay of this.overlays.values()) overlay.remove();
    this.overlays.clear();
  }
}
