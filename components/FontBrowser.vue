<script setup lang="ts">
import Disclosure from "./Disclosure.vue";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { computed, ref, watch, nextTick, onUnmounted } from "vue";
import {
  useVirtualList,
  useMediaQuery,
  useScroll,
  useResizeObserver,
} from "@vueuse/core";
import SegmentedControl from "./SegmentedControl.vue";
import { useCatalog } from "../composables/useCatalog";
import { alias, closestWeight } from "../core/fonts";
import { loadFont } from "../providers/load";
import { useRetainedFonts } from "../composables/useRetainedFonts";
import { createConcurrencyLimit, forEachConcurrent } from "../core/concurrency";
import type { FontFamily, Settings } from "../core/schema";
import type { LocalFontState } from "../composables/useLocalFonts";
import Icon from "./Icon.vue";
import InlineAlert from "./InlineAlert.vue";
import FontProviderEmpty from "./FontProviderEmpty.vue";
const props = defineProps<{
  settings: Settings;
  custom: FontFamily[];
  local: FontFamily[];
  localState?: LocalFontState;
  localError?: string;
  selected?: string;
  familyStatus?: string;
  disabled?: boolean;
  inactive?: boolean;
  blocked?: boolean;
}>();
const emit = defineEmits<{
  choose: [font: FontFamily];
  favorite: [id: string];
  local: [];
}>();
const collection = ref("all");
const customFamily = ref("");
function manageCustom(family: string) {
  customFamily.value = family;
}
async function leaveCustomDetails() {
  const family = customFamily.value;
  customFamily.value = "";
  await nextTick();
  const buttons = list.value?.querySelectorAll<HTMLButtonElement>(
    "[data-manage-family]",
  );
  const trigger = Array.from(buttons ?? []).find(
    (button) => button.dataset.manageFamily === family,
  );
  (
    trigger ??
    document.getElementById("font-search") ??
    document.getElementById("custom-add")
  )?.focus();
}
const source = ref("all"),
  search = ref(""),
  category = ref("all"),
  variable = ref(false),
  pending = ref(new Set<string>()),
  failures = ref(new Set<string>()),
  rendered = ref(new Set<string>());
