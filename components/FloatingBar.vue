<script setup lang="ts">
import { Button } from "@/components/ui/button";
import Icon from "./Icon.vue";
import BrandLogo from "./BrandLogo.vue";
defineProps<{ minimized: boolean }>();
const emit = defineEmits<{ minimize: []; dock: []; close: [] }>();
function send(type: string, extra: Record<string, unknown> = {}) {
  window.parent.postMessage(
    {
      channel: "fontzie-floating-ui",
      token: location.hash.slice(1),
      type,
      ...extra,
    },
    "*",
  );
}
let active: "move" | "resize" | undefined;
let lastX = 0,
  lastY = 0;
function start(event: PointerEvent, type: "move" | "resize") {
  if (event.button !== 0) return;
  active = type;
  lastX = event.screenX;
  lastY = event.screenY;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  event.preventDefault();
}
function move(event: PointerEvent) {
  if (!active) return;
  send(active, { dx: event.screenX - lastX, dy: event.screenY - lastY });
  lastX = event.screenX;
  lastY = event.screenY;
}
function finish() {
  if (active) send("commit");
  active = undefined;
}
function keys(event: KeyboardEvent, type: "move" | "resize") {
  const step = event.shiftKey ? 50 : 10;
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  if (!delta[event.key]) return;
  event.preventDefault();
  send(type, { dx: delta[event.key]![0], dy: delta[event.key]![1] });
  send("commit");
}
</script>
<template>
  <div class="floating-toolbar">
    <Button
      class="floating-drag"
      aria-label="Move floating panel"
      title="Drag to move. Arrow keys move; Shift moves faster."
      @pointerdown="start($event, 'move')"
      @pointermove="move"
      @pointerup="finish"
      @pointercancel="finish"
      @keydown="keys($event, 'move')"
      ><BrandLogo
    /></Button>
    <slot v-if="!minimized" name="controls" />
    <div
      class="floating-window-controls"
      :class="{ 'is-minimized': minimized }"
    >
      <Button
        size="icon"
        variant="ghost"
        v-if="!minimized"
        class="icon-button"
        aria-label="Dock editor in sidebar"
        title="Dock editor in sidebar"
        @click="emit('dock')"
        ><Icon name="dock"
      /></Button>
      <Button
        size="icon"
        variant="ghost"
        class="icon-button"
        :aria-label="
          minimized ? 'Expand floating panel' : 'Minimize floating panel'
        "
        :title="minimized ? 'Expand floating panel' : 'Minimize floating panel'"
        @click="emit('minimize')"
        ><Icon :name="minimized ? 'expand' : 'minus'"
      /></Button>
      <Button
        size="icon"
        variant="ghost"
        class="icon-button"
        aria-label="Close floating panel"
        title="Close floating panel"
        @click="emit('close')"
        ><Icon name="close"
      /></Button>
    </div>
  </div>
  <Button
    v-if="!minimized"
    class="floating-resize"
    aria-label="Resize floating panel"
    title="Drag to resize, or use arrow keys."
    @pointerdown="start($event, 'resize')"
    @pointermove="move"
    @pointerup="finish"
    @pointercancel="finish"
    @keydown="keys($event, 'resize')"
  >
    <svg class="resize-grip" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 14 14 3M7 14 14 7M11 14 14 11" />
    </svg>
  </Button>
</template>
