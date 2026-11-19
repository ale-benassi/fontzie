<script setup lang="ts">
import { nextTick, ref } from "vue";
import { Dialog, DialogContent, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import ConfirmAction from "./ConfirmAction.vue";
import InlineAlert from "./InlineAlert.vue";
import type { Presets } from "../composables/usePresets";
const props = defineProps<{
  presets: Presets;
  busy: boolean;
  error: string;
  returnFocus: () => void;
}>();
const {
  presetSaveOpen,
  savingPreset,
  pendingPreset,
  renamingPreset,
  presetName,
  presetError,
  deletingPreset,
  closePresetSave,
  submitPresetName,
  confirmPresetDelete,
  addPreset,
} = props.presets;
const presetInput = ref<InstanceType<typeof Input>>();
function focusPresetName(event: Event) {
  event.preventDefault();
  void nextTick(() => presetInput.value?.focus());
}
function returnToPresetSave(event: Event) {
  event.preventDefault();
  props.returnFocus();
}
</script>
<template>
  <Dialog :open="presetSaveOpen" @update:open="!$event && closePresetSave()">
    <DialogContent
      class="preset-save-dialog"
      :title="renamingPreset ? 'Rename preset' : 'Save preset'"
      :close-disabled="savingPreset || !!pendingPreset"
      @open-auto-focus="focusPresetName"
      @close-auto-focus="returnToPresetSave"
      @escape-key-down="
        (savingPreset || pendingPreset) && $event.preventDefault()
      "
      @interact-outside="
        (savingPreset || pendingPreset) && $event.preventDefault()
      "
    >
      <DialogDescription>{{
        renamingPreset
          ? "Choose a new name for this preset."
          : "Name your current rules to use them on another page."
      }}</DialogDescription>
      <form @submit.prevent="submitPresetName">
        <Label class="full-field"
          >Preset name<Input
            ref="presetInput"
            v-model="presetName"
            maxlength="80"
            placeholder="Editorial headings"
            :disabled="savingPreset"
        /></Label>
        <InlineAlert :message="presetError" />
        <div class="action-row confirmation-actions">
          <Button
            type="button"
            variant="outline"
            :disabled="savingPreset"
            @click="closePresetSave"
            >Cancel</Button
          >
          <Button
            type="submit"
            variant="default"
            :disabled="!presetName.trim() || savingPreset || busy"
            >{{
              savingPreset ? "Saving…" : renamingPreset ? "Rename" : "Save"
            }}</Button
          >
        </div>
      </form>
    </DialogContent>
  </Dialog>
  <ConfirmAction
    :open="!!deletingPreset"
    title="Delete this preset?"
    :description="`Delete “${deletingPreset}” from this device? Your current page edits will be kept. This cannot be undone.`"
    action="Delete preset"
    :busy="savingPreset"
    @update:open="!$event && (deletingPreset = '')"
    @confirm="confirmPresetDelete"
  >
    <InlineAlert :message="presetError" />
  </ConfirmAction>
  <ConfirmAction
    :open="!!pendingPreset"
    title="Overwrite this preset?"
    :description="`A preset named “${pendingPreset?.existingName ?? ''}” already exists. Replace it with your current rules? This cannot be undone.`"
    action="Overwrite preset"
    :busy="savingPreset"
    @update:open="!$event && (pendingPreset = undefined)"
    @confirm="addPreset(true)"
  >
    <InlineAlert :message="error" />
  </ConfirmAction>
</template>
