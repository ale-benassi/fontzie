<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  readCardState,
  saveCardState,
  type CardId,
} from "../storage/card-state";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import Icon from "./Icon.vue";
const props = withDefaults(
  defineProps<{
    open?: boolean;
    defaultOpen?: boolean;
    heading?: "h2" | "h3";
    headingId?: string;
    persistKey?: CardId;
    showActionsWhenClosed?: boolean;
    inactive?: boolean;
    blocked?: boolean;
    headingDisabled?: boolean;
    openOnActivate?: boolean;
  }>(),
  {
    open: undefined,
    defaultOpen: false,
    inactive: false,
    openOnActivate: undefined,
  },
);
const emit = defineEmits<{ "update:open": [open: boolean] }>();
const local = ref(props.defaultOpen);
const activationOpen = ref<boolean>();
const saved = computed(() =>
  props.persistKey ? readCardState(props.persistKey) : undefined,
);
const expanded = computed(
  () =>
    props.inactive ||
    (props.open ?? activationOpen.value ?? saved.value ?? local.value),
);
watch(
  () => props.inactive,
  (inactive) => {
    activationOpen.value =
      inactive || saved.value !== undefined ? undefined : props.openOnActivate;
  },
);
watch(saved, (open) => {
  activationOpen.value = undefined;
  if (open !== undefined && props.open !== undefined && props.open !== open)
    emit("update:open", open);
});
watch(
  () => props.open,
  (open) => {
    if (props.persistKey && open !== undefined)
      void saveCardState(props.persistKey, open);
  },
);
function update(open: boolean) {
  if (props.inactive || props.blocked || props.headingDisabled) return;
  activationOpen.value = undefined;
  local.value = open;
  if (props.persistKey) void saveCardState(props.persistKey, open);
  emit("update:open", open);
}
</script>
<template>
  <Collapsible
    class="disclosure"
    :data-card="persistKey"
    :data-inactive="inactive || undefined"
    :data-blocked="blocked || undefined"
    :data-heading-disabled="headingDisabled || undefined"
    :aria-disabled="inactive || blocked || undefined"
    :open="expanded"
    :disabled="inactive || blocked || headingDisabled"
    @update:open="update"
  >
    <CardHeader :plain="!heading" interactive class="disclosure-header">
      <component
        :is="heading ?? 'div'"
        :id="headingId"
        class="disclosure-heading"
        :class="{ 'disclosure-title': heading }"
      >
        <CollapsibleTrigger as-child>
          <Button
            variant="ghost"
            class="disclosure-trigger"
            :disabled="inactive || blocked || headingDisabled"
          >
            <span class="disclosure-label">
              <slot name="title" />
              <Icon
                v-if="!inactive && !blocked && !headingDisabled"
                name="right"
                class="disclosure-chevron"
              />
            </span>
          </Button>
        </CollapsibleTrigger>
      </component>
      <div
        v-if="$slots.actions && (expanded || showActionsWhenClosed)"
        class="disclosure-actions"
        :inert="inactive || blocked"
      >
        <slot name="actions" :expanded="expanded" />
      </div>
    </CardHeader>
    <CollapsibleContent
      class="disclosure-content"
      :inert="!expanded || blocked || (inactive && !$slots.inactive)"
      :data-inactive-controls="(inactive && !$slots.inactive) || undefined"
    >
      <div class="disclosure-body">
        <slot v-if="inactive && $slots.inactive" name="inactive" />
        <div v-else-if="inactive && $slots.preview" class="disclosure-preview">
          <slot name="preview" />
        </div>
        <slot v-else />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
