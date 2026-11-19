import { selectorSchema, type Inspection } from "../core/schema";
import type { PickLocation } from "../core/messages";
import { radiusDeclarations } from "../core/ui-radii";
import { randomToken } from "../core/random-token";
export const properties = [
  "font-family",
  "font-weight",
  "font-size",
  "line-height",
  "letter-spacing",
  "font-style",
  "text-transform",
  "text-decoration",
  "text-align",
  "font-stretch",
  "font-optical-sizing",
  "font-variant-ligatures",
  "font-feature-settings",
  "font-variation-settings",
];
export { roots } from "./roots";
import { roots } from "./roots";
export function matches(selector: string) {
  return roots()
    .flatMap((r) => [...r.querySelectorAll(selector)])
    .filter((el) => !el.closest("[data-fontzie-ui]"));
}
export function selectorFor(el: Element): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  if (el.id) return "#" + CSS.escape(el.id);
  const classes = [...el.classList].filter(
    (c) => !c.startsWith("fontzie") && !/\d{5,}/.test(c),
  );
  for (const c of classes) {
    const s = "." + CSS.escape(c);
    if (root.querySelectorAll(s).length === 1) return s;
  }
  if (classes.length)
    return (
      el.localName +
      classes
        .slice(0, 2)
        .map((c) => "." + CSS.escape(c))
        .join("")
    );
  const parts: string[] = [];
  let current: Element | null = el;
  for (let i = 0; current && i < 5; i++, current = current.parentElement) {
    let s = current.localName;
    if (current.id) {
      parts.unshift("#" + CSS.escape(current.id));
      break;
    }
    if (current.parentElement) {
      const siblings = [...current.parentElement.children].filter(
        (x) => x.localName === current!.localName,
      );
      if (siblings.length > 1)
        s += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(s);
    if (root.querySelectorAll(parts.join(" > ")).length === 1) break;
  }
  return parts.join(" > ");
}

function uniquePickSelector(el: Element) {
  const root = el.getRootNode() as Document | ShadowRoot;
  const unique = (selector: string) => {
    if (!selectorSchema.safeParse(selector).success) return false;
    const found = root.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  };
  const label = selectorFor(el);
  // An ordinal can identify a different sibling as soon as a list reorders.
  const base = label.includes(":nth-of-type(")
    ? CSS.escape(el.localName)
    : label;
  if (unique(base)) return base;
  const ancestors: Element[] = [];
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    ancestors.push(parent);
    if (parent.id) {
      const scoped = `#${CSS.escape(parent.id)} ${base}`;
      if (unique(scoped)) return scoped;
    }
  }
  for (const parent of ancestors) {
    const anchor = selectorFor(parent);
    if (anchor.includes(":nth-of-type(")) continue;
    const scoped = `${anchor} ${base}`;
    if (unique(scoped)) return scoped;
  }
}

