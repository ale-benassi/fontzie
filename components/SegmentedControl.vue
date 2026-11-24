<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { Info } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const props = defineProps<{
  modelValue: string;
  label: string;
  options: readonly {
    value: string;
    label: string;
    accessibleName?: string;
    title?: string;
    help?: string;
  }[];
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const openHelp = ref<Record<string, boolean>>({});
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
function choose(option: (typeof props.options)[number]) {
  emit("update:modelValue", option.value);
  if (option.help) openHelp.value[option.value] = true;
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
    <Tooltip
      v-for="option in options"
      :key="option.value"
      v-model:open="openHelp[option.value]"
      :disabled="!option.help"
      disable-closing-trigger
    >
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          :aria-pressed="modelValue === option.value"
          :aria-label="option.accessibleName"
          :title="option.title"
          @click="choose(option)"
        >
          <span class="pill-label" :data-label="option.label">
            <span>{{ option.label }}</span>
          </span>
          <Info v-if="option.help" class="pill-help-icon" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent v-if="option.help" side="top" :collision-padding="8">
        {{ option.help }}
      </TooltipContent>
    </Tooltip>
  </div>
</template>
