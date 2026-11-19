<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import Icon from "./Icon.vue";
import RuleTargetChips from "./RuleTargetChips.vue";
import type { Rule } from "../core/schema";
import { ruleTargets } from "../core/targets";

const props = defineProps<{
  rules: Rule[];
  selected: string;
  selecting: boolean;
  selectedIds: string[];
  connected: boolean;
  disabled: boolean;
  contextKey: string;
}>();
const emit = defineEmits<{
  select: [id: string];
}>();
const root = ref<HTMLElement>();
const rulesCard = ref<HTMLElement>();
const anchor = ref<HTMLElement>();
const passedRules = ref(false);
const open = ref(false);
const trigger = ref<{ $el: HTMLButtonElement }>();
watch(
  open,
  (opening) => {
    const button = trigger.value?.$el;
    // The modal menu hides the header before its focus scope mounts. Release
    // trigger focus first; the menu then takes focus through its normal path.
    if (opening && button === document.activeElement) button.blur();
  },
  { flush: "sync" },
);
const summaryContainer = ref<HTMLElement>();
const summaryMeasure = ref<HTMLElement>();
const visibleTargetCount = ref(0);
const clippedTargetIndex = ref(-1);
const current = computed(() =>
  props.rules.filter((rule) =>
    props.selecting
      ? props.selectedIds.includes(rule.id)
      : rule.id === props.selected,
  ),
);
const active = computed(() => current.value[0]);
const targets = computed(() => (active.value ? ruleTargets(active.value) : []));
function label(rule?: Rule) {
  return (
    rule?.selector ||
    (rule?.font || Object.keys(rule?.properties ?? {}).length
      ? "No targets"
      : "Blank rule")
  );
}
const summary = computed(() =>
  props.selecting
    ? `${current.value.length} ${current.value.length === 1 ? "rule" : "rules"}`
    : active.value
      ? targets.value[0]?.selector || label(active.value)
      : "Choose rule",
);
const visible = computed(
  () => props.connected && props.rules.length > 0 && passedRules.value,
);
// Measure full chips separately so hiding overflow never changes their widths.
function fitTargets() {
  const container = summaryContainer.value;
  const measurement = summaryMeasure.value;
  if (!container || !measurement) return;
  const chips = Array.from(measurement.querySelectorAll<HTMLElement>("code"));
  const ellipsis = measurement.querySelector<HTMLElement>(".editing-bar-count");
  const gap = parseFloat(getComputedStyle(container).gap) || 0;
  const total =
    chips.reduce((sum, chip) => sum + chip.getBoundingClientRect().width, 0) +
    Math.max(0, chips.length - 1) * gap;
  if (total <= container.clientWidth) {
    clippedTargetIndex.value = -1;
    visibleTargetCount.value = chips.length;
    return;
  }
  let used = 0;
  let count = 0;
  for (const [index, chip] of chips.entries()) {
    const width = chip.getBoundingClientRect().width;
    const remaining =
      index < chips.length - 1 ? gap + (ellipsis?.offsetWidth ?? 0) : 0;
    if (used + (count ? gap : 0) + width + remaining > container.clientWidth)
      break;
    used += (count ? gap : 0) + width;
    count++;
  }
  const remainingTargets = count + 1 < chips.length;
  const available =
    container.clientWidth -
    used -
    (count ? gap : 0) -
    (remainingTargets ? gap + (ellipsis?.offsetWidth ?? 0) : 0);
  // Use the spare width for the next target, but avoid a tiny unreadable sliver.
  const showPartial = count < chips.length && (count === 0 || available >= 24);
  clippedTargetIndex.value = showPartial ? count : -1;
  visibleTargetCount.value = count + (showPartial ? 1 : 0);
}
useResizeObserver([summaryContainer, summaryMeasure], fitTargets);
watch([targets, visible, () => props.selecting], fitTargets, { flush: "post" });
let frame: number | undefined;

