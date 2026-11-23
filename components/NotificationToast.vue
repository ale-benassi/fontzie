<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef, watch } from "vue";
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
const popup = shallowRef<HTMLElement>();
const layer = useTemplateRef<HTMLDivElement>("layer");
// Older Chrome uses the footer's own positioning until a popup opens.
const canAnchor = CSS.supports("position-anchor: --editor-footer");
const useTopLayer = computed(() => open.value && (canAnchor || !!popup.value));

// Keep the toast and its live announcement inside the active popup's focus scope.
watch(open, (visible, _, onCleanup) => {
  if (!visible) {
    popup.value = undefined;
    return;
  }
  function findPopup() {
    const popups = document.querySelectorAll<HTMLElement>(
      '.ui-dialog[data-state="open"], .ui-menu[data-state="open"]',
    );
    popup.value = Array.from(popups)
      .reverse()
      .find((el) => !el.closest('[aria-hidden="true"]'));
  }
  findPopup();
  const observer = new MutationObserver(findPopup);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributeFilter: ["data-state", "aria-hidden"],
  });
  onCleanup(() => observer.disconnect());
});
watch(
  [useTopLayer, popup],
  ([show]) => {
    if (show) layer.value?.showPopover();
  },
  { flush: "post" },
);
</script>

<template>
  <div>
    <Teleport :to="popup ?? 'body'" :disabled="!popup">
      <!-- Reka preserves live regions when hiding the background. ToastRoot owns announcements. -->
      <div
        ref="layer"
        :aria-live="open ? 'off' : undefined"
        class="notification-layer"
        :popover="useTopLayer ? 'manual' : undefined"
      >
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
              :model-value="
                Math.max(0, Math.min(100, (remaining / duration) * 100))
              "
              aria-hidden="true"
            />
          </ToastRoot>
          <ToastViewport
            class="notification-viewport"
            label="Notifications (F8)"
          />
        </ToastProvider>
      </div>
    </Teleport>
  </div>
</template>
