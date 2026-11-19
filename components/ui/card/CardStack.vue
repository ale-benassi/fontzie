<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";

const props = withDefaults(defineProps<{ ready?: boolean }>(), { ready: true });
const root = ref<HTMLElement>();
const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
const timing: KeyframeAnimationOptions = {
  duration: 300,
  easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
  fill: "both",
};
type Bounds = { top: number; height: number };
type Size = { element: HTMLElement; width: number; height: number };
let positions = new Map<HTMLElement, Bounds>();
let sizes: Size[] = [];
let width: number | undefined;
let initialized = false;
let mounted = false;
let frame: number | undefined;
let pending = false;
let resizeObserver: ResizeObserver | undefined;
let mutationObserver: MutationObserver | undefined;
const bodies = new Set<HTMLElement>();
const animations = new Set<Animation>();

function cancelAnimations() {
  for (const animation of animations) {
    animation.onfinish = null;
    animation.cancel();
  }
  animations.clear();
}
function animate(element: HTMLElement, keyframes: Keyframe[]) {
  const animation = element.animate(keyframes, timing);
  animation.currentTime = 0;
  animations.add(animation);
  animation.onfinish = () => {
    animations.delete(animation);
    animation.cancel();
    requestFrame();
  };
}
function cards() {
  return Array.from(
    root.value?.querySelectorAll<HTMLElement>(".ui-card") ?? [],
  ).filter((card) => !card.parentElement?.closest(".ui-card"));
}
function snapshot(elements: HTMLElement[]) {
  const container = root.value!;
  const top = container.getBoundingClientRect().top - container.scrollTop;
  return new Map(
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return [element, { top: bounds.top - top, height: bounds.height }];
    }),
  );
}
function measure(elements: HTMLElement[]) {
  const nextBodies = new Set<HTMLElement>();
  const nextSizes = elements.map((element) => {
    const body = element.querySelector<HTMLElement>(":scope > .ui-card-body")!;
    nextBodies.add(body);
    if (!bodies.has(body)) resizeObserver?.observe(body);
    const bounds = body.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      element,
      width: bounds.width,
      height:
        bounds.height +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.borderBottomWidth),
    };
  });
  for (const body of bodies) {
    if (!nextBodies.has(body)) resizeObserver?.unobserve(body);
  }
  bodies.clear();
  nextBodies.forEach((body) => bodies.add(body));
  const managed = new Set(elements);
  for (const child of root.value!.children) {
    if (child instanceof HTMLElement && !managed.has(child)) {
      const bounds = child.getBoundingClientRect();
      nextSizes.push({
        element: child,
        width: bounds.width,
        height: bounds.height,
      });
    }
  }
  return nextSizes;
}
function updateLayout(elements: HTMLElement[]) {
  const nextSizes = measure(elements);
  const nextWidth = root.value!.getBoundingClientRect().width;
  const resized = width !== undefined && Math.abs(width - nextWidth) > 1;
  width = nextWidth;
  const changed =
    sizes.length !== nextSizes.length ||
    nextSizes.some((next, i) => {
      const previous = sizes[i];
      return (
        !previous ||
        previous.element !== next.element ||
        Math.abs(previous.height - next.height) > 0.5 ||
        Math.abs(previous.width - next.width) > 1
      );
    });
  sizes = nextSizes;
  if (!initialized || !props.ready || reducedMotion.value || resized) {
    cancelAnimations();
    initialized = props.ready;
    return;
  }
  if (!changed) return;
  cancelAnimations();
  for (const element of elements) {
    const previous = positions.get(element);
    const height = nextSizes.find((size) => size.element === element)!.height;
    const from = previous?.height ?? 0;
    if (Math.abs(from - height) > 0.5) {
      animate(element, [
        { height: `${from}px`, overflow: "clip" },
        { height: `${height}px`, overflow: "clip" },
      ]);
    }
  }
  // Height changes restore the old flow first. Translate only the remaining
  // displacement, including gaps left by removed guidance or inserted cards.
  const flow = snapshot(elements);
  for (const element of elements) {
    const previous = positions.get(element);
    if (!previous) continue;
    const offset = previous.top - flow.get(element)!.top;
    if (Math.abs(offset) > 0.5) {
      animate(element, [
        { transform: `translateY(${offset}px)` },
        { transform: "translateY(0)" },
      ]);
    }
  }
}
function requestFrame() {
  if (!mounted || frame !== undefined) return;
  frame = requestAnimationFrame(() => {
    frame = undefined;
    const elements = cards();
    if (pending) {
      pending = false;
      updateLayout(elements);
    }
    // Retain the last displayed positions so rapid edits can interrupt motion
    // from its current frame, rather than from a stale start or destination.
    positions = snapshot(elements);
    if (pending || animations.size) requestFrame();
  });
}
function schedule() {
  pending = true;
  requestFrame();
}
watch([() => props.ready, reducedMotion], () => {
  initialized = false;
  cancelAnimations();
  schedule();
});
onMounted(() => {
  mounted = true;
  resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(root.value!);
  mutationObserver = new MutationObserver(schedule);
  mutationObserver.observe(root.value!, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-state", "data-inactive"],
  });
  schedule();
});
onUnmounted(() => {
  mounted = false;
  if (frame !== undefined) cancelAnimationFrame(frame);
  mutationObserver?.disconnect();
  resizeObserver?.disconnect();
  cancelAnimations();
});
</script>
<template>
  <main ref="root" class="card-stack"><slot /></main>
</template>
