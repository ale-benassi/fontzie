<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuItem,
  DropdownMenuFilter,
} from "@/components/ui/dropdown-menu";
import Icon from "./Icon.vue";

const props = defineProps<{
  names: string[];
  selected: string;
  modified: boolean;
  disabled: boolean;
  canSave: boolean;
}>();
const emit = defineEmits<{
  apply: [name: string];
  rename: [name: string];
  delete: [name: string];
  create: [];
}>();
const trigger = ref<{ $el: HTMLButtonElement }>();
const open = ref(false);
const search = ref("");
let returnToTrigger = true;
const menuId = useId();
const filteredNames = computed(() => {
  const query = search.value.trim().toLowerCase();
  return props.names.filter((name) => name.toLowerCase().includes(query));
});
watch(open, (value) => {
  if (value) {
    search.value = "";
    returnToTrigger = true;
  }
});
function returnFocus(event: Event) {
  // Reka's default focus() can scroll a sticky footer back into normal view.
  event.preventDefault();
  // A closing menu must not steal focus from a dialog it just opened.
  if (returnToTrigger && !props.disabled)
    trigger.value?.$el.focus({ preventScroll: true });
}
function manage(action: "rename" | "delete", name: string) {
  returnToTrigger = false;
  open.value = false;
  if (action === "rename") emit("rename", name);
  else emit("delete", name);
}
function createPreset() {
  returnToTrigger = false;
  open.value = false;
  emit("create");
}
</script>
<template>
  <DropdownMenu v-model:open="open">
    <DropdownMenuTrigger as-child>
      <Button
        ref="trigger"
        class="preset-picker"
        aria-label="Presets"
        aria-haspopup="dialog"
        :disabled="disabled"
      >
        <span class="preset-picker-name">{{ selected || "Presets" }}</span>
        <span v-if="modified" class="preset-modified">Modified</span>
        <Icon name="down" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        as-child
        align="start"
        :side-offset="4"
        :collision-padding="8"
        @close-auto-focus="returnFocus"
      >
        <div
          class="ui-menu preset-menu"
          role="dialog"
          :aria-orientation="undefined"
        >
          <div class="preset-menu-search">
            <DropdownMenuFilter
              v-model="search"
              class="ui-field"
              placeholder="Search presets…"
              aria-label="Search presets"
              :aria-controls="menuId"
              :auto-focus="true"
            />
          </div>
          <p
            v-if="!filteredNames.length"
            class="preset-menu-empty"
            role="status"
          >
            {{ names.length ? "No matching presets" : "No presets yet" }}
          </p>
          <div
            :id="menuId"
            class="preset-menu-options"
            role="menu"
            aria-label="Preset actions"
          >
            <div
              v-if="filteredNames.length"
              class="preset-menu-list"
              role="group"
              aria-label="Saved presets"
              tabindex="0"
            >
              <div
                v-for="name in filteredNames"
                :key="name"
                class="preset-menu-row"
              >
                <DropdownMenuItem
                  class="ui-menu-item preset-menu-apply"
                  :aria-label="`Apply ${name}`"
                  @select="emit('apply', name)"
                >
                  <span>{{ name }}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="ui-menu-item preset-menu-manage"
                  :aria-label="`Rename ${name}`"
                  title="Rename preset"
                  @select="manage('rename', name)"
                  ><Icon name="rename"
                /></DropdownMenuItem>
                <DropdownMenuItem
                  class="ui-menu-item preset-menu-manage danger"
                  :aria-label="`Delete ${name}`"
                  title="Delete preset"
                  @select="manage('delete', name)"
                  ><Icon name="trash"
                /></DropdownMenuItem>
              </div>
            </div>

            <div class="preset-menu-footer">
              <DropdownMenuItem
                as-child
                :disabled="disabled || !canSave"
                @select="createPreset"
              >
                <Button
                  variant="ghost"
                  class="preset-menu-create"
                  :disabled="disabled || !canSave"
                  ><Icon name="plus" />Save as new…</Button
                >
              </DropdownMenuItem>
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenu>
</template>
