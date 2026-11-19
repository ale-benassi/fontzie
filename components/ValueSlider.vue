<script setup lang="ts">
import { ref, watch } from "vue";
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
const draft = ref([Number(props.value)]);
watch(
  () => props.value,
  (value) => {
    draft.value = [Number(value)];
  },
);
function update(value: number[] | undefined) {
  if (!value?.length) return;
  draft.value = value;
  emit("input", value[0]!);
}
</script>
<template>
  <Slider
    :model-value="draft"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    @update:model-value="update"
    @value-commit="(value) => value?.length && emit('change', value[0]!)"
  />
</template>
