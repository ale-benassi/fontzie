import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pointerTarget } from "../../content/inspector";

class ShadowSurface {
  host?: Element;
  elementsFromPoint = vi.fn<() => Element[]>(() => []);
}
const documentSurface = {
  elementsFromPoint: vi.fn<() => Element[]>(() => []),
};

beforeEach(() => {
  vi.stubGlobal("ShadowRoot", ShadowSurface);
  documentSurface.elementsFromPoint.mockReset().mockReturnValue([]);
});
afterEach(() => vi.unstubAllGlobals());

function element(
  boxes: [left: number, top: number, right: number, bottom: number][],
  {
    ui = false,
    root = documentSurface,
    shadowRoot = null,
  }: { ui?: boolean; root?: object; shadowRoot?: ShadowSurface | null } = {},
) {
  // Only the browser's geometry and hit-testing surface is needed here.
  return {
    getClientRects: () =>
      boxes.map(([left, top, right, bottom]) => ({ left, top, right, bottom })),
    closest: () => (ui ? {} : null),
    getRootNode: () => root,
    shadowRoot,
    contains: () => false,
    ownerDocument: documentSurface,
  } as unknown as Element;
}

it("preserves a normal pointer target without searching beneath it", () => {
  const button = element([[10, 10, 200, 40]]);
  expect(pointerTarget(button, 50, 20)).toBe(button);
  expect(documentSurface.elementsFromPoint).not.toHaveBeenCalled();
});

it("picks content beneath a button's stretched click layer", () => {
  const button = element([[10, 10, 200, 40]]);
  const content = element([[10, 50, 200, 100]]);
  const card = element([[0, 0, 220, 120]]);
  documentSurface.elementsFromPoint.mockReturnValue([button, content, card]);
  expect(pointerTarget(button, 50, 70)).toBe(content);
});

it("skips Fontzie UI and other stretched layers above the content", () => {
  const button = element([[10, 10, 200, 40]]);
  const overlay = element([[0, 0, 220, 120]], { ui: true });
  const otherLayer = element([[10, 10, 200, 40]]);
  const content = element([[10, 50, 200, 100]]);
  documentSurface.elementsFromPoint.mockReturnValue([
    overlay,
    button,
    otherLayer,
    content,
  ]);
  expect(pointerTarget(button, 50, 70)).toBe(content);
});

it("uses individual line boxes so gaps in multiline links can be picked", () => {
  const link = element([
    [0, 0, 200, 20],
    [0, 40, 100, 60],
  ]);
  const content = element([[0, 20, 200, 40]]);
  documentSurface.elementsFromPoint.mockReturnValue([link, content]);
  expect(pointerTarget(link, 50, 45)).toBe(link);
  expect(pointerTarget(link, 50, 30)).toBe(content);
});

it("searches within the target's shadow root", () => {
  const shadow = new ShadowSurface();
  const button = element([[10, 10, 200, 40]], { root: shadow });
  const content = element([[10, 50, 200, 100]], { root: shadow });
  shadow.elementsFromPoint.mockReturnValue([button, content]);
  expect(pointerTarget(button, 50, 70)).toBe(content);
  expect(documentSurface.elementsFromPoint).not.toHaveBeenCalled();
});

it("reaches covered content through nested open shadow roots", () => {
  const outer = new ShadowSurface();
  const inner = new ShadowSurface();
  const button = element([[10, 10, 200, 40]]);
  const host = element([[0, 50, 220, 120]], { shadowRoot: outer });
  outer.host = host;
  const nested = element([[0, 50, 220, 120]], {
    root: outer,
    shadowRoot: inner,
  });
  const paragraph = element([[10, 50, 200, 100]], { root: inner });
  inner.host = nested;
  documentSurface.elementsFromPoint.mockReturnValue([button, host]);
  // Chrome also includes hosts and ancestors from outside the queried root.
  outer.elementsFromPoint.mockReturnValue([button, nested, host]);
  inner.elementsFromPoint.mockReturnValue([button, paragraph, nested, host]);

  expect(pointerTarget(button, 50, 70)).toBe(paragraph);
});

it("keeps the host when a shadow lookup only returns outside ancestors and Fontzie UI", () => {
  const shadow = new ShadowSurface();
  const button = element([[10, 10, 200, 40]]);
  const host = element([[0, 50, 220, 120]], { shadowRoot: shadow });
  shadow.host = host;
  const overlay = element([[0, 50, 220, 120]], { root: shadow, ui: true });
  documentSurface.elementsFromPoint.mockReturnValue([button, host]);
  shadow.elementsFromPoint.mockReturnValue([overlay, host]);

  expect(pointerTarget(button, 50, 70)).toBe(host);
  expect(shadow.elementsFromPoint).toHaveBeenCalledOnce();
});

it("preserves rendered light DOM content assigned into a shadow slot", () => {
  const shadow = new ShadowSurface();
  const button = element([[10, 10, 200, 40]], { root: shadow });
  const paragraph = element([[10, 50, 200, 100]]);
  const host = element([[0, 0, 220, 120]], { shadowRoot: shadow });
  host.contains = (candidate) => candidate === paragraph;
  shadow.host = host;
  shadow.elementsFromPoint.mockReturnValue([button, paragraph, host]);

  expect(pointerTarget(button, 50, 70)).toBe(paragraph);
});

it("retains the original target when no underlying element qualifies", () => {
  const button = element([[10, 10, 200, 40]]);
  documentSurface.elementsFromPoint.mockReturnValue([button]);
  expect(pointerTarget(button, 50, 70)).toBe(button);
});