function measure() {
  frame = undefined;
  if (!rulesCard.value || !anchor.value) return;
  // The bar overlays the scrolling content, so appearing never changes the
  // Rules position or creates a show/hide loop at the scroll boundary.
  const top = anchor.value.getBoundingClientRect().bottom;
  // Keep tiny scroll corrections from reversing an unfinished transition.
  const bottom = rulesCard.value.getBoundingClientRect().bottom;
  passedRules.value = bottom <= top + (passedRules.value ? 8 : 0);
}
function schedule() {
  if (frame === undefined) frame = requestAnimationFrame(measure);
}
useResizeObserver([rulesCard, anchor], schedule);
watch(
  [() => props.rules, () => props.contextKey],
  () => {
    open.value = false;
    schedule();
  },
  { flush: "post" },
);
watch([visible, () => props.disabled], () => {
  if (!visible.value || props.disabled) open.value = false;
});
function returnFocus(event: Event) {
  event.preventDefault();
  if (visible.value && !props.disabled)
    trigger.value?.$el.focus({ preventScroll: true });
}
onMounted(() => {
  rulesCard.value =
    document.querySelector<HTMLElement>(".rules-card") ?? undefined;
  anchor.value = root.value?.parentElement ?? undefined;
  document.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  schedule();
});
onUnmounted(() => {
  document.removeEventListener("scroll", schedule, true);
  window.removeEventListener("resize", schedule);
  if (frame !== undefined) cancelAnimationFrame(frame);
});
</script>

<template>
  <div
    :data-visible="visible"
    :inert="!visible"
    ref="root"
    class="editing-bar"
    aria-label="Editing context"
  >
    <DropdownMenu v-model:open="open">
      <DropdownMenuTrigger as-child>
        <Button
          ref="trigger"
          variant="ghost"
          class="editing-bar-trigger"
          aria-label="Switch rule"
          :disabled="disabled"
        >
          <Label as="span" class="editing-bar-label">Rule</Label>
          <span ref="summaryContainer" class="editing-bar-value">
            <template v-if="!selecting && targets.length">
              <code
                v-for="(target, index) in targets.slice(0, visibleTargetCount)"
                :key="index"
                class="selector-tag rule-selector-tag mono"
                :class="{
                  'editing-bar-chip-clipped': index === clippedTargetIndex,
                }"
                :title="target.selector"
              >
                <Icon v-if="target.kind === 'exact'" name="pick" />
                <span class="rule-selector-text">{{ target.selector }}</span>
              </code>
              <span
                v-if="visibleTargetCount < targets.length"
                class="editing-bar-count"
                >…</span
              >
              <span
                ref="summaryMeasure"
                class="editing-bar-measure"
                aria-hidden="true"
              >
                <code
                  v-for="(target, index) in targets"
                  :key="index"
                  class="selector-tag rule-selector-tag mono"
                >
                  <Icon v-if="target.kind === 'exact'" name="pick" />
                  <span class="rule-selector-text">{{ target.selector }}</span>
                </code>
                <span class="editing-bar-count">…</span>
              </span>
            </template>
            <span v-else class="editing-bar-selector">{{ summary }}</span>
          </span>
          <Icon name="down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          class="ui-menu editing-menu"
          align="end"
          :side-offset="4"
          :collision-padding="8"
          @close-auto-focus="returnFocus"
        >
          <DropdownMenuItem
            v-for="item in rules"
            :key="item.id"
            class="ui-menu-item editing-menu-rule"
            :data-active="
              current.some((rule) => rule.id === item.id) || undefined
            "
            :disabled="disabled"
            @select="emit('select', item.id)"
          >
            <span class="editing-menu-rule-text">
              <RuleTargetChips :rule="item" />
              <span class="subtle"
                >{{ item.font?.family ?? "Original font"
                }}{{ item.enabled ? "" : " · Hidden" }}</span
              >
            </span>
            <span
              v-if="current.some((rule) => rule.id === item.id)"
              class="editing-menu-current"
              >{{ selecting ? "Selected" : "Editing" }}</span
            >
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  </div>
</template>
