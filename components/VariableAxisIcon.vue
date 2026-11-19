<script setup lang="ts">
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Icon from "./Icon.vue";
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <span
        class="variable-axis-icon"
        role="img"
        aria-label="Variable axis"
        tabindex="0"
      >
        <Icon name="variable" />
      </span>
    </TooltipTrigger>
    <TooltipContent>Variable axis</TooltipContent>
  </Tooltip>
</template>
