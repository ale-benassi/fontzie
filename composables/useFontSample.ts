import { computed, ref, watch } from "vue";
import type { FontFamily, Inspection, Rule } from "../core/schema";
import { fontRequest, fontVariantPatch } from "../core/fonts";
import { propertiesSchema } from "../core/schema";
import { fontSampleStyle } from "../core/font-sample";
import { loadFont } from "../providers/load";
import { useRetainedFonts } from "./useRetainedFonts";

export function useFontSample(props: {
  rule?: Rule;
  selection?: Inspection;
  font?: FontFamily;
}) {
  const style = computed(() => fontSampleStyle(props.rule, props.selection));
  const request = computed(() => {
    if (!props.rule?.font) return;
    const properties = { ...props.rule.properties };
    // Reset controls inherit the inspected value. Load that face too, rather
    // than always fetching regular 400 when the override is absent.
    const weight = propertiesSchema.shape["font-weight"].safeParse(
      style.value["font-weight"],
    );
    const fontStyle = propertiesSchema.shape["font-style"].safeParse(
      style.value["font-style"],
    );
    if (weight.success) properties["font-weight"] = weight.data;
    if (fontStyle.success) properties["font-style"] = fontStyle.data;
    if (props.font)
      Object.assign(properties, fontVariantPatch(props.font, properties, {}));
    return fontRequest({ ...props.rule, properties });
  });
  const loading = ref(false);
  const failed = ref(false);
  useRetainedFonts(() => (props.rule?.font ? [props.rule.font.id] : []));
  watch(
    [
      () => JSON.stringify(request.value),
      // A custom library refresh may replace bytes without changing descriptors.
      () => props.font,
    ],
    async (_value, _old, cleanup) => {
      let current = true;
      cleanup(() => (current = false));
      failed.value = false;
      loading.value = false;
      if (!request.value) return;
      loading.value = true;
      try {
        await loadFont(request.value);
      } catch {
        if (current) failed.value = true;
      } finally {
        if (current) loading.value = false;
      }
    },
    { immediate: true },
  );
  return { style, loading, failed };
}
