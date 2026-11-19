<script setup lang="ts">
import { ref, watch } from "vue";
import {
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastAction,
  ToastClose,
  ToastViewport,
} from "reka-ui";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Icon from "./Icon.vue";

const props = defineProps<{
  message: string;
  sequence: number;
  undoAvailable: boolean;
  undoLabel?: string;
}>();
const emit = defineEmits<{ undo: [] }>();
const open = ref(false);
watch([() => props.sequence, () => props.message], () => {
  open.value = !!props.message;
});
</script>

<template>
  <ToastProvider :duration="7000" label="Notification">
    <ToastRoot
      :key="sequence"
      v-slot="{ remaining, duration }"
      v-model:open="open"
      type="background"
      class="notification-toast"
    >
      <ToastTitle class="notification-title">{{ message }}</ToastTitle>
      <template v-if="undoAvailable">
        <span aria-hidden="true" class="notification-separator">·</span>
        <ToastAction
          as-child
          :alt-text="undoLabel ?? 'Undo the applied preset'"
        >
          <Button
            variant="link"
            size="xs"
            class="notification-undo"
            @click="emit('undo')"
            >Undo</Button
          >
        </ToastAction>
      </template>
      <ToastClose as-child>
        <Button
          size="icon"
          variant="ghost"
          class="icon-button notification-close"
          aria-label="Dismiss notification"
        >
          <Icon name="close" />
        </Button>
      </ToastClose>
      <Progress
        class="notification-progress"
        :model-value="Math.max(0, Math.min(100, (remaining / duration) * 100))"
        aria-hidden="true"
      />
    </ToastRoot>
    <ToastViewport class="notification-viewport" label="Notifications (F8)" />
  </ToastProvider>
</template>
