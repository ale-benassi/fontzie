import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  MAX_HIGHLIGHT_OVERLAYS,
  TargetHighlight,
} from "../../content/highlight";

const { matched } = vi.hoisted(() => ({ matched: [] as Element[] }));
vi.mock("../../content/inspector", () => ({ matches: () => matched }));
let visible: IntersectionObserverCallback;
let highlight: TargetHighlight;
let boxes: Set<Box>;
let operations: string[];
let frames: Map<number, FrameRequestCallback>;
class Box {
  children: unknown[] = [];
  style = {
    set cssText(_value: string) {
      operations.push("write");
    },
  };
  get firstElementChild() {
    return this.children[0];
  }
  setAttribute() {}
  append(value: unknown) {
    this.children.push(value);
  }
  remove() {
    boxes.delete(this);
    operations.push("write");
  }
}
function target(index: number) {
  return {
    isConnected: true,
    getBoundingClientRect: () => {
      operations.push(`read:${index}`);
      return {
        width: 100,
        height: 20,
        left: 10,
        right: 110,
        top: 10,
        bottom: 30,
      };
    },
  } as unknown as Element;
}
function intersect(elements: Element[], isIntersecting: boolean) {
  visible(
    elements.map((target) => ({
      target,
      isIntersecting,
    })) as IntersectionObserverEntry[],
    {} as IntersectionObserver,
  );
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(0));
}
beforeEach(() => {
  matched.length = 0;
  boxes = new Set();
  operations = [];
  frames = new Map();
  let frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        visible = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("document", {
    createElement: () => new Box(),
    createTextNode: (text: string) => ({ text }),
    documentElement: {
      append: (box: Box) => {
        operations.push("write");
        boxes.add(box);
      },
    },
  });
  highlight = new TargetHighlight();
});
afterEach(() => {
  highlight.clear();
  vi.unstubAllGlobals();
});

it("renders only visible matches, caps broad targets, and reads geometry before writes", () => {
  matched.push(...Array.from({ length: 2000 }, (_, index) => target(index)));
  highlight.show([{ kind: "selector", selector: "body *" }]);
  expect(boxes.size).toBe(0);
  intersect(matched.slice(0, 150), true);
  expect(boxes.size).toBe(MAX_HIGHLIGHT_OVERLAYS);
  const firstWrite = operations.indexOf("write");
  expect(operations.slice(0, firstWrite)).toHaveLength(MAX_HIGHLIGHT_OVERLAYS);
  expect(
    operations
      .slice(firstWrite)
      .some((operation) => operation.startsWith("read:")),
  ).toBe(false);
  intersect(matched.slice(0, 150), false);
  expect(boxes.size).toBe(0);
  intersect(matched.slice(1000, 1005), true);
  expect(boxes.size).toBe(5);
  highlight.clear();
  expect(boxes.size).toBe(0);
  expect(frames.size).toBe(0);
});

it("cleans detached targets and replaces a previous hover without accumulating overlays", () => {
  const element = target(1);
  matched.push(element);
  highlight.show([{ kind: "selector", selector: "h1" }]);
  intersect(matched, true);
  expect(boxes.size).toBe(1);
  Object.assign(element, { isConnected: false });
  intersect(matched, false);
  expect(boxes.size).toBe(0);
  matched.splice(0, 1, target(2));
  highlight.show([{ kind: "selector", selector: "p" }]);
  intersect(matched, true);
  expect(boxes.size).toBe(1);
});
