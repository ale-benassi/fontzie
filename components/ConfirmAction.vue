<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ref, nextTick } from "vue";
const cancelButton = ref<{ $el: HTMLButtonElement }>();
function focusCancel(event: Event) {
  event.preventDefault();
  void nextTick(() => cancelButton.value?.$el.focus());
}
defineProps<{
  open: boolean;
  title: string;
  description?: string;
  action: string;
  busy?: boolean;
}>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
  closeAutoFocus: [event: Event];
}>();
</script>
<template>
  <Dialog :open="open" @update:open="!busy && emit('update:open', $event)">
    <DialogContent
      :title="title"
      :close-disabled="busy"
      @open-auto-focus="focusCancel"
      @close-auto-focus="emit('closeAutoFocus', $event)"
      @escape-key-down="busy && $event.preventDefault()"
      @interact-outside="busy && $event.preventDefault()"
    >
      <DialogDescription>
        <slot name="description">{{ description }}</slot>
      </DialogDescription>
      <slot />
      <div class="action-row confirmation-actions">
        <Button
          ref="cancelButton"
          variant="outline"
          :disabled="busy"
          @click="emit('update:open', false)"
          >Cancel</Button
        >
        <Button
          variant="destructive"
          :disabled="busy"
          @click="emit('confirm')"
          >{{ busy ? "Working…" : action }}</Button
        >
      </div>
    </DialogContent>
  </Dialog>
</template>
