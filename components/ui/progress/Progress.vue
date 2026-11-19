<script setup lang="ts">
import { ProgressIndicator, ProgressRoot } from "reka-ui";
defineProps<{ modelValue: number }>();
</script>
<template>
  <ProgressRoot class="ui-progress" :model-value="modelValue" :max="100">
    <ProgressIndicator
      class="ui-progress-indicator"
      :style="{ transform: `translateX(-${100 - modelValue}%)` }"
    />
  </ProgressRoot>
</template>