const recentOnly = computed({
  get: () => collection.value === "recent",
  set: (enabled: boolean) => {
    collection.value = enabled ? "recent" : "all";
  },
});
const emptyCustom = computed(
  () => source.value === "custom" && !props.custom.length,
);
const emptyLocal = computed(
  () => source.value === "local" && !props.local.length,
);
const emptyProvider = computed(() => emptyCustom.value || emptyLocal.value);
const localTitle = computed(() => {
  if (props.localState === "permission")
    return "Allow font access in the setup tab";
  if (props.localState === "loading") return "Loading installed fonts…";
  if (props.localState === "empty") return "No installed fonts returned";
  if (props.localState === "error") return "Couldn't load installed fonts";
  return "Fonts on this device";
});
const localDescription = computed(() => {
  if (props.localState === "permission")
    return "Choose Allow in Chrome’s font prompt, then return to your website.";
  if (props.localState === "loading")
    return "Waiting for Chrome to read your fonts.";
  if (props.localState === "empty")
    return "Chrome didn't return any fonts. Try again, or add font files in Custom.";
  return "Load your installed fonts to browse them here. Chrome may ask for permission.";
});
const noFavorites = computed(
  () => collection.value === "favorites" && !props.settings.favorites.length,
);
const providers = [
  { value: "all", label: "All" },
  { value: "google", label: "Google" },
  {
    value: "fontshare",
    label: "Fontshare",
    help: "Fontshare lets us list only its open-source fonts. Download other fonts from Fontshare and add them in Custom, or choose an installed font in Local.",
  },
  { value: "local", label: "Local" },
  { value: "custom", label: "Custom" },
];
const providerPanel = ref<HTMLElement>();
const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
let panelAnimation: Animation | undefined;
let panelGeneration = 0;
watch(source, async (next, previous) => {
  customFamily.value = "";
  if (next === "custom") clearFilters();
  const current = ++panelGeneration;
  const panel = providerPanel.value;
  panelAnimation?.cancel();
  if (!panel || reducedMotion.value) return;
  await nextTick();
  if (current !== panelGeneration || reducedMotion.value) return;
  const direction =
    providers.findIndex((provider) => provider.value === next) >
    providers.findIndex((provider) => provider.value === previous)
      ? 1
      : -1;
  panelAnimation = panel.animate(
    [
      { transform: `translateX(${direction * 48}px)`, opacity: 0.45 },
      { transform: "translateX(0)", opacity: 1 },
    ],
    { duration: 280, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
});
watch(reducedMotion, (reduced) => {
  if (reduced) panelAnimation?.cancel();
});
onUnmounted(() => {
  panelGeneration++;
  generation++;
  panelAnimation?.cancel();
});
const {
  fonts: catalog,
  loading: catalogLoading,
  error: catalogError,
  reload: reloadCatalog,
} = useCatalog();
const preferred = [
  "google:inter",
  "google:manrope",
  "google:fraunces",
  "system:sans",
];
const all = computed(() =>
  [...catalog.value, ...props.custom, ...props.local].sort((a, b) => {
    const ai = preferred.indexOf(a.id),
      bi = preferred.indexOf(b.id);
    return (
      (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) ||
      a.family.localeCompare(b.family)
    );
  }),
);
const query = computed(() => search.value.toLowerCase());
const favorites = computed(() => new Set(props.settings.favorites));
const recents = computed(
  () => new Map(props.settings.recents.map((id, index) => [id, index])),
);
const filtered = computed(() => {
  const result = all.value.filter(
    (f) =>
      (source.value === "all" || f.provider === source.value) &&
      (collection.value === "all" ||
        (collection.value === "favorites"
          ? favorites.value.has(f.id)
          : recents.value.has(f.id))) &&
      f.family.toLowerCase().includes(query.value) &&
      (source.value === "local" ||
        ((source.value === "custom" ||
          category.value === "all" ||
          f.category === category.value) &&
          (!variable.value || f.axes.length))),
  );
  return collection.value === "recent"
    ? result.sort(
        (a, b) =>
          (recents.value.get(a.id) ?? 0) - (recents.value.get(b.id) ?? 0),
      )
    : result;
});
const noMatches = computed(
  () =>
    !filtered.value.length &&
    !emptyProvider.value &&
    !noFavorites.value &&
    (source.value === "local" ||
      source.value === "custom" ||
      (!catalogLoading.value && !catalogError.value)),
);
const offerOwnFonts = computed(
  () =>
    (source.value === "all" || source.value === "fontshare") &&
    collection.value === "all" &&
    search.value.trim() !== "",
);
async function useOwnFont(provider: "custom" | "local") {
  source.value = provider;
  await nextTick();
  if (provider === "local" && props.local.length) {
    document.getElementById("font-search")?.focus();
    return;
  }
  const action = document.getElementById(
    provider === "custom" ? "custom-add" : "load-local-fonts",
  );
  action?.focus();
  action?.click();
}
// Keep one continuous scrollbar while rendering and loading previews only nearby.
const fontRowHeight = 64;
const listHeight = computed(() =>
  Math.min(filtered.value.length * fontRowHeight, 240),
);
const {
  list: visibleRows,
  containerProps,
  wrapperProps,
  scrollTo,
} = useVirtualList(filtered, {
  itemHeight: fontRowHeight,
  overscan: 4,
});
const list = containerProps.ref;
const { arrivedState, measure: measureScroll } = useScroll(list);
useResizeObserver(list, measureScroll);
watch(filtered, async () => {
  await nextTick();
  measureScroll();
});
watch([source, search, category, variable, collection], () => scrollTo(0));
async function revealFont(index: number) {
  await nextTick();
  const row = list.value?.querySelector<HTMLElement>(
    `[data-font-index="${index}"]`,
  );
  if (row && list.value) {
    const r = row.getBoundingClientRect(),
      l = list.value.getBoundingClientRect();
    const top = l.top + (list.value.scrollTop > 1 ? 20 : 0);
    const bottom = l.bottom - (!arrivedState.bottom ? 20 : 0);
    if (r.top >= top && r.bottom <= bottom) return;
  }
  scrollTo(index);
  // Keep the chosen font clear of the top fade after virtual-list scrolling.
  if (list.value)
    list.value.scrollTop = Math.max(0, index * fontRowHeight - 20);
  await nextTick();
  measureScroll();
}
watch(
  () => props.selected,
  async (id) => {
    const index = filtered.value.findIndex((f) => f.id === id);
    if (index >= 0) await revealFont(index);
  },
);
const hasFilters = computed(
  () =>
    !!search.value ||
    !["all", "custom", "local"].includes(source.value) ||
    collection.value !== "all" ||
    category.value !== "all" ||
    variable.value,
);
function clearFilters() {
  if (source.value !== "custom" && source.value !== "local")
    source.value = "all";
  collection.value = category.value = "all";
  search.value = "";
  variable.value = false;
}

watch(
  () => props.custom,
  () => {
    for (const id of rendered.value)
      if (id.startsWith("custom:")) rendered.value.delete(id);
  },
);
const limitPreview = createConcurrencyLimit();
async function previewFont(f: FontFamily, current: () => boolean = () => true) {
  await limitPreview(() => loadPreview(f), current);
}
async function loadPreview(f: FontFamily) {
  if (["system", "local"].includes(f.provider) || pending.value.has(f.id))
    return;
  pending.value.add(f.id);
  try {
    const style = f.styles.includes("normal")
      ? "normal"
      : (f.styles[0] ?? "normal");
    await loadFont({
      id: f.id,
      weight: closestWeight(f, 400, style),
      style,
    });
    if (visibleRows.value.some(({ data }) => data.id === f.id))
      rendered.value.add(f.id);
    failures.value.delete(f.id);
  } catch {
    failures.value.add(f.id);
  } finally {
    pending.value.delete(f.id);
  }
}
useRetainedFonts(() => visibleRows.value.map(({ data }) => data.id));
let generation = 0;
watch(
  visibleRows,
  async (rows) => {
    const current = ++generation;
    const visible = new Set(rows.map(({ data }) => data.id));
    for (const id of rendered.value)
      if (!visible.has(id)) rendered.value.delete(id);
    await forEachConcurrent(
      rows,
      ({ data }) => previewFont(data, () => current === generation),
      3,
      () => current === generation,
    );
  },
  { immediate: true },
);
function cycle(offset: number) {
  const index = filtered.value.findIndex((f) => f.id === props.selected);
  const target =
    filtered.value[
      ((index < 0 ? (offset > 0 ? -1 : 0) : index) +
        offset +
        filtered.value.length) %
        filtered.value.length
    ];
  if (target) emit("choose", target);
}
function weightSummary(font: FontFamily) {
  if (font.axes.length) return "Variable";
  const count = font.weights.length;
  return `${count} ${count === 1 ? "weight" : "weights"}`;
}
async function keys(e: KeyboardEvent) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const target = e.target as HTMLElement;
  if (target !== list.value && !target.closest(".font-choice")) return;
  if (!filtered.value.length) return;
  e.preventDefault();
  const row = target.closest<HTMLElement>("[data-font-index]");
  const current = row ? Number(row.dataset.fontIndex) : -1;
  const index =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? filtered.value.length - 1
        : Math.max(
            0,
            Math.min(
              filtered.value.length - 1,
              current + (e.key === "ArrowDown" ? 1 : -1),
            ),
          );
  await revealFont(index);
  list.value
    ?.querySelector<HTMLButtonElement>(
      `[data-font-index="${index}"] .font-choice`,
    )
    ?.focus();
}
</script>
<template>
  <Card aria-labelledby="font-heading">
    <Disclosure
      id="font-browser"
      persist-key="font-browser"
      heading="h2"
      heading-id="font-heading"
      :inactive="inactive"
      :blocked="blocked"
      open-on-activate
      default-open
    >
      <template #title>
        Font family
        <span v-if="familyStatus" class="subtle">{{ familyStatus }}</span>
      </template>
      <template #preview>
        <span v-for="provider in providers" :key="provider.value">
          {{ provider.label }}
        </span>
      </template>
      <template #actions>
        <div class="font-cycle">
          <Button
            size="icon"
            variant="ghost"
            class="icon-button"
            aria-label="Previous font"
            :disabled="disabled || !filtered.length"
            @click="cycle(-1)"
          >
            <Icon name="left" /></Button
          ><Button
            size="icon"
            variant="ghost"
            class="icon-button"
            aria-label="Next font"
            :disabled="disabled || !filtered.length"
            @click="cycle(1)"
          >
            <Icon name="right" />
          </Button>
        </div>
      </template>
      <SegmentedControl
        v-model="source"
        class="mb-[10px]"
        :options="providers"
        label="Font provider"
      />
      <p v-if="catalogLoading" class="subtle" role="status">
        Loading font catalog…
      </p>
      <InlineAlert :message="catalogError" />
      <Button v-if="catalogError" size="xs" @click="reloadCatalog"
        >Retry font catalog</Button
      >
      <div
        v-show="!emptyProvider || source === 'custom'"
        :class="{ 'search-tools': !emptyCustom }"
      >
        <div v-if="!emptyProvider" class="search-box">
          <Icon name="search" /><Input
            id="font-search"
            v-model="search"
            type="search"
            aria-label="Search fonts"
            placeholder="Search fonts…"
          /><span class="subtle">/</span>
        </div>
        <Button
          v-if="!emptyProvider && source !== 'custom'"
          size="xs"
          :aria-pressed="recentOnly"
          @click="recentOnly = !recentOnly"
          >Recent</Button
        >
        <div v-show="source === 'custom'" class="custom-font-manager">
          <slot
            name="custom"
            :uploaded="clearFilters"
            :family="customFamily"
            :back="leaveCustomDetails"
          />
        </div>
        <Button
          v-if="!emptyProvider"
          size="icon"
          class="icon-button favorites-shortcut"
          aria-label="Show favorites"
          :title="
            collection === 'favorites' ? 'Show all fonts' : 'Show favorites'
          "
          :aria-pressed="collection === 'favorites'"
          @click="collection = collection === 'favorites' ? 'all' : 'favorites'"
          ><Icon
            name="heart"
            :class="{ 'is-favorite': collection === 'favorites' }"
        /></Button>
      </div>
      <div
        v-if="
          !emptyProvider &&
          (!['local', 'custom'].includes(source) || hasFilters)
        "
        id="font-filters"
        class="browser-filters"
        :class="{
          'browser-filters--private': ['custom', 'local'].includes(source),
        }"
      >
        <NativeSelect
          v-if="!['custom', 'local'].includes(source)"
          v-model="category"
          aria-label="Font category"
        >
          <option value="all">Category</option>
          <option
            v-for="c in [
              'sans-serif',
              'serif',
              'monospace',
              'display',
              'handwriting',
            ]"
            :key="c"
            :value="c"
          >
            {{ c }}
          </option></NativeSelect
        >
        <div class="font-filter-options">
          <Button
            v-if="!['local', 'custom'].includes(source)"
            size="xs"
            :aria-pressed="variable"
            @click="variable = !variable"
            >Variable</Button
          >
          <Button
            v-if="hasFilters"
            class="clear-font-filters"
            variant="link"
            size="xs"
            aria-label="Clear filters"
            @click="clearFilters"
            >Clear</Button
          >
        </div>
      </div>
      <div class="font-results-viewport">
        <div ref="providerPanel" class="font-results">
          <FontProviderEmpty
            v-if="emptyLocal"
            icon="monitor"
            :title="localTitle"
            :description="localState === 'error' ? undefined : localDescription"
            :aria-busy="localState === 'loading'"
          >
            <InlineAlert v-if="localState === 'error'" :message="localError" />
            <Button
              id="load-local-fonts"
              :disabled="disabled || localState === 'loading'"
              @click="emit('local')"
            >
              {{
                localState === "loading"
                  ? "Loading…"
                  : localState === "permission"
                    ? "Open setup tab"
                    : localState === "empty" || localState === "error"
                      ? "Try again"
                      : "Load installed fonts"
              }}
            </Button>
            <Button
              v-if="localState === 'empty' || localState === 'error'"
              variant="link"
              size="xs"
              @click="source = 'custom'"
              >Add font files</Button
            >
          </FontProviderEmpty>
          <div v-else-if="source === 'local'" class="local-font-tools">
            <Button
              size="xs"
              :disabled="disabled || localState === 'loading'"
              @click="emit('local')"
              >{{
                localState === "loading"
                  ? "Loading…"
                  : "Refresh installed fonts"
              }}</Button
            >
            <InlineAlert v-if="localState === 'error'" :message="localError" />
          </div>
          <div
            v-show="!emptyProvider && (filtered.length > 0 || noFavorites)"
            v-bind="containerProps"
            class="font-list"
            :class="{ 'font-list--empty': noFavorites }"
            :data-more-above="
              !noFavorites && !arrivedState.top ? true : undefined
            "
            :data-more-below="
              !noFavorites && !arrivedState.bottom ? true : undefined
            "
            :style="{
              height: `${noFavorites ? 240 : listHeight}px`,
            }"
            role="region"
            tabindex="0"
            aria-label="Font families"
            @keydown="keys"
          >
            <div v-if="noFavorites" class="favorites-empty">
              <Icon name="heart-broken" />
              <strong>No favorites yet</strong>
              <p class="subtle">Use the heart beside a font to save it here.</p>
              <Button size="xs" @click="clearFilters">Browse all fonts</Button>
            </div>
            <div v-show="!noFavorites" v-bind="wrapperProps">
              <div
                v-for="{ data: f, index } in visibleRows"
                :key="f.id"
                class="font-row"
                :data-font-index="index"
                :style="{ height: `${fontRowHeight}px` }"
                :class="{ selected: selected === f.id }"
              >
                <Button
                  variant="ghost"
                  class="font-choice"
                  :aria-label="
                    source === 'custom'
                      ? `${f.family} ${selected === f.id ? 'Selected' : 'Apply font'} · ${weightSummary(f)}`
                      : undefined
                  "
                  :aria-pressed="selected === f.id"
                  :disabled="disabled"
                  @click="emit('choose', f)"
                >
                  <span
                    class="font-name"
                    :style="{
                      fontFamily: rendered.has(f.id)
                        ? `'${alias(f.id)}'`
                        : f.provider === 'system' || f.provider === 'local'
                          ? f.family
                          : undefined,
                    }"
                    >{{ f.family }}</span
                  ><span class="font-meta"
                    >{{
                      source === "custom"
                        ? selected === f.id
                          ? "Selected"
                          : "Apply font"
                        : f.provider
                    }}
                    ·
                    {{ weightSummary(f)
                    }}{{
                      pending.has(f.id)
                        ? " · loading"
                        : failures.has(f.id)
                          ? " · preview unavailable"
                          : ""
                    }}</span
                  ></Button
                >
                <Button
                  v-if="failures.has(f.id)"
                  class="retry-font"
                  variant="link"
                  size="xs"
                  :disabled="pending.has(f.id)"
                  :aria-label="`Retry ${f.family} preview`"
                  @click="previewFont(f)"
                  >Retry</Button
                ><Button
                  size="icon"
                  variant="ghost"
                  class="icon-button font-favorite"
                  :aria-label="`Favorite ${f.family}`"
                  :aria-pressed="settings.favorites.includes(f.id)"
                  @click="emit('favorite', f.id)"
                >
                  <Icon
                    name="heart"
                    :class="{
                      'is-favorite': settings.favorites.includes(f.id),
                    }"
                  />
                </Button>
                <Button
                  v-if="f.provider === 'custom'"
                  variant="ghost"
                  size="icon"
                  :aria-label="`Edit ${f.family} font files`"
                  class="font-manage"
                  title="Edit font files"
                  :data-manage-family="f.family"
                  :disabled="disabled"
                  @click="manageCustom(f.family)"
                  ><Icon name="settings"
                /></Button>
              </div>
            </div>
          </div>
          <div v-if="noMatches" class="grid gap-2">
            <p class="subtle" role="status">
              <template v-if="offerOwnFonts"
                >No fonts match your search.</template
              >
              <template v-else-if="collection === 'recent'">
                No fonts match. Fonts you apply appear here.
              </template>
              <template v-else>
                No fonts match. Try another search or clear your filters.
              </template>
            </p>
            <div v-if="offerOwnFonts" class="flex flex-wrap gap-2">
              <Button
                size="xs"
                :disabled="disabled"
                @click="useOwnFont('custom')"
              >
                Add a font file
              </Button>
              <Button
                size="xs"
                :disabled="disabled"
                @click="useOwnFont('local')"
              >
                Use installed fonts
              </Button>
            </div>
          </div>
          <p
            v-if="!noFavorites && !emptyProvider && filtered.length"
            class="browser-count subtle"
          >
            {{ filtered.length.toLocaleString() }}
            {{ filtered.length === 1 ? "family" : "families" }}
          </p>
        </div>
      </div>
    </Disclosure>
  </Card>
</template>
