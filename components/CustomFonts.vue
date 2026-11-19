<script setup lang="ts">
import ConfirmAction from "./ConfirmAction.vue";
import InlineAlert from "./InlineAlert.vue";
import FontProviderEmpty from "./FontProviderEmpty.vue";
import Icon from "./Icon.vue";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { computed, nextTick, ref, onMounted, watch } from "vue";
import { errorMessage } from "../core/errors";
import {
  allFaces,
  ingestFont,
  saveFace,
  deleteFace,
  type CustomFontMetadata,
} from "../storage/fonts";
const props = defineProps<{
  refresh: () => Promise<void>;
  disabled: boolean;
  empty: boolean;
  family: string;
}>();
const emit = defineEmits<{ error: [error: unknown]; uploaded: []; back: [] }>();
const faces = ref<CustomFontMetadata[]>([]),
  busy = ref(false),
  drag = ref(false),
  input = ref<InstanceType<typeof Input>>(),
  replacementInput = ref<InstanceType<typeof Input>>();
const deleting = ref<CustomFontMetadata>();
const replacing = ref<CustomFontMetadata>();
const selectedId = ref("");
const familyFaces = computed(() =>
  faces.value.filter((face) => face.family === props.family),
);
const selectedFace = computed(
  () =>
    familyFaces.value.find((face) => face.id === selectedId.value) ??
    familyFaces.value[0],
);
const draft = ref<CustomFontMetadata>();
watch(
  selectedFace,
  (face) => {
    if (face && !selectedId.value) selectedId.value = face.id;
    draft.value = face
      ? { ...face, axes: face.axes.map((axis) => ({ ...axis })) }
      : undefined;
  },
  { immediate: true },
);
watch(
  () => props.family,
  () => {
    selectedId.value = "";
    localError.value = "";
  },
);
const changed = computed(
  () =>
    !!draft.value &&
    !!selectedFace.value &&
    (draft.value.family !== selectedFace.value.family ||
      draft.value.weight !== selectedFace.value.weight ||
      draft.value.style !== selectedFace.value.style),
);
async function back() {
  emit("back");
  await nextTick();
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      deleting.value = undefined;
      replacing.value = undefined;
      drag.value = false;
    }
  },
);
const localError = ref("");
const reload = async () => {
  faces.value = await allFaces();
};
onMounted(() => reload().catch(report));
function report(error: unknown) {
  localError.value = errorMessage(error);
  emit("error", error);
}
function weightLabel(face: CustomFontMetadata) {
  const axis = face.axes.find((axis) => axis.tag === "wght");
  return axis ? `${axis.min}–${axis.max} · Variable` : String(face.weight);
}
function replace(face: CustomFontMetadata) {
  replacing.value = face;
  replacementInput.value?.click();
}
async function uploadSelection(event: Event, replace?: string) {
  const field = event.target as HTMLInputElement;
  const files = Array.from(field.files ?? []);
  field.value = "";
  await upload(files, replace);
}
async function upload(files: FileList | File[] | null, replace?: string) {
  if (!files?.length || busy.value || props.disabled) return;
  const batch = Array.from(files);
  busy.value = true;
  localError.value = "";
  let saved = false;
  try {
    for (const file of batch) {
      const face = await ingestFont(file);
      if (replace) face.id = replace;
      await saveFace(face);
      saved = true;
    }
  } catch (e) {
    report(e);
  } finally {
    // A valid file from a mixed batch must still appear if a later file fails.
    if (saved) {
      try {
        await reload();
        await props.refresh();
        emit("uploaded");
        if (replace) await back();
      } catch (e) {
        report(e);
      }
    }
    busy.value = false;
    replacing.value = undefined;
  }
}
async function edit(face: CustomFontMetadata) {
  if (busy.value || props.disabled) return;
  busy.value = true;
  try {
    if (
      !face.family.trim() ||
      /[{};<>\\\n\r]/.test(face.family) ||
      !Number.isFinite(face.weight) ||
      face.weight < 1 ||
      face.weight > 1000
    )
      throw Error("Use a family name and a weight between 1 and 1000.");
    await saveFace(face);
    await props.refresh();
    await reload();
    localError.value = "";
    await back();
  } catch (e) {
    localError.value = errorMessage(e);
    emit("error", e);
  } finally {
    busy.value = false;
  }
}
async function remove(id: string) {
  busy.value = true;
  localError.value = "";
  try {
    await deleteFace(id);
    await reload();
    await props.refresh();
    deleting.value = undefined;
    localError.value = "";
    await back();
  } catch (e) {
    localError.value = errorMessage(e);
    emit("error", e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Dialog :open="!!family" @update:open="!$event && !busy && back()">
    <section id="custom-fonts" aria-label="Custom font files" :aria-busy="busy">
      <div
        class="custom-upload"
        :class="{ drag }"
        @dragover.prevent="drag = !busy && !disabled"
        @dragleave="drag = false"
        @drop.prevent="
          drag = false;
          upload($event.dataTransfer?.files ?? null);
        "
      >
        <FontProviderEmpty
          v-if="empty"
          icon="upload"
          title="Custom font files"
          description="Drop WOFF2, WOFF, TTF or OTF files here (up to 20&nbsp;MB each). Files stay on this device."
          description-id="custom-upload-help"
        >
          <Button
            id="custom-add"
            :disabled="busy || disabled"
            aria-describedby="custom-upload-help"
            @click="input?.click()"
            >{{ busy ? "Adding…" : "Add fonts" }}</Button
          >
        </FontProviderEmpty>
        <Button
          v-else
          id="custom-add"
          size="xs"
          :disabled="busy || disabled"
          @click="input?.click()"
        >
          <Icon name="plus" />{{ busy ? "Adding…" : "Add fonts" }}
        </Button>
      </div>
      <Input
        ref="input"
        type="file"
        :disabled="busy || disabled"
        multiple
        accept=".woff2,.woff,.ttf,.otf"
        class="sr-only"
        tabindex="-1"
        aria-label="Upload custom fonts"
        @change="uploadSelection($event)"
      />
      <InlineAlert v-if="!family" :message="localError" />
    </section>
    <DialogContent
      :title="family"
      close-label="Close font details"
      :close-disabled="busy"
      :aria-describedby="undefined"
      @close-auto-focus.prevent
      @escape-key-down="busy && $event.preventDefault()"
      @interact-outside="busy && $event.preventDefault()"
    >
      <Label v-if="familyFaces.length > 1" class="custom-file-picker"
        >File
        <NativeSelect
          v-model="selectedId"
          :disabled="busy || disabled || changed"
        >
          <option v-for="face in familyFaces" :key="face.id" :value="face.id">
            {{ face.fileName }}
          </option>
        </NativeSelect>
      </Label>
      <form
        v-if="draft && selectedFace"
        id="custom-font-form"
        class="custom-face-fields"
        @submit.prevent="edit(draft)"
      >
        <Label
          >Family name<Input
            v-model="draft.family"
            :disabled="busy || disabled"
            maxlength="150"
        /></Label>
        <div class="advanced-grid">
          <Label
            >{{
              draft.axes.some((axis) => axis.tag === "wght")
                ? "Default weight"
                : "Weight"
            }}
            <Input
              v-model.number="draft.weight"
              :disabled="busy || disabled"
              type="number"
              min="1"
              max="1000"
              required
            />
          </Label>
          <Label
            >Style<NativeSelect
              v-model="draft.style"
              :disabled="busy || disabled"
            >
              <option value="normal">Normal</option>
              <option value="italic">Italic</option>
            </NativeSelect></Label
          >
        </div>
        <div class="custom-file-summary">
          <span class="subtle"
            >{{ weightLabel(selectedFace) }} ·
            {{ selectedFace.style === "italic" ? "Italic" : "Normal" }}</span
          >
          <span
            class="custom-file-name subtle"
            :title="selectedFace.fileName"
            >{{ selectedFace.fileName }}</span
          >
        </div>
        <p v-if="changed" class="subtle">
          Rules that can no longer use this file will use the page’s font
          family.
        </p>
        <div class="custom-file-actions">
          <Button
            type="button"
            variant="quiet"
            size="xs"
            :disabled="busy || disabled"
            @click="replace(selectedFace)"
            ><Icon name="upload" />Replace file</Button
          >
          <Button
            type="button"
            variant="destructive-ghost"
            size="xs"
            :disabled="busy || disabled"
            @click="deleting = selectedFace"
            ><Icon name="trash" />Delete file</Button
          >
        </div>
      </form>
      <p v-else class="subtle">This font file is no longer available.</p>
      <Input
        ref="replacementInput"
        type="file"
        class="sr-only"
        tabindex="-1"
        :disabled="busy || disabled"
        accept=".woff2,.woff,.ttf,.otf"
        :aria-label="`Replace ${replacing?.fileName ?? 'custom font file'}`"
        @change="replacing && uploadSelection($event, replacing.id)"
      />
      <InlineAlert :message="localError" />
      <template #footer>
        <div class="action-row confirmation-actions">
          <Button type="button" variant="outline" :disabled="busy" @click="back"
            >Cancel</Button
          >
          <Button
            type="submit"
            form="custom-font-form"
            variant="default"
            :disabled="!changed || busy || disabled"
            >{{ busy ? "Saving…" : "Save changes" }}</Button
          >
        </div>
      </template>
      <ConfirmAction
        :open="!!deleting"
        title="Delete this font file?"
        :description="`${deleting?.fileName ?? ''} will be removed from this device. Rules using this file will fall back to the page’s font family if no matching file remains.`"
        action="Delete file"
        :busy="busy || disabled"
        @update:open="!$event && (deleting = undefined)"
        @confirm="deleting && remove(deleting.id)"
      />
    </DialogContent>
  </Dialog>
</template>
