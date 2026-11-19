<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import Icon from "./Icon.vue";
defineProps<{
  label: string;
  icon?: boolean;
  triggerId?: string;
  disabled?: boolean;
  items: { id: string; label: string; disabled?: boolean; danger?: boolean }[];
}>();
const emit = defineEmits<{ select: [id: string] }>();
</script>
<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        :id="triggerId"
        :size="icon ? 'icon' : 'default'"
        :variant="
          items.length && items.every((item) => item.danger)
            ? 'destructive-ghost'
            : 'ghost'
        "
        :class="icon ? 'icon-button' : 'menu-button'"
        :aria-label="label"
        :title="label"
        :disabled="disabled"
      >
        <Icon v-if="icon" name="more" />
        <template v-else>{{ label }}<Icon name="down" /></template>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="ui-menu"
        align="end"
        :side-offset="4"
        :collision-padding="8"
      >
        <DropdownMenuItem
          v-for="item in items"
          :key="item.id"
          class="ui-menu-item"
          :class="{ danger: item.danger }"
          :disabled="item.disabled"
          @select="emit('select', item.id)"
        >
          {{ item.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenu>
</template>
