<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import Icon from "./Icon.vue";
import {
  numberControl,
  numberStep,
  type NumberKind,
} from "../core/number-controls";
import ValueSlider from "./ValueSlider.vue";
import { computed, ref, watch, useId } from "vue";
const props = defineProps<{
  label: string;
  kind?: NumberKind;
  value: string;
  valueStatus?: string;
  units: string[];
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  overridden?: boolean;
}>();
const emit = defineEmits<{ change: [value: string]; reset: [] }>();
const inputId = useId();
const dragging = ref(false);
const number = ref<number | "">(
    props.valueStatus ? "" : parseFloat(props.value) || 0,
  ),
  unit = ref(props.value.replace(/^-?[\d.]+/, "") || props.units[0] || "");
watch([() => props.value, () => props.valueStatus], ([v, status]) => {
  if (dragging.value) return;
  number.value = status ? "" : parseFloat(v) || 0;
  unit.value = v.replace(/^-?[\d.]+/, "") || props.units[0] || "";
});
const sliderValue = computed(() =>
  number.value === "" ? parseFloat(props.value) || 0 : number.value,
);
const valid = computed(
  () =>
    number.value !== "" &&
    Number.isFinite(number.value) &&
    number.value >= props.min &&
    number.value <= props.max,
);
const control = computed(() =>
  props.kind
    ? numberControl(props.kind, unit.value, sliderValue.value)
    : { min: props.min, max: props.max, step: props.step },
);
function nudge(direction: number) {
  if (number.value === "") return;
  number.value = Math.min(
    props.max,
    Math.max(
      props.min,
      numberStep(number.value, direction, control.value.step),
    ),
  );
  change();
}
function change() {
  if (valid.value) emit("change", `${number.value}${unit.value}`);
}
function finishSlide(value: number) {
  number.value = value;
  change();
}
</script>
<template>
  <div class="numeric-field">
    <div class="field-label">
      <span class="field-label-name">
        <Label :for="inputId">{{ label }}</Label>
        <slot name="label-suffix" />
      </span>
      <Button
        v-if="overridden"
        variant="link"
        size="icon-xs"
        class="reset-property"
        :aria-label="`Reset ${label}`"
        :title="`Reset ${label}`"
        @click="emit('reset')"
      >
        <Icon name="undo" />
      </Button>
    </div>
    <div class="number-controls">
      <Button
        class="step-button"
        :aria-label="`Decrease ${label}`"
        :disabled="disabled || number === '' || number <= min"
        @click="nudge(-1)"
        ><Icon name="minus"
      /></Button>
      <div class="number-box">
        <Input
          :id="inputId"
          v-model.number="number"
          type="number"
          :min="min"
          :max="max"
          :step="control.step"
          :placeholder="valueStatus"
          :disabled="disabled"
          :aria-invalid="number !== '' && !valid"
          @change="change"
        /><NativeSelect
          v-if="units.length > 1"
          v-model="unit"
          :aria-label="`${label} unit`"
          :disabled="disabled"
          @change="change"
        >
          <option v-for="u in units" :key="u" :value="u">
            {{ u || "×" }}
          </option></NativeSelect
        ><span v-else-if="units.length">{{ units[0] || "×" }}</span>
      </div>
      <Button
        class="step-button"
        :aria-label="`Increase ${label}`"
        :disabled="disabled || number === '' || number >= max"
        @click="nudge(1)"
        ><Icon name="plus"
      /></Button>
    </div>
    <ValueSlider
      v-model:dragging="dragging"
      :aria-label="`${label} slider`"
      :value="sliderValue"
      :min="control.min"
      :max="control.max"
      :step="control.step"
      :disabled="disabled"
      @input="number = $event"
      @change="finishSlide"
    /><span v-if="number !== '' && !valid" class="field-error"
      >Use {{ min }}–{{ max }}.</span
    >
  </div>
</template>
