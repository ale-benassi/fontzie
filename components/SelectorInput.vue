<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Target } from "../core/schema";
import type { TargetElement } from "../core/messages";
import { targetQuery } from "../core/targets";
import { splitSelectorDraft } from "../core/selectors";
import Icon from "./Icon.vue";
import ExactTargetMenu from "./ExactTargetMenu.vue";

const props = defineProps<{
  modelValue: string;
  disabled: boolean;
  placeholder?: string;
  exactTargets?: Target[];
  appliedSelectors: string[];
  getTargetElement: (target: Target) => Promise<TargetElement>;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  remove: [value: string];
  clear: [];
  commit: [value: string];
  highlight: [selector?: string];
  removeExact: [handle?: string];
  addSelector: [selector: string];
}>();
const root = ref<HTMLElement>();
const tokens = ref(splitSelectorDraft(props.modelValue).parts);
const addition = ref("");
const separatorRevision = ref(0);
let committed = props.modelValue.trim();
const value = () =>
  [...tokens.value, ...(addition.value.trim() ? [addition.value] : [])].join(
    ", ",
  );
const update = () => emit("update:modelValue", value());
watch(
  () => props.modelValue,
  (next) => {
    if (next === value()) return;
    tokens.value = splitSelectorDraft(next).parts;
    addition.value = "";
    committed = next.trim();
  },
);
function focusInput(index: number) {
  void nextTick(() =>
    root.value?.querySelectorAll<HTMLInputElement>("input")[index]?.focus(),
  );
}
function commit() {
  const next = value().trim();
  if (next === committed) return;
  committed = next;
  if (next || props.exactTargets?.length) emit("commit", next);
  else emit("clear");
}
function onEnter(event: KeyboardEvent) {
  if (!(event.target instanceof HTMLInputElement)) return;
  event.preventDefault();
  add();
  commit();
}
function edit(index: number, next: string | number) {
  const text = String(next);
  const { parts, trailing, separated } = splitSelectorDraft(text);
  if (separated) {
    tokens.value.splice(index, 1, ...parts);
    separatorRevision.value++;
    focusInput(index + parts.length - (trailing ? 0 : 1));
  } else tokens.value[index] = text;
  update();
  if (separated) commit();
}
function editAddition(next: string | number) {
  const text = String(next);
  const { parts, trailing, separated } = splitSelectorDraft(text);
  if (separated) {
    tokens.value.push(...parts);
    addition.value = "";
    // Recreate the inputs even when consuming a comma leaves the model unchanged.
    separatorRevision.value++;
    focusInput(tokens.value.length - (trailing ? 0 : 1));
  } else addition.value = text;
  update();
  if (separated) commit();
}
function tokenize(index: number) {
  tokens.value.splice(
    index,
    1,
    ...splitSelectorDraft(tokens.value[index] ?? "").parts,
  );
  update();
}
function add() {
  if (!addition.value.trim()) return;
  tokens.value.push(...splitSelectorDraft(addition.value).parts);
  addition.value = "";
  update();
}
function backspace(event: KeyboardEvent) {
  if (props.disabled || event.isComposing || event.repeat || addition.value)
    return;
  if (!tokens.value.length && !props.exactTargets?.length) return;
  event.preventDefault();
  if (tokens.value.length) remove(tokens.value.length - 1);
  else {
    const target = props.exactTargets?.at(-1);
    if (target?.kind === "exact") emit("removeExact", target.handle);
  }
}
function remove(index: number) {
  if (
    tokens.value.length === 1 &&
    !addition.value &&
    !props.exactTargets?.length
  ) {
    emit("clear");
    return;
  }
  tokens.value.splice(index, 1);
  update();
  committed = value().trim();
  emit("remove", value());
  void nextTick(() =>
    root.value
      ?.querySelectorAll<HTMLInputElement>("input")
      [Math.min(index, tokens.value.length)]?.focus(),
  );
}
</script>
<template>
  <div
    ref="root"
    class="selector-editor"
    role="group"
    aria-label="Targets"
    :aria-disabled="disabled"
    @focusout="
      (event) => {
        if (!root?.contains(event.relatedTarget as Node)) {
          add();
          commit();
        }
      }
    "
    @keydown.enter="onEnter"
  >
    <span
      v-for="target in exactTargets"
      :key="
        target.kind === 'exact'
          ? (target.handle ?? target.selector)
          : target.selector
      "
      class="selector-tag exact-target"
      @mouseenter="!disabled && emit('highlight', targetQuery(target))"
      @mouseleave="emit('highlight')"
      @focusin="!disabled && emit('highlight', targetQuery(target))"
      @focusout="emit('highlight')"
    >
      <ExactTargetMenu
        :target="target"
        :disabled="disabled"
        :applied-selectors="appliedSelectors"
        :get-target-element="getTargetElement"
        @select="emit('addSelector', $event)"
        @highlight="emit('highlight', $event)"
      />
      <Button
        type="button"
        variant="quiet"
        size="icon-xs"
        :disabled="disabled"
        :aria-label="
          (exactTargets?.length ?? 0) + tokens.length === 1
            ? 'Clear target'
            : `Remove picked element ${target.selector}`
        "
        :title="`Remove picked element ${target.selector}`"
        @click="
          emit(
            'removeExact',
            target.kind === 'exact' ? target.handle : undefined,
          )
        "
        ><Icon name="close"
      /></Button>
    </span>
    <span
      v-for="(token, index) in tokens"
      :key="`${separatorRevision}-${index}`"
      class="selector-tag selector-token"
      @mouseenter="!disabled && emit('highlight', token)"
      @mouseleave="emit('highlight')"
      @focusin="!disabled && emit('highlight', token)"
      @focusout="emit('highlight')"
    >
      <Input
        :id="index === 0 ? 'selector' : undefined"
        class="mono"
        :aria-label="index === 0 ? 'CSS selector' : `Selector ${index + 1}`"
        :model-value="token"
        :disabled="disabled"
        :title="token"
        :style="{ width: `calc(${Math.max(1, token.length)}ch + 8px)` }"
        autocomplete="off"
        spellcheck="false"
        @update:model-value="edit(index, $event)"
        @blur="tokenize(index)"
      />
      <Button
        type="button"
        variant="quiet"
        size="icon-xs"
        :disabled="disabled"
        :aria-label="
          tokens.length === 1 && !addition && !exactTargets?.length
            ? 'Clear target'
            : `Remove selector ${token}`
        "
        :title="
          tokens.length === 1 && !addition && !exactTargets?.length
            ? 'Remove the final target from this rule'
            : `Remove ${token}`
        "
        @click="remove(index)"
        ><Icon name="close"
      /></Button>
    </span>
    <Input
      :key="separatorRevision"
      :id="tokens.length ? 'selector-add' : 'selector'"
      class="selector-add mono"
      :aria-label="tokens.length ? 'Add selector' : 'CSS selector'"
      :model-value="addition"
      :placeholder="
        tokens.length || exactTargets?.length
          ? 'Add selector…'
          : (placeholder ?? 'Pick an element or type a selector…')
      "
      :disabled="disabled"
      autocomplete="off"
      spellcheck="false"
      @keydown.backspace="backspace"
      @update:model-value="editAddition"
      @blur="add"
    />
    <Button
      v-if="tokens.length + (exactTargets?.length ?? 0) > 1"
      type="button"
      class="selector-clear"
      variant="quiet"
      size="icon-xs"
      aria-label="Clear target"
      title="Remove all targets from this rule"
      :disabled="disabled"
      @click="emit('clear')"
      ><Icon name="close"
    /></Button>
  </div>
</template>
