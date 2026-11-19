<script setup lang="ts">
import { computed } from "vue";
import type { Rule } from "../core/schema";
import { ruleTargets } from "../core/targets";
import Icon from "./Icon.vue";

const props = defineProps<{ rule: Rule }>();
const targets = computed(() => ruleTargets(props.rule));
const placeholder = computed(() =>
  props.rule.font || Object.keys(props.rule.properties).length
    ? "No targets"
    : "Blank rule",
);
</script>

<template>
  <span v-if="targets.length" class="rule-selector-tags">
    <code
      v-for="(target, index) in targets"
      :key="index"
      class="selector-tag rule-selector-tag mono"
    >
      <Icon v-if="target.kind === 'exact'" name="pick" />
      <span class="rule-selector-text">{{ target.selector }}</span>
    </code>
  </span>
  <span v-else class="rule-placeholder">{{ placeholder }}</span>
</template>
