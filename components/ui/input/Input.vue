<script setup lang="ts">
import { ref, type HTMLAttributes } from "vue";
import { cn } from "cn";
const props = defineProps<{
  defaultValue?: string | number;
  value?: string | number;
  modelValue?: string | number;
  modelModifiers?: { number?: boolean };
  type?: string;
  class?: HTMLAttributes["class"];
}>();
const element = ref<HTMLInputElement>();
defineExpose({
  click: () => element.value?.click(),
  focus: () => element.value?.focus(),
});
const emit = defineEmits<{ "update:modelValue": [value: string | number] }>();
function input(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  const number = parseFloat(raw);
  emit(
    "update:modelValue",
    (props.modelModifiers?.number || props.type === "number") &&
      !Number.isNaN(number)
      ? number
      : raw,
  );
}
</script>
<template>
  <input
    ref="element"
    data-slot="input"
    :type="type"
    v-bind="
      type === 'file' ? {} : { value: modelValue ?? value ?? defaultValue }
    "
    :class="cn('ui-field', props.class)"
    @input="input"
  />
</template>
