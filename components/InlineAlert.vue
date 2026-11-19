<script setup lang="ts">
import { Button } from "./ui/button";
import Icon from "./Icon.vue";

defineProps<{ message?: string; dismissible?: boolean }>();
const emit = defineEmits<{ dismiss: [] }>();
</script>

<template>
  <div
    v-if="message"
    class="inline-alert"
    :class="{ 'inline-alert--dismissible': dismissible }"
  >
    <Icon name="alert" class="inline-alert-icon" />
    <p class="inline-alert-message" role="alert">{{ message }}</p>
    <slot />
    <Button
      v-if="dismissible"
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label="Dismiss error"
      class="inline-alert-dismiss"
      @click="emit('dismiss')"
    >
      <Icon name="close" />
    </Button>
  </div>
</template>

<style scoped>
.inline-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--destructive-text);
  border-radius: var(--radius-lg);
  background: var(--destructive-soft);
  color: var(--error);
  font-size: 13px;
  line-height: 1.45;
  text-align: start;
}
.inline-alert--dismissible {
  padding-inline-end: 8px;
}
.inline-alert-icon {
  flex: none;
  margin-top: 2px;
}
.inline-alert-message {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.inline-alert-dismiss {
  flex: none;
  margin-top: -3px;
}
</style>
