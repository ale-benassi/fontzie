<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { Primitive, type PrimitiveProps } from "reka-ui";
import { cn } from "cn";
const props = withDefaults(
  defineProps<PrimitiveProps & { class?: HTMLAttributes["class"] }>(),
  { as: "section" },
);
</script>
<template>
  <Primitive
    data-slot="card"
    :as="as"
    :as-child="asChild"
    :class="cn('ui-card', props.class)"
  >
    <div class="ui-card-body"><slot /></div>
  </Primitive>
</template>
