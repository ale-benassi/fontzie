<script setup lang="ts">
import { useTemplateRef } from "vue";
import { DialogContent, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { NativeSelect } from "./ui/native-select";
import SegmentedControl from "./SegmentedControl.vue";
import InlineAlert from "./InlineAlert.vue";
import type { TypographyExport } from "../composables/useTypographyExport";
const props = defineProps<{ exporter: TypographyExport }>();
const {
  format,
  exportScope,
  selectedId,
  exportRules,
  exportFamilies,
  exportCode,
  canExport,
  locating,
  downloadFontAssets,
  copied,
  copyError,
  copyCode,
  downloadCSS,
} = props.exporter;
const preview = useTemplateRef<HTMLTextAreaElement>("preview");
async function copyExport() {
  await copyCode();
  if (copyError.value) {
    preview.value?.focus({ preventScroll: true });
    preview.value?.select();
  }
}
</script>
<template>
  <DialogContent
    class="export-dialog"
    title="Export typography"
    close-label="Close export"
  >
    <SegmentedControl
      v-model="format"
      class="export-format"
      label="Export format"
      :options="[
        { value: 'css', label: 'CSS' },
        {
          value: 'tailwind',
          label: 'Tailwind',
          accessibleName: 'Tailwind CSS v4',
          title: 'Tailwind CSS v4',
        },
        { value: 'prompt', label: 'AI prompt' },
      ]"
    />
    <NativeSelect v-model="exportScope" aria-label="Export scope">
      <option value="all">All enabled rules</option>
      <option value="selected" :disabled="!selectedId">Selected rule</option>
    </NativeSelect>
    <DialogDescription v-if="format === 'prompt'">
      Give this prompt to a coding assistant with access to your website’s
      source.
    </DialogDescription>
    <DialogDescription v-else>
      Review selectors and asset paths before using this code. Font licenses
      still apply.
    </DialogDescription>
    <textarea
      ref="preview"
      class="export-preview"
      aria-label="Export preview"
      :aria-busy="locating"
      :placeholder="locating ? 'Checking picked elements…' : undefined"
      :value="exportCode"
      spellcheck="false"
      readonly
    />
    <p v-if="!exportRules.length" class="hint">
      No enabled typography changes to export in this scope.
    </p>
    <InlineAlert :message="copyError" />
    <template #footer>
      <div
        class="flex flex-wrap items-center justify-end gap-[var(--space-actions)]"
      >
        <Button v-if="exportFamilies.length" @click="downloadFontAssets">
          Download custom assets
        </Button>
        <Button :disabled="!canExport" @click="downloadCSS">{{
          format === "prompt" ? "Download prompt" : "Download CSS"
        }}</Button>
        <Button
          variant="default"
          :aria-label="format === 'prompt' ? 'Copy prompt' : 'Copy code'"
          :disabled="!canExport"
          @click="copyExport"
          >{{
            copied
              ? "Copied"
              : format === "prompt"
                ? "Copy prompt"
                : "Copy code"
          }}</Button
        >
      </div>
    </template>
  </DialogContent>
</template>
