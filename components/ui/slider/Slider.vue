<script setup lang="ts">
import type { SliderRootEmits, SliderRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { cn } from "cn";
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  useForwardPropsEmits,
} from "reka-ui";

const props = defineProps<
  SliderRootProps & { class?: HTMLAttributes["class"]; ariaLabel?: string }
>();
const emits = defineEmits<SliderRootEmits>();

const delegatedProps = reactiveOmit(props, "class", "ariaLabel");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <SliderRoot
    v-slot="{ modelValue }"
    data-slot="slider"
    :class="cn('ui-slider', props.class)"
    v-bind="forwarded"
  >
    <SliderTrack data-slot="slider-track" class="ui-slider-track">
      <SliderRange data-slot="slider-range" class="ui-slider-range" />
    </SliderTrack>

    <SliderThumb
      v-for="(_, key) in modelValue"
      :key="key"
      data-slot="slider-thumb"
      class="ui-slider-thumb"
      :aria-label="props.ariaLabel"
    />
  </SliderRoot>
</template>
