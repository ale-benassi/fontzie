import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref, shallowRef } from "vue";
import { useRuleListScroll } from "../../composables/useRuleListScroll";

const { observe } = vi.hoisted(() => ({ observe: vi.fn() }));
vi.mock("@vueuse/core", () => ({ useResizeObserver: observe }));

let scope = effectScope();
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
beforeEach(() => {
  scope = effectScope();
  frames = new Map();
  frameId = 0;
  observe.mockReset();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
});

function setup() {
  const selected = ref("a");
  const ids = ref(["a", "b", "c", "d", "e", "f", "g", "h"]);
  const element = {
    scrollTop: 0,
    scrollHeight: 600,
    clientHeight: 240,
    getBoundingClientRect: () => ({ top: 100, bottom: 340, height: 240 }),
    ownerDocument: { activeElement: null as unknown },
    contains: (target: unknown) =>
      target === element.ownerDocument.activeElement,
  };
  const children = ids.value.map((id, index) => ({
    dataset: { ruleId: id },
    getBoundingClientRect: () => ({
      top: 106 + index * 70 - element.scrollTop,
      bottom: 170 + index * 70 - element.scrollTop,
    }),
  }));
  // Only the DOM geometry used by this composable is needed in the fixture.
  const list = shallowRef<HTMLElement | undefined>(
    element as unknown as HTMLElement,
  );
  const rows = shallowRef<HTMLElement | undefined>({
    children,
  } as unknown as HTMLElement);
  const onDragScroll = vi.fn();
  const scroll = scope.run(() =>
    useRuleListScroll(
      list,
      rows,
      () => selected.value,
      () => ids.value,
      onDragScroll,
    ),
  )!;
  return {
    element,
    children,
    list,
    rows,
    selected,
    ids,
    onDragScroll,
    ...scroll,
  };
}

function tick(time: number) {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
}

it("reveals a new selection using only the list scroll position", async () => {
  const view = setup();
  view.selected.value = "b";
  await nextTick();
  expect(view.element.scrollTop).toBe(0);
  view.selected.value = "f";
  await nextTick();
  expect(view.element.scrollTop).toBe(204);
  expect(view.moreBelow.value).toBe(true);
  view.selected.value = "a";
  await nextTick();
  expect(view.element.scrollTop).toBe(0);
});

it("preserves manual scrolling when rules keep the same order", async () => {
  const view = setup();
  view.element.scrollTop = 300;
  view.ids.value = [...view.ids.value];
  await nextTick();
  expect(view.element.scrollTop).toBe(300);
  view.measure();
  expect(view.moreBelow.value).toBe(true);
  view.element.scrollTop = 360;
  view.measure();
  expect(view.moreBelow.value).toBe(false);
});

it("reveals the selection when a collapsed list mounts again", async () => {
  const view = setup();
  const element = view.list.value;
  view.list.value = undefined;
  await nextTick();
  view.selected.value = "f";
  await nextTick();
  expect(view.element.scrollTop).toBe(0);
  view.list.value = element;
  await nextTick();
  expect(view.element.scrollTop).toBe(204);
});

it("keeps the focused row visible after keyboard reordering", async () => {
  const view = setup();
  view.element.ownerDocument.activeElement = {
    closest: () => view.children[5],
  };
  view.ids.value = [...view.ids.value].reverse();
  await nextTick();
  expect(view.element.scrollTop).toBe(204);
});

it("continues edge scrolling with a stationary drag and updates the drop target", () => {
  const view = setup();
  view.trackDrag(338);
  tick(0);
  const first = view.element.scrollTop;
  tick(16);
  expect(view.element.scrollTop).toBeGreaterThan(first);
  expect(view.onDragScroll).toHaveBeenCalledTimes(2);
  expect(view.onDragScroll).toHaveBeenLastCalledWith(338);
  view.trackDrag(220);
  tick(32);
  expect(frames.size).toBe(0);
});

it("scrolls in both directions, clamps at each end and cleans up on exit", () => {
  const view = setup();
  view.element.scrollTop = 359;
  view.trackDrag(340);
  tick(0);
  expect(view.element.scrollTop).toBe(360);
  expect(view.moreBelow.value).toBe(false);
  view.element.scrollTop = 1;
  view.trackDrag(100);
  tick(16);
  expect(view.element.scrollTop).toBe(0);
  view.stopDragScroll();
  expect(frames.size).toBe(0);
  view.trackDrag(340);
  scope.stop();
  expect(frames.size).toBe(0);
});

it("remeasures the fade when the list or its content resizes", () => {
  const view = setup();
  const measure = observe.mock.calls[0]?.[1] as () => void;
  measure();
  expect(view.moreBelow.value).toBe(true);
  view.element.scrollHeight = 180;
  measure();
  expect(view.moreBelow.value).toBe(false);
});

it("shows each fade only while content is hidden at that edge", () => {
  const view = setup();
  view.measure();
  expect(view.moreAbove.value).toBe(false);
  expect(view.moreBelow.value).toBe(true);
  view.element.scrollTop = 160;
  view.measure();
  expect(view.moreAbove.value).toBe(true);
  expect(view.moreBelow.value).toBe(true);
  view.element.scrollTop = 360;
  view.measure();
  expect(view.moreAbove.value).toBe(true);
  expect(view.moreBelow.value).toBe(false);
  view.element.scrollTop = 0.5;
  view.measure();
  expect(view.moreAbove.value).toBe(false);
  view.element.scrollHeight = 180;
  view.measure();
  expect(view.moreAbove.value).toBe(false);
  expect(view.moreBelow.value).toBe(false);
});

it("reveals a selected row above the viewport clear of the top fade", async () => {
  const view = setup();
  view.element.scrollTop = 300;
  view.selected.value = "c";
  await nextTick();
  expect(view.children[2]?.getBoundingClientRect().top).toBe(124);
  expect(view.moreAbove.value).toBe(true);
});
