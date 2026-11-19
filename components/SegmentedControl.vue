<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { Button } from "@/components/ui/button";

const props = defineProps<{
  modelValue: string;
  label: string;
  options: readonly {
    value: string;
    label: string;
    accessibleName?: string;
    title?: string;
  }[];
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const root = ref<HTMLElement>();
const indicator = ref<{ transform: string; width: string; height: string }>();
function measure() {
  const selected = root.value?.querySelector<HTMLButtonElement>(
    'button[aria-pressed="true"]',
  );
  if (!selected?.offsetWidth) {
    indicator.value = undefined;
    return;
  }
  indicator.value = {
    transform: `translate(${selected.offsetLeft}px, ${selected.offsetTop}px)`,
    width: `${selected.offsetWidth}px`,
    height: `${selected.offsetHeight}px`,
  };
}
onMounted(measure);
watch(() => props.modelValue, measure, { flush: "post" });
useResizeObserver(root, measure);
</script>

<template>
  <div
    ref="root"
    class="provider-tabs animated-pills"
    role="group"
    :aria-label="label"
  >
    <span class="pill-viewport" aria-hidden="true">
      <span v-if="indicator" class="pill-indicator" :style="indicator" />
    </span>
    <Button
      v-for="option in options"
      :key="option.value"
      variant="ghost"
      :aria-pressed="modelValue === option.value"
      :aria-label="option.accessibleName"
      :title="option.title"
      @click="emit('update:modelValue', option.value)"
      ><span class="pill-label" :data-label="option.label"
        ><span>{{ option.label }}</span></span
      ></Button
    >
  </div>
</template>
