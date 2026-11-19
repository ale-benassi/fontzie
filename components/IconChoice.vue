<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { computed, ref, watch } from "vue";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import Icon from "./Icon.vue";
const props = defineProps<{
  label: string;
  value: string;
  options: readonly {
    value: string;
    label: string;
    icon: string;
    disabled?: boolean;
  }[];
  disabled: boolean;
  overridden: boolean;
}>();
const emit = defineEmits<{ change: [value: string]; reset: [] }>();
const draft = ref(props.value);
watch([() => props.value, () => props.disabled], () => {
  if (!props.disabled) draft.value = props.value;
});
function choose(selected: string) {
  draft.value = selected;
  emit("change", selected);
}
const currentLabel = computed(
  () =>
    props.options.find((option) => option.value === draft.value)?.label ??
    draft.value,
);
</script>
<template>
  <fieldset class="icon-choice-field" :aria-label="label" :disabled="disabled">
    <legend>
      <Label as="span">{{ label }}</Label>
      <span class="icon-choice-value">{{ currentLabel }}</span>
      <Button
        v-if="overridden"
        variant="link"
        size="icon-xs"
        class="reset-property icon-choice-reset"
        type="button"
        :aria-label="`Reset ${label}`"
        :title="`Reset ${label}`"
        @click="emit('reset')"
      >
        <Icon name="undo" />
      </Button>
    </legend>
    <RadioGroup
      class="icon-choice-options"
      :aria-label="label"
      :model-value="draft"
      :disabled="disabled"
      :style="{ '--choices': options.length > 4 ? 3 : options.length }"
      @update:model-value="(selected) => selected && choose(String(selected))"
    >
      <Tooltip v-for="option in options" :key="option.value">
        <TooltipTrigger as-child>
          <RadioGroupItem
            class="icon-option"
            :value="option.value"
            :disabled="disabled || option.disabled"
            :aria-label="option.label"
          >
            <Icon :name="option.icon" />
          </RadioGroupItem>
        </TooltipTrigger>
        <TooltipContent
          >{{ label }}: {{ option.label
          }}{{
            option.disabled ? " (unavailable for this family)" : ""
          }}</TooltipContent
        >
      </Tooltip>
    </RadioGroup>
  </fieldset>
</template>
