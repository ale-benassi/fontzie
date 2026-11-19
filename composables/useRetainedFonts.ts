import { onScopeDispose, watch } from "vue";
import { retainFontFamilies, releaseFontFamilies } from "../providers/load";

export function useRetainedFonts(ids: () => string[]) {
  const owner = {};
  watch(ids, (next) => retainFontFamilies(owner, next), {
    immediate: true,
    deep: true,
  });
  onScopeDispose(() => releaseFontFamilies(owner));
}
