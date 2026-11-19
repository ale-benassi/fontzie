<script setup lang="ts">
import type { RadioGroupItemProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { CircleIcon } from "@lucide/vue";
import { reactiveOmit } from "@vueuse/core";
import { cn } from "cn";
import { RadioGroupIndicator, RadioGroupItem, useForwardProps } from "reka-ui";

const props = defineProps<
  RadioGroupItemProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <RadioGroupItem
    data-slot="radio-group-item"
    v-bind="forwardedProps"
    :class="cn('ui-radio-item', props.class)"
  >
    <slot
      ><RadioGroupIndicator data-slot="radio-group-indicator"
        ><CircleIcon :stroke-width="1.6" /></RadioGroupIndicator
    ></slot>
  </RadioGroupItem>
</template>
