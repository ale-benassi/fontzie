<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ChevronDown } from "@lucide/vue";
import { cn } from "cn";
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  modelValue?: string | number;
  value?: string | number;
  modelModifiers?: { number?: boolean };
  class?: HTMLAttributes["class"];
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string | number];
  change: [event: Event];
}>();
function change(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  emit(
    "update:modelValue",
    props.modelModifiers?.number ? Number(value) : value,
  );
  emit("change", event);
}
</script>
<template>
  <div data-slot="native-select-wrapper" class="ui-native-select">
    <select
      data-slot="native-select"
      :value="modelValue ?? value"
      :class="cn('ui-field', props.class)"
      v-bind="$attrs"
      @change="change"
    >
      <slot />
    </select>
    <ChevronDown
      :stroke-width="1.6"
      class="ui-native-select-chevron"
      aria-hidden="true"
    />
  </div>
</template>
