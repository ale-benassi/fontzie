<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { DropdownMenuArrow, DropdownMenuLabel } from "reka-ui";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { Target } from "../core/schema";
import type { TargetElement } from "../core/messages";
import { errorMessage } from "../core/errors";
import Icon from "./Icon.vue";

const props = defineProps<{
  target: Target;
  disabled: boolean;
  appliedSelectors: string[];
  getTargetElement: (target: Target) => Promise<TargetElement>;
}>();
const emit = defineEmits<{
  select: [selector: string];
  highlight: [selector?: string];
}>();
const element = ref<TargetElement>();
const options = computed(() => {
  if (!element.value) return [];
  const { tag, classes } = element.value;
  return [
    {
      selector: CSS.escape(tag),
      label: tag === "p" ? "All paragraphs" : `All ${tag} elements`,
    },
    ...classes.map((name) => ({ selector: `.${CSS.escape(name)}`, label: "" })),
  ].map((option) => ({
    ...option,
    added: props.appliedSelectors.includes(option.selector),
  }));
});
const loading = ref(false);
const error = ref("");
let revision = 0;
onUnmounted(() => revision++);
async function onOpen(open: boolean) {
  const current = ++revision;
  emit("highlight");
  if (!open) return;
  loading.value = true;
  error.value = "";
  element.value = undefined;
  try {
    const result = await props.getTargetElement(props.target);
    if (current === revision) element.value = result;
  } catch (e) {
    if (current === revision) error.value = errorMessage(e);
  } finally {
    if (current === revision) loading.value = false;
  }
}
</script>
<template>
  <DropdownMenu @update:open="onOpen">
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="exact-target-label"
        :disabled="disabled"
        :aria-label="`Picked ${target.selector}`"
        :title="`Picked element: ${target.selector}. Add targets by tag or class…`"
      >
        <Icon name="pick" />
        <span>Picked</span>
        <code>{{ target.selector }}</code>
        <Icon name="down" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="ui-menu exact-target-menu"
        align="start"
        :align-offset="-5"
        :side-offset="4"
        :arrow-padding="12"
        :collision-padding="8"
        @pointerleave="emit('highlight')"
      >
        <DropdownMenuLabel class="exact-target-menu-label"
          >Add targets by tag or class</DropdownMenuLabel
        >
        <div class="exact-target-menu-options">
          <DropdownMenuItem
            v-if="loading || error"
            class="ui-menu-item"
            disabled
          >
            {{ loading ? "Loading target options…" : error }}
          </DropdownMenuItem>
          <DropdownMenuItem
            v-for="{ selector, label, added } in options"
            :key="selector"
            class="ui-menu-item"
            :disabled="added"
            :data-added="added || undefined"
            @select="emit('select', selector)"
            @pointerenter="emit('highlight', selector)"
            @pointerleave="emit('highlight')"
            @focus="emit('highlight', selector)"
            @blur="emit('highlight')"
          >
            <code>{{ selector }}</code>
            <span v-if="added || label" class="subtle">{{
              added ? "Already added" : label
            }}</span>
          </DropdownMenuItem>
        </div>
        <DropdownMenuArrow
          class="exact-target-menu-arrow"
          :width="12"
          :height="6"
        />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenu>
</template>
