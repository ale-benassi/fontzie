<script setup lang="ts">
import Icon from "./Icon.vue";

defineProps<{
  icon: string;
  title: string;
  description?: string;
  descriptionId?: string;
}>();
</script>

<template>
  <div class="font-provider-empty">
    <Icon :name="icon" />
    <div aria-live="polite">
      <strong>{{ title }}</strong>
      <p v-if="description" :id="descriptionId" class="subtle">
        {{ description }}
      </p>
    </div>
    <slot />
  </div>
</template>
