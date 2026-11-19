<script setup lang="ts">
import type { FontFamily, Inspection, Rule } from "../core/schema";
import { fontSampleText } from "../core/font-sample";
import { useFontSample } from "../composables/useFontSample";
const props = defineProps<{
  rule?: Rule;
  selection?: Inspection;
  font?: FontFamily;
}>();
const { style, loading, failed } = useFontSample(props);
</script>
<template>
  <div class="specimen">
    <div
      class="specimen-viewport"
      tabindex="0"
      role="region"
      aria-label="Font sample"
      :aria-busy="loading"
    >
      <p :style="style">{{ fontSampleText }}</p>
    </div>
    <p v-if="failed" class="subtle" role="status">
      Couldn’t load the sample font. Try another family.
    </p>
    <span v-else-if="loading" class="subtle" role="status">Loading font…</span>
    <span
      v-else-if="
        !selection?.typographyContext &&
        rule?.properties['font-size']?.endsWith('em')
      "
      class="subtle"
    >
      Relative sizes use a 16px base when page context is unavailable.
    </span>
  </div>
</template>
