<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "cn";
defineProps<{
  plain?: boolean;
  interactive?: boolean;
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <div
    :class="
      cn(
        'ui-header-row',
        !plain && 'ui-card-header',
        !plain && interactive && 'ui-card-header--interactive',
        $props.class,
      )
    "
  >
    <slot />
  </div>
</template>
