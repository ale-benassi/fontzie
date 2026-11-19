<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { X } from "@lucide/vue";
import { Button } from "../button";
import { CardHeader } from "../card";
import { reactiveOmit } from "@vueuse/core";
import { cn } from "cn";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  useForwardPropsEmits,
} from "reka-ui";
import DialogOverlay from "./DialogOverlay.vue";
import DialogTitle from "./DialogTitle.vue";

defineOptions({ inheritAttrs: false });
const props = defineProps<
  DialogContentProps & {
    class?: HTMLAttributes["class"];
    title: string;
    closeLabel?: string;
    closeDisabled?: boolean;
  }
>();
const emits = defineEmits<DialogContentEmits>();
const delegatedProps = reactiveOmit(
  props,
  "class",
  "title",
  "closeLabel",
  "closeDisabled",
);
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent
      data-slot="dialog-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="cn('ui-dialog', props.class)"
    >
      <CardHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogClose data-slot="dialog-close" as-child>
          <Button
            variant="ghost"
            size="icon"
            :aria-label="closeLabel ?? `Close ${title}`"
            :title="closeLabel ?? `Close ${title}`"
            :disabled="closeDisabled"
          >
            <X :stroke-width="1.6" />
          </Button>
        </DialogClose>
      </CardHeader>
      <div class="ui-dialog-body"><slot /></div>
      <div v-if="$slots.footer" class="ui-dialog-footer">
        <slot name="footer" />
      </div>
    </DialogContent>
  </DialogPortal>
</template>
