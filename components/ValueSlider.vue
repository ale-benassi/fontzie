<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { Slider } from "@/components/ui/slider";
const props = withDefaults(
  defineProps<{
    value: string | number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
  }>(),
  { step: 1 },
);
const emit = defineEmits<{ input: [value: number]; change: [value: number] }>();
const dragging = defineModel<boolean>("dragging", { default: false });
const draft = ref([Number(props.value)]);
watch(
  () => props.value,
  (value) => {
    if (!dragging.value) draft.value = [Number(value)];
  },
);
let timer: ReturnType<typeof setTimeout> | undefined;
function commit(value: number[] | undefined) {
  clearTimeout(timer);
  timer = undefined;
  if (value?.length) emit("change", value[0]!);
}
function update(value: number[] | undefined) {
  if (!value?.length) return;
  draft.value = value;
  emit("input", value[0]!);
  if (dragging.value && timer === undefined)
    timer = setTimeout(() => commit(draft.value), 100);
}
function endDrag() {
  if (timer !== undefined) commit(draft.value);
  dragging.value = false;
}
onUnmounted(() => clearTimeout(timer));
</script>
<template>
  <Slider
    :model-value="draft"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    @pointerdown.capture="dragging = !disabled"
    @lostpointercapture="endDrag"
    @pointercancel="endDrag"
    @update:model-value="update"
    @value-commit="commit"
  />
</template>
