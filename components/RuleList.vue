<script setup lang="ts">
import Disclosure from "./Disclosure.vue";
import { Card } from "@/components/ui/card";
import { computed, nextTick, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Rule } from "../core/schema";
import ActionMenu from "./ActionMenu.vue";
import Icon from "./Icon.vue";
import InlineAlert from "./InlineAlert.vue";
import RuleTargetChips from "./RuleTargetChips.vue";
import ConfirmAction from "./ConfirmAction.vue";
import { openDetails } from "../core/disclosure";
import { useRuleListScroll } from "../composables/useRuleListScroll";
const props = defineProps<{
  rules: Rule[];
  selected: string;
  disabled: boolean;
  inert?: boolean;
  blocked?: boolean;
  openOnActivate?: boolean;
  contextKey: string;
  error?: string;
}>();
const emit = defineEmits<{
  action: [
    id: string,
    action: "toggle" | "delete" | "duplicate" | "up" | "down" | "select",
  ];
  create: [];
  highlight: [rule?: Rule];
  reorder: [id: string, targetId: string, position: "before" | "after"];
  delete: [ids: string[]];
}>();
const selecting = defineModel<boolean>("selecting", { required: true });
const selectedIds = defineModel<string[]>("selectedIds", { required: true });
const deletingIds = ref<string[]>([]);
const selectedCount = computed(() => selectedIds.value.length);
const bulkAction = computed(
  () =>
    `Delete ${deletingIds.value.length} ${deletingIds.value.length === 1 ? "rule" : "rules"}`,
);
let selectionContext = "";
const dragging = ref("");
const dropTarget = ref("");
const dropPosition = ref<"before" | "after">("before");
const deleting = ref<Rule>();
const list = ref<HTMLElement>();
const rows = ref<HTMLElement>();
const { moreAbove, moreBelow, measure, reveal, trackDrag, stopDragScroll } =
  useRuleListScroll(
    list,
    rows,
    () => props.selected,
    () => props.rules.map((rule) => rule.id),
    updateDropTarget,
  );
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) endDrag();
    else if (focusAfterDelete.value !== undefined) {
      deleting.value = undefined;
      clearSelectionMode();
    }
  },
);
function clearSelectionMode() {
  selecting.value = false;
  selectedIds.value = [];
  deletingIds.value = [];
}
watch(
  () => props.contextKey,
  () => {
    clearSelectionMode();
    deleting.value = undefined;
    focusAfterDelete.value = undefined;
  },
);
watch(
  () => props.blocked,
  (blocked) => {
    if (blocked) clearSelectionMode();
  },
);
async function startSelection(all: boolean) {
  if (props.disabled || !props.rules.length) return;
  endDrag();
  emit("highlight");
  selectionContext = props.contextKey;
  selecting.value = true;
  selectedIds.value = all ? props.rules.map((rule) => rule.id) : [];
  await nextTick();
  if (!selecting.value || selectionContext !== props.contextKey) return;
  await openDetails("rules", '.rule-row[role="checkbox"]');
}
async function cancelSelection() {
  if (props.disabled || deletingIds.value.length) return;
  clearSelectionMode();
  await nextTick();
  document
    .getElementById("rules-actions-button")
    ?.focus({ preventScroll: true });
}
function escapeSelection(event: KeyboardEvent) {
  if (!selecting.value || props.disabled || deletingIds.value.length) return;
  event.preventDefault();
  event.stopPropagation();
  void cancelSelection();
}
function toggleSelection(id: string, checked?: boolean) {
  if (props.disabled || !selecting.value) return;
  const selected = selectedIds.value.includes(id);
  if (checked ?? !selected) {
    if (!selected) selectedIds.value = [...selectedIds.value, id];
  } else selectedIds.value = selectedIds.value.filter((item) => item !== id);
}
function toggleSelectionKey(event: KeyboardEvent, id: string) {
  if (!selecting.value || (event.key !== " " && event.key !== "Enter")) return;
  event.preventDefault();
  event.stopPropagation();
  toggleSelection(id);
}
function ruleLabel(rule?: Rule) {
  return (
    rule?.selector ||
    (rule?.font || Object.keys(rule?.properties ?? {}).length
      ? "No targets"
      : "Blank rule")
  );
}
const focusAfterDelete = ref<string>();
watch(
  () => props.rules,
  (rules, previous) => {
    if (selectionContext !== props.contextKey) clearSelectionMode();
    const removedIds = deletingIds.value.length
      ? deletingIds.value
      : deleting.value
        ? [deleting.value.id]
        : [];
    if (
      removedIds.length &&
      removedIds.every((id) => !rules.some((rule) => rule.id === id))
    ) {
      const index = previous.findIndex((rule) => removedIds.includes(rule.id));
      focusAfterDelete.value =
        rules[Math.min(index, rules.length - 1)]?.id ?? "";
      if (!props.disabled) {
        deleting.value = undefined;
        clearSelectionMode();
      }
    }
    selectedIds.value = selectedIds.value.filter((id) =>
      rules.some((rule) => rule.id === id),
    );
    if (!rules.length && !removedIds.length) clearSelectionMode();
  },
);
function returnRuleFocus(event: Event) {
  const id = focusAfterDelete.value;
  if (id === undefined) return;
  focusAfterDelete.value = undefined;
  event.preventDefault();
  if (!id) {
    void openDetails("targets", "#selector");
    return;
  }
  document
    .querySelector<HTMLElement>(`[data-rule-id="${id}"] .rule-select`)
    ?.focus({ preventScroll: true });
}
function endDrag() {
  stopDragScroll();
  dragging.value = "";
  dropTarget.value = "";
}
function startDrag(event: DragEvent, id: string) {
  if (props.disabled || props.rules.length < 2) {
    event.preventDefault();
    return;
  }
  dragging.value = id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    const row = (event.currentTarget as HTMLElement).closest(".rule-row");
    if (row) event.dataTransfer.setDragImage(row, 16, 16);
  }
}
function over(event: DragEvent) {
  if (props.disabled || !dragging.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  trackDrag(event.clientY);
  updateDropTarget(event.clientY);
}
function updateDropTarget(clientY: number) {
  // Include the gaps between rows so the insertion indicator stays usable.
  const children = Array.from(rows.value?.children ?? []);
  const row = (children.find(
    (row) => clientY <= row.getBoundingClientRect().bottom,
  ) ?? children.at(-1)) as HTMLElement | undefined;
  const id = row?.dataset.ruleId;
  if (!row || !id || id === dragging.value) {
    dropTarget.value = "";
    return;
  }
  const rect = row.getBoundingClientRect();
  dropTarget.value = id;
  dropPosition.value =
    clientY < rect.top + rect.height / 2 ? "before" : "after";
}
function leaveList(event: DragEvent) {
  if (
    !(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)
  ) {
    stopDragScroll();
    dropTarget.value = "";
  }
}
function focusRow(event: FocusEvent) {
  const target = event.target as HTMLElement;
  reveal(target.closest<HTMLElement>(".rule-row"));
}
function drop(event: DragEvent) {
  if (props.disabled || !dragging.value) return;
  event.preventDefault();
  updateDropTarget(event.clientY);
  if (dropTarget.value)
    emit("reorder", dragging.value, dropTarget.value, dropPosition.value);
  endDrag();
}
</script>
<template>
  <Card
    class="rules-card"
    :inert="inert"
    aria-labelledby="rules-heading"
    @keydown.esc="escapeSelection"
  >
    <Disclosure
      id="rules"
      persist-key="rules"
      heading="h2"
      heading-id="rules-heading"
      :inactive="!rules.length"
      :blocked="blocked"
      :open-on-activate="openOnActivate"
      show-actions-when-closed
      default-open
      @update:open="!$event && clearSelectionMode()"
    >
      <template #title>Rules</template>
      <template #actions>
        <div class="rule-mode-action">
          <div
            :class="{ 'rule-mode-inactive': selecting }"
            :inert="selecting"
            :aria-hidden="selecting || undefined"
          >
            <ActionMenu
              trigger-id="rules-actions-button"
              label="Rules actions"
              icon
              :disabled="disabled || !rules.length || selecting"
              :items="[
                { id: 'select', label: 'Select rules…' },
                { id: 'select-all', label: 'Select all rules' },
              ]"
              @select="startSelection($event === 'select-all')"
            />
          </div>
          <Button
            size="xs"
            variant="secondary"
            :class="{ 'rule-mode-inactive': !selecting }"
            :inert="!selecting"
            :aria-hidden="!selecting || undefined"
            :disabled="disabled || !selecting"
            @click="cancelSelection"
            >Done</Button
          >
        </div>
        <Button
          id="new-rule-button"
          size="xs"
          :disabled="disabled || !rules.length || selecting"
          title="Create a blank rule"
          @click="emit('create')"
        >
          <Icon name="plus" /> New
        </Button>
      </template>
      <div v-if="selecting" class="rule-bulk-toolbar">
        <Button
          variant="quiet"
          :disabled="disabled || selectedCount === rules.length"
          @click="selectedIds = rules.map((rule) => rule.id)"
          ><Icon name="select-all" />Select all {{ rules.length }}</Button
        >
        <span class="rule-bulk-count" role="status" aria-live="polite">{{
          selectedCount
            ? `Editing ${selectedCount} ${selectedCount === 1 ? "rule" : "rules"}`
            : "No rules selected"
        }}</span>
      </div>
      <template #inactive>
        <div
          role="img"
          aria-label="Rule preview. Choose a target to create your first rule."
        >
          <div class="rule-row rule-row-preview" aria-hidden="true" inert>
            <span class="rule-drag"><Icon name="grip" /></span>
            <span class="rule-visibility rule-visibility-indicator">
              <Icon name="eye" />
            </span>
            <div class="rule-main">
              <div class="rule-select">
                <span class="rule-placeholder">Blank rule</span>
                <span class="rule-meta subtle">
                  <span>Original font</span>
                  <span class="rule-change-count">0 changes</span>
                </span>
              </div>
            </div>
            <span class="rule-preview-actions"><Icon name="more" /></span>
          </div>
        </div>
      </template>
      <div
        ref="list"
        class="rule-list"
        role="region"
        aria-label="Typography rules"
        :data-more-above="moreAbove || undefined"
        :data-more-below="moreBelow || undefined"
        @scroll="measure"
        @focusin="focusRow"
        @dragover="over"
        @dragleave="leaveList"
        @drop="drop"
      >
        <div ref="rows">
          <div
            v-for="(rule, index) in rules"
            :key="rule.id"
            class="rule-row"
            :class="{
              editing: selected === rule.id,
              selecting,
              'bulk-selected': selecting && selectedIds.includes(rule.id),
              disabled: !rule.enabled,
              dragging: dragging === rule.id,
              'drop-before':
                dropTarget === rule.id && dropPosition === 'before',
              'drop-after': dropTarget === rule.id && dropPosition === 'after',
            }"
            :data-rule-id="rule.id"
            :role="selecting ? 'checkbox' : undefined"
            :tabindex="selecting && !disabled ? 0 : undefined"
            :aria-checked="
              selecting ? selectedIds.includes(rule.id) : undefined
            "
            :aria-disabled="selecting ? disabled : undefined"
            :aria-label="
              selecting
                ? `Select rule ${index + 1}: ${ruleLabel(rule)} · ${rule.font?.family ?? 'Original font'}${rule.enabled ? '' : ' · Hidden'}`
                : undefined
            "
            @click="selecting && toggleSelection(rule.id)"
            @keydown="toggleSelectionKey($event, rule.id)"
            @mouseenter="!disabled && emit('highlight', rule)"
            @mouseleave="emit('highlight')"
            @focusin="!disabled && emit('highlight', rule)"
            @focusout="
              (event) => {
                if (
                  !(event.currentTarget as HTMLElement).contains(
                    event.relatedTarget as Node,
                  )
                )
                  emit('highlight');
              }
            "
          >
            <span
              v-if="selecting"
              class="rule-bulk-toggle"
              aria-hidden="true"
              inert
            >
              <Checkbox
                class="rule-bulk-checkbox"
                :model-value="selectedIds.includes(rule.id)"
                :disabled="disabled"
                :tabindex="-1"
              />
            </span>
            <Button
              v-else
              class="rule-drag"
              variant="ghost"
              size="icon-xs"
              :disabled="disabled || rules.length < 2"
              :draggable="!disabled && rules.length > 1"
              :aria-label="`Reorder rule ${index + 1}`"
              title="Drag to reorder. Arrow keys move this rule."
              @dragstart="startDrag($event, rule.id)"
              @dragend="endDrag"
              @keydown.up.prevent="index > 0 && emit('action', rule.id, 'up')"
              @keydown.down.prevent="
                index < rules.length - 1 && emit('action', rule.id, 'down')
              "
              ><Icon name="grip"
            /></Button>
            <span
              v-if="selecting"
              class="rule-visibility rule-visibility-indicator"
              role="img"
              :aria-label="`Rule ${index + 1} is ${rule.enabled ? 'visible' : 'hidden'}`"
            >
              <Icon :name="rule.enabled ? 'eye' : 'eye-off'" />
            </span>
            <Button
              v-else
              class="rule-visibility"
              variant="ghost"
              size="icon"
              :aria-label="`Rule ${index + 1} visibility`"
              :aria-pressed="rule.enabled"
              :title="`${rule.enabled ? 'Hide' : 'Show'} rule ${index + 1}`"
              :disabled="disabled"
              @click="emit('action', rule.id, 'toggle')"
            >
              <Icon :name="rule.enabled ? 'eye' : 'eye-off'" />
            </Button>
            <div class="rule-main" :inert="selecting">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    class="rule-select"
                    :disabled="disabled"
                    :tabindex="selecting ? -1 : undefined"
                    :aria-label="`${ruleLabel(rule)} · ${rule.font?.family ?? 'Original font'}`"
                    @click="!selecting && emit('action', rule.id, 'select')"
                  >
                    <RuleTargetChips :rule="rule" />
                    <span class="rule-meta subtle">
                      <span>{{
                        [
                          rule.font?.family ?? "Original font",
                          rule.properties["font-weight"],
                          rule.properties["font-size"],
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }}</span>
                      <span class="rule-change-count"
                        >{{ Object.keys(rule.properties).length }}
                        {{
                          Object.keys(rule.properties).length === 1
                            ? "change"
                            : "changes"
                        }}</span
                      >
                      <span
                        v-if="!selecting && selected === rule.id"
                        class="editing-label"
                        >Editing</span
                      >
                    </span></Button
                  >
                </TooltipTrigger>
                <TooltipContent
                  v-if="rule.selector && !selecting"
                  class="rule-selector-tooltip mono"
                  :collision-padding="8"
                  >{{ rule.selector }}</TooltipContent
                >
              </Tooltip>
            </div>
            <div v-if="!selecting" class="rule-actions">
              <ActionMenu
                :label="`Actions for rule ${index + 1}`"
                icon
                :disabled="disabled"
                :items="[
                  ...(rules.length > 1
                    ? [
                        {
                          id: 'up',
                          label: `Move rule ${index + 1} up`,
                          disabled: index === 0,
                        },
                        {
                          id: 'down',
                          label: `Move rule ${index + 1} down`,
                          disabled: index === rules.length - 1,
                        },
                      ]
                    : []),
                  { id: 'duplicate', label: `Duplicate rule ${index + 1}` },
                  {
                    id: 'delete',
                    label: `Delete rule ${index + 1}`,
                    danger: true,
                  },
                ]"
                @select="
                  $event === 'delete'
                    ? (deleting = rule)
                    : emit(
                        'action',
                        rule.id,
                        $event as 'up' | 'down' | 'duplicate' | 'delete',
                      )
                "
              />
            </div>
          </div>
        </div>
      </div>
      <div v-if="selecting" class="rule-bulk-actions">
        <Button
          variant="quiet"
          :disabled="disabled || !selectedCount"
          @click="selectedIds = []"
          >Clear selection</Button
        >
        <Button
          id="delete-selected-rules"
          variant="destructive"
          :disabled="disabled || !selectedCount"
          @click="deletingIds = [...selectedIds]"
          >Delete {{ selectedCount }}
          {{ selectedCount === 1 ? "rule" : "rules" }}</Button
        >
      </div>
      <p v-if="!selecting && rules.length > 1" class="subtle">
        Rules at the top take priority.
      </p>
    </Disclosure>
  </Card>
  <ConfirmAction
    :open="!!deleting"
    title="Delete this rule?"
    :description="`${ruleLabel(deleting)} will be removed. You can undo this.`"
    action="Delete rule"
    :busy="disabled"
    @close-auto-focus="returnRuleFocus"
    @update:open="!$event && (deleting = undefined)"
    @confirm="deleting && emit('action', deleting.id, 'delete')"
  />
  <ConfirmAction
    :open="!!deletingIds.length"
    :title="`${bulkAction}?`"
    :description="`${bulkAction} from this page. You can undo this in one step.`"
    :action="bulkAction"
    :busy="disabled"
    @close-auto-focus="returnRuleFocus"
    @update:open="!$event && (deletingIds = [])"
    @confirm="emit('delete', [...deletingIds])"
  >
    <InlineAlert :message="error" />
  </ConfirmAction>
</template>