function locatePick(el: Element): PickLocation | undefined {
  if (!el.isConnected || el.ownerDocument !== document) return;
  const selector = uniquePickSelector(el);
  if (!selector) return;
  const shadowHosts: string[] = [];
  for (
    let root = el.getRootNode();
    root instanceof ShadowRoot;
    root = root.host.getRootNode()
  ) {
    const host = uniquePickSelector(root.host);
    if (!host) return;
    shadowHosts.unshift(host);
  }
  return shadowHosts.length ? { selector, shadowHosts } : { selector };
}
export function pointerTarget(target: Element, x: number, y: number): Element {
  const containsPoint = (element: Element) =>
    [...element.getClientRects()].some(
      (rect) =>
        x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom,
    );
  if (containsPoint(target)) return target;
  // A stretched pseudo-element can receive the hover for a whole card while
  // its button occupies only the title. Pick the content beneath that layer.
  const root = target.getRootNode();
  const surface = root instanceof ShadowRoot ? root : target.ownerDocument;
  const candidateIn = (surface: Document | ShadowRoot) =>
    surface.elementsFromPoint(x, y).find(
      (element) =>
        // ShadowRoot hit tests also include hosts and document ancestors.
        (element.getRootNode() === surface ||
          (surface instanceof ShadowRoot &&
            element !== surface.host &&
            surface.host.contains(element))) &&
        !element.closest("[data-fontzie-ui]") &&
        containsPoint(element),
    );
  let candidate = candidateIn(surface);
  while (candidate?.shadowRoot) {
    const inner = candidateIn(candidate.shadowRoot);
    if (!inner) break;
    candidate = inner;
  }
  return candidate ?? target;
}
export class Inspector {
  private overlay?: HTMLDivElement;
  private label?: HTMLSpanElement;
  private overlayStyle = "";
  private cursorBadge?: HTMLSpanElement;
  private badgeSize?: { width: number; height: number };
  private pointer?: { x: number; y: number };
  private hover?: Element;
  private animation = 0;
  private highlightDirty = false;
  private active = false;
  private handles = new WeakMap<Element, string>();
  private marked = new Map<string, WeakRef<Element>>();
  private finalized = new FinalizationRegistry<string>((handle) => {
    this.marked.delete(handle);
  });
  constructor(
    private onSelection: (i: Inspection) => void,
    private onCancel: () => void,
  ) {}
  locatePicks(handles: string[]) {
    const locations: Record<string, PickLocation> = {};
    for (const handle of new Set(handles)) {
      const element = this.marked.get(handle)?.deref();
      const location = element && locatePick(element);
      if (location) locations[handle] = location;
    }
    return { locations };
  }
  inspect(el: Element): Inspection {
    let handle = this.handles.get(el);
    if (!handle) {
      handle = randomToken();
      this.handles.set(el, handle);
      this.marked.set(handle, new WeakRef(el));
      this.finalized.register(el, handle, el);
      el.setAttribute(
        "data-fontzie-target",
        [el.getAttribute("data-fontzie-target"), handle]
          .filter(Boolean)
          .join(" "),
      );
    }
    const c = getComputedStyle(el);
    const root = el.getRootNode();
    const parent =
      el.assignedSlot ??
      el.parentElement ??
      (root instanceof ShadowRoot ? root.host : undefined);
    const rootFontSize = parseFloat(
      getComputedStyle(el.ownerDocument.documentElement).fontSize,
    );
    const parentFontSize = parent
      ? parseFloat(getComputedStyle(parent).fontSize)
      : 16;
    const b = el.getBoundingClientRect();
    return {
      handle,
      selector: selectorFor(el),
      tag: el.localName,
      classes: [...el.classList],
      identity:
        el.localName +
        (el.id
          ? "#" + el.id
          : [...el.classList]
              .slice(0, 2)
              .map((x) => "." + x)
              .join("")),
      width: Math.round(b.width),
      height: Math.round(b.height),
      computed: Object.fromEntries(
        properties.map((p) => [p, c.getPropertyValue(p)]),
      ),
      // The root's own relative font-size uses the browser's initial font
      // size, not its resulting computed size. Leave that context unavailable
      // rather than multiplying the already-applied root size a second time.
      ...(el !== el.ownerDocument.documentElement &&
      rootFontSize > 0 &&
      parentFontSize > 0
        ? { typographyContext: { rootFontSize, parentFontSize } }
        : {}),
      frameId: 0,
      url: location.href,
    };
  }
  private draw = (el: Element) => {
    if (!this.overlay) {
      this.overlay = document.createElement("div");
      this.overlay.setAttribute("data-fontzie-ui", "");
      this.overlay.setAttribute("aria-hidden", "true");
      this.label = document.createElement("span");
      this.label.style.cssText =
        "position:absolute!important;left:0!important;top:0!important;background:#3c3c3c!important;color:#fff!important;font:12px/1.5 monospace!important;padding:3px 6px!important;white-space:nowrap!important;border-radius:var(--radius-sm) 0 var(--radius-sm) 0!important;";
      this.overlay.append(this.label);
      document.documentElement.append(this.overlay);
    }
    const b = el.getBoundingClientRect();
    const style = `${radiusDeclarations}position:fixed!important;pointer-events:none!important;z-index:2147483647!important;inset:auto!important;left:${b.left}px!important;top:${b.top}px!important;width:${b.width}px!important;height:${b.height}px!important;outline:2px solid #3c3c3c!important;box-shadow:0 0 0 3px #fff!important;background:#3c3c3c14!important;box-sizing:border-box!important;border-radius:var(--radius-sm)!important;`;
    if (style !== this.overlayStyle) {
      this.overlay.style.cssText = style;
      this.overlayStyle = style;
    }
    const text = `${el.localName}${el.id ? "#" + el.id : ""} · ${Math.round(b.width)} × ${Math.round(b.height)}`;
    if (this.label && this.label.textContent !== text)
      this.label.textContent = text;
  };
  private refresh = () => {
    this.highlightDirty = true;
    this.schedule();
  };
  private resize = () => {
    this.badgeSize = undefined;
    this.refresh();
  };
  private schedule() {
    if (this.active && !this.animation)
      this.animation = requestAnimationFrame(this.paint);
  }
  private paint = () => {
    this.animation = 0;
    if (!this.active) return;
    if (this.highlightDirty) {
      this.highlightDirty = false;
      if (this.hover?.isConnected) this.draw(this.hover);
      else {
        this.overlay?.remove();
        this.overlay = undefined;
        this.overlayStyle = "";
        this.label = undefined;
        this.hover = undefined;
      }
    }
    this.drawCursor();
  };
  private drawCursor() {
    if (!this.pointer) return;
    if (!this.cursorBadge) {
      this.cursorBadge = document.createElement("span");
      this.cursorBadge.setAttribute("data-fontzie-ui", "");
      this.cursorBadge.setAttribute("data-fontzie-cursor", "");
      this.cursorBadge.setAttribute("aria-hidden", "true");
      this.cursorBadge.textContent = "Picking";
      // Isolate the badge from website styles and let clicks reach the candidate.
      this.cursorBadge.style.cssText = `all:initial!important;${radiusDeclarations}position:fixed!important;left:0!important;top:0!important;will-change:transform!important;pointer-events:none!important;z-index:2147483647!important;display:block!important;padding:3px 7px!important;border:1px solid #fff!important;border-radius:var(--radius-sm)!important;background:#3c3c3c!important;color:#fff!important;font:500 12px/18px system-ui,sans-serif!important;white-space:nowrap!important;`;
      document.documentElement.append(this.cursorBadge);
    }
    // Measure on entry/resize only; pointer movement must not force page layout.
    this.badgeSize ??= this.cursorBadge.getBoundingClientRect();
    const { width, height } = this.badgeSize;
    const { x, y } = this.pointer;
    const left = x + width + 22 <= innerWidth ? x + 14 : x - width - 14;
    const top = y + height + 26 <= innerHeight ? y + 18 : y - height - 10;
    this.cursorBadge.style.setProperty(
      "transform",
      `translate3d(${Math.max(4, left)}px, ${Math.max(4, top)}px, 0)`,
      "important",
    );
  }
  private hideCursor = () => {
    this.pointer = undefined;
    this.cursorBadge?.remove();
    this.cursorBadge = undefined;
    this.badgeSize = undefined;
  };
  private leave = (e: MouseEvent) => {
    if (!e.relatedTarget) this.hideCursor();
  };
  private move = (e: MouseEvent) => {
    const path = e.composedPath();
    const target = path.find(
      (x) => x instanceof Element && !x.closest("[data-fontzie-ui]"),
    ) as Element | undefined;
    const el = target ? pointerTarget(target, e.clientX, e.clientY) : undefined;
    if (
      el &&
      el.localName !== "iframe" &&
      el.localName !== "frame" &&
      !path.some(
        (node) =>
          node instanceof Element && node.hasAttribute("data-fontzie-ui"),
      )
    ) {
      this.pointer = { x: e.clientX, y: e.clientY };
      this.schedule();
    } else this.hideCursor();
    // Keep click ownership current even before the next animation frame paints.
    if (el) {
      this.hover = el;
      this.refresh();
    }
  };
  private click = (e: MouseEvent) => {
    if (!this.active || !this.hover) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const el = this.hover;
    this.stop();
    this.onSelection(this.inspect(el));
  };
  private key = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      this.stop();
      this.onCancel();
    } else if (
      e.key === "Enter" &&
      document.activeElement instanceof Element &&
      document.activeElement !== document.body
    ) {
      this.hover = document.activeElement;
      this.click(e as unknown as MouseEvent);
    }
  };
  start() {
    this.stop();
    this.active = true;
    document.addEventListener("mousemove", this.move, true);
    document.addEventListener("mouseout", this.leave, true);
    window.addEventListener("blur", this.hideCursor);
    document.addEventListener("click", this.click, true);
    document.addEventListener("keydown", this.key, true);
    window.addEventListener("scroll", this.refresh, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", this.resize, { passive: true });
  }
  stop() {
    this.active = false;
    cancelAnimationFrame(this.animation);
    this.animation = 0;
    this.highlightDirty = false;
    document.removeEventListener("mousemove", this.move, true);
    document.removeEventListener("mouseout", this.leave, true);
    window.removeEventListener("blur", this.hideCursor);
    document.removeEventListener("click", this.click, true);
    document.removeEventListener("keydown", this.key, true);
    window.removeEventListener("scroll", this.refresh, true);
    window.removeEventListener("resize", this.resize);
    this.hover = undefined;
    this.overlay?.remove();
    this.overlay = undefined;
    this.overlayStyle = "";
    this.label = undefined;
    this.hideCursor();
  }
  dispose() {
    this.stop();
    for (const [handle, reference] of this.marked) {
      const el = reference.deref();
      if (!el) continue;
      this.finalized.unregister(el);
      const values = (el.getAttribute("data-fontzie-target") ?? "")
        .split(" ")
        .filter((v) => v !== handle);
      if (values.length)
        el.setAttribute("data-fontzie-target", values.join(" "));
      else el.removeAttribute("data-fontzie-target");
    }
    this.handles = new WeakMap();
    this.marked.clear();
  }
}
