import { computed, onUnmounted, ref, shallowRef, watch, type Ref } from "vue";
import type { Fontzie } from "./useFontzie";
import type { FontFamily } from "../core/schema";
import { familyFaces, type CustomFontMetadata } from "../storage/fonts";
import { useCatalog } from "./useCatalog";
import { exportCSS, fontSetupCSS } from "../core/css";
import { exportPrompt, type PickLocations } from "../core/export-prompt";
import { ruleTargets } from "../core/targets";
import { assetName, customFaceCSS } from "../core/export-assets";
import { download } from "../core/download";
export function useTypographyExport(
  app: Fontzie,
  customFaces: Ref<CustomFontMetadata[]>,
  custom: Ref<FontFamily[]>,
  local: Ref<FontFamily[]>,
  exportOpen: Ref<boolean>,
) {
  const { config, selectedId, url, title, status } = app;
  const { fonts: catalog } = useCatalog();
  const format = ref<"css" | "tailwind" | "prompt">("css"),
    exportScope = ref("all");
  const exportRules = computed(() =>
    config.value.rules.filter(
      (r) =>
        r.enabled &&
        r.selector &&
        Object.keys(r.properties).length > 0 &&
        (exportScope.value !== "selected" || r.id === selectedId.value),
    ),
  );
  const exportFamilies = computed(() =>
    exportRules.value
      .filter((r) => r.font?.provider === "custom")
      .map((r) => r.font!.family),
  );
  const locations = shallowRef<PickLocations>(new Map());
  const locating = ref(false);
  watch(
    [exportOpen, format, exportRules, app.connected, app.tabId, url],
    async (_, __, onCleanup) => {
      let current = true;
      onCleanup(() => {
        current = false;
      });
      locations.value = new Map();
      locating.value = false;
      if (
        !exportOpen.value ||
        format.value !== "prompt" ||
        !app.connected.value
      )
        return;
      const handles = new Map<number, Set<string>>();
      for (const rule of exportRules.value) {
        for (const target of ruleTargets(rule)) {
          if (target.kind !== "exact" || !target.handle) continue;
          const frame = handles.get(rule.frameId) ?? new Set<string>();
          frame.add(target.handle);
          handles.set(rule.frameId, frame);
        }
      }
      if (!handles.size) return;
      const ownsPage = app.captureOwner();
      locating.value = true;
      const frames = await Promise.all(
        Array.from(handles, async ([frame, picks]) => {
          // A closed or inaccessible frame leaves only its own picks unresolved.
          const found = await app
            .locatePicks(frame, [...picks])
            .catch(() => ({}));
          return [frame, found] as const;
        }),
      );
      if (!current) return;
      if (ownsPage()) locations.value = new Map(frames);
      locating.value = false;
    },
  );
  const canExport = computed(
    () => exportOpen.value && exportRules.value.length > 0 && !locating.value,
  );
  const exportCode = computed(() => {
    if (!canExport.value) return "";
    const families = [...catalog.value, ...custom.value, ...local.value];
    const faces = customFaceCSS(customFaces.value, exportFamilies.value);
    if (format.value === "prompt")
      return exportPrompt(
        exportRules.value,
        fontSetupCSS(exportRules.value, families, faces),
        { url: url.value, title: title.value },
        locations.value,
      );
    return exportCSS(
      { ...config.value, rules: exportRules.value },
      format.value,
      undefined,
      families,
      faces,
    );
  });
  async function downloadFontAssets() {
    try {
      for (const family of new Set(exportFamilies.value))
        for (const face of await familyFaces(family))
          download(
            assetName(face),
            new Blob([face.bytes], { type: face.mime }),
          );
      status.value =
        "Place the downloaded font files in ./fonts/ beside the CSS.";
    } catch (error) {
      app.report(error);
    }
  }
  const copied = ref(false);
  const copyError = ref("");
  let copyGeneration = 0;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  onUnmounted(() => {
    copyGeneration++;
    clearTimeout(copyTimer);
  });
  watch([exportCode, exportOpen], () => {
    copyGeneration++;
    copied.value = false;
    copyError.value = "";
    clearTimeout(copyTimer);
  });
  async function copyCode() {
    if (!canExport.value) return;
    const generation = ++copyGeneration;
    copyError.value = "";
    try {
      await navigator.clipboard.writeText(exportCode.value);
      if (generation !== copyGeneration) return;
      status.value =
        format.value === "prompt" ? "Prompt copied." : "Code copied.";
      copied.value = true;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copied.value = false;
      }, 3000);
    } catch {
      if (generation !== copyGeneration) return;
      copyError.value = "Use your copy shortcut to copy the selected export.";
    }
  }
  function downloadCSS() {
    if (!canExport.value) return;
    download(
      format.value === "prompt"
        ? "fontzie-prompt.txt"
        : format.value === "css"
          ? "fontzie.css"
          : "fontzie-tailwind.css",
      new Blob([exportCode.value], {
        type: format.value === "prompt" ? "text/plain" : "text/css",
      }),
    );
  }
  return {
    exportOpen,
    format,
    exportScope,
    selectedId,
    exportRules,
    exportFamilies,
    exportCode,
    canExport,
    locating,
    downloadFontAssets,
    copied,
    copyError,
    copyCode,
    downloadCSS,
  };
}
export type TypographyExport = ReturnType<typeof useTypographyExport>;
