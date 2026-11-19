import { useResizeObserver } from "@vueuse/core";
import { onScopeDispose, ref, watch, type Ref } from "vue";

export function useRuleListScroll(
  list: Ref<HTMLElement | undefined>,
  rows: Ref<HTMLElement | undefined>,
  selected: () => string,
  ruleIds: () => string[],
  onDragScroll: (clientY: number) => void,
) {
  const moreAbove = ref(false);
  const moreBelow = ref(false);
  let frame: number | undefined;
  let dragY: number | undefined;
  let lastTime: number | undefined;

  function measure() {
    const element = list.value;
    const overflowing =
      !!element && element.scrollHeight - element.clientHeight > 1;
    moreAbove.value = overflowing && element.scrollTop > 1;
    moreBelow.value =
      overflowing &&
      element.scrollHeight - element.clientHeight - element.scrollTop > 1;
  }

  function reveal(row?: HTMLElement | null) {
    const element = list.value;
    if (!element || !row || !element.clientHeight) return;
    const bounds = element.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    // Leave focus and row actions clear of both edge fades.
    const top = bounds.top + 24;
    const bottom = bounds.bottom - 24;
    let offset = 0;
    if (rect.top < top) offset = rect.top - top;
    else if (rect.bottom > bottom)
      offset = Math.min(rect.bottom - bottom, rect.top - top);
    element.scrollTop = Math.max(
      0,
      Math.min(
        element.scrollHeight - element.clientHeight,
        element.scrollTop + offset,
      ),
    );
    measure();
  }

  function revealSelected() {
    const row = Array.from(rows.value?.children ?? []).find(
      (row) => (row as HTMLElement).dataset.ruleId === selected(),
    );
    reveal(row as HTMLElement | undefined);
  }

  // Changes to a rule's typography must not reset a manually scrolled list.
  watch([selected, list], revealSelected, { flush: "post" });
  watch(
    () => ruleIds().join("\0"),
    () => {
      measure();
      const active = list.value?.ownerDocument.activeElement;
      if (active && list.value?.contains(active))
        reveal(active.closest<HTMLElement>(".rule-row"));
    },
    { flush: "post" },
  );
  useResizeObserver([list, rows], measure);

  function stopDragScroll() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    dragY = undefined;
    lastTime = undefined;
  }

  function scrollDrag(time: number) {
    frame = undefined;
    const element = list.value;
    if (!element || dragY === undefined || !element.clientHeight) return;
    const bounds = element.getBoundingClientRect();
    const edge = Math.min(36, bounds.height / 2);
    const direction =
      dragY < bounds.top + edge
        ? -Math.min(1, (bounds.top + edge - dragY) / edge)
        : dragY > bounds.bottom - edge
          ? Math.min(1, (dragY - bounds.bottom + edge) / edge)
          : 0;
    const elapsed = lastTime === undefined ? 16 : Math.min(time - lastTime, 32);
    lastTime = time;
    const previous = element.scrollTop;
    element.scrollTop = Math.max(
      0,
      Math.min(
        element.scrollHeight - element.clientHeight,
        previous + direction * elapsed * 0.48,
      ),
    );
    if (element.scrollTop !== previous) {
      measure();
      onDragScroll(dragY);
    }
    if (direction) frame = requestAnimationFrame(scrollDrag);
    else lastTime = undefined;
  }

  function trackDrag(clientY: number) {
    dragY = clientY;
    if (frame === undefined) frame = requestAnimationFrame(scrollDrag);
  }
  onScopeDispose(stopDragScroll);
  return { moreAbove, moreBelow, measure, reveal, trackDrag, stopDragScroll };
}
