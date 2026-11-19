<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import Icon from "./Icon.vue";

defineProps<{
  themeAction: string;
  themeIcon: string;
  themeSaving: boolean;
  preview: boolean;
  disabled: boolean;
  settingsOpen: boolean;
  floating?: boolean;
}>();
const emit = defineEmits<{
  cycleTheme: [];
  settings: [trigger: HTMLElement];
  "update:preview": [value: boolean];
}>();
</script>
<template>
  <div class="header-actions">
    <Button
      size="icon"
      variant="ghost"
      v-if="!floating"
      class="icon-button"
      :aria-label="themeAction"
      :title="themeAction"
      :disabled="themeSaving"
      @click="emit('cycleTheme')"
    >
      <Icon :name="themeIcon" />
    </Button>
    <Button
      size="icon"
      variant="ghost"
      class="icon-button"
      aria-label="Settings"
      title="Settings"
      aria-haspopup="dialog"
      aria-controls="settings"
      :aria-expanded="settingsOpen"
      @click="emit('settings', $event.currentTarget as HTMLElement)"
      ><Icon name="settings"
    /></Button>
    <div class="preview-switch">
      <Switch
        id="preview"
        :aria-label="floating ? 'Apply typography edits' : 'Preview'"
        :title="
          floating
            ? preview
              ? 'Typography edits on'
              : 'Typography edits off'
            : preview
              ? 'Preview on'
              : 'Preview off'
        "
        :model-value="preview"
        :disabled="disabled"
        @update:model-value="emit('update:preview', $event)"
      />
    </div>
  </div>
</template>
