<script setup lang="ts">
import ActionMenu from "@/components/ActionMenu.vue";
import ConfirmAction from "@/components/ConfirmAction.vue";
import PresetPicker from "@/components/PresetPicker.vue";
import NotificationToast from "@/components/NotificationToast.vue";
import InlineAlert from "@/components/InlineAlert.vue";
import Disclosure from "@/components/Disclosure.vue";
import FloatingBar from "@/components/FloatingBar.vue";
import EditorControls from "@/components/EditorControls.vue";
import { Card, CardHeader, CardStack } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { useCatalog } from "../../composables/useCatalog";
import { useRetainedFonts } from "../../composables/useRetainedFonts";
import BrandLogo from "../../components/BrandLogo.vue";
import { useFontzie } from "../../composables/useFontzie";
import { ruleTargets, targetQuery } from "../../core/targets";
import { useTargetHighlight } from "../../composables/useTargetHighlight";
import { findFont } from "../../providers/catalog";
import { type Config, type Rule, type Settings } from "../../core/schema";
import { useCustomFonts } from "../../composables/useCustomFonts";
import { useLocalFonts } from "../../composables/useLocalFonts";
import { useBackup } from "../../composables/useBackup";
import { useDataReset } from "../../composables/useDataReset";
import { useOriginalComparison } from "../../composables/useOriginalComparison";
import Icon from "../../components/Icon.vue";
import FontBrowser from "../../components/FontBrowser.vue";
import TypographyEditor from "../../components/TypographyEditor.vue";
import FontSample from "../../components/FontSample.vue";
import RuleList from "../../components/RuleList.vue";
import EditingBar from "../../components/EditingBar.vue";
import SelectorInput from "../../components/SelectorInput.vue";
import CustomFonts from "../../components/CustomFonts.vue";
import { useTypographyExport } from "../../composables/useTypographyExport";
import { usePresets } from "../../composables/usePresets";
import { useEditorPosition } from "../../composables/useEditorPosition";
import { openDetails } from "../../core/disclosure";
import { errorMessage } from "../../core/errors";
const ExportDialog = defineAsyncComponent(
  () => import("../../components/ExportDialog.vue"),
);
const PresetSaveDialog = defineAsyncComponent(
  () => import("../../components/PresetSaveDialog.vue"),
);
const SettingsDialog = defineAsyncComponent(
  () => import("../../components/SettingsDialog.vue"),
);
const app = useFontzie();
const { fonts: catalogFonts } = useCatalog();
useRetainedFonts(() =>
  app.config.value.rules
    .filter((rule) => rule.enabled || rule.id === app.selectedId.value)
    .flatMap((rule) => (rule.font ? [rule.font.id] : [])),
);
const {
  isFloating,
  floatingMinimized,
  floatingOpening,
  editorAction,
  minimizeFloating,
} = useEditorPosition(app);
const { customFaces, custom, reloadCustom } = useCustomFonts(app);
const { local, localState, localError, browseLocal, initializeLocal } =
  useLocalFonts(app);
const presetManager = usePresets(app);
const {
  presets,
  selectedPreset,
  presetModified,
  savingPreset,
  applyingPreset,
  presetUndoConfig,
  showPresetSave,
  showPresetRename,
  saveCurrentPreset,
  loadPreset,
  deletingPreset,
  presetError,
} = presetManager;
const presetSaveTrigger = ref<{ $el: HTMLButtonElement }>();
function returnToPresetSave() {
  void nextTick(() =>
    presetSaveTrigger.value?.$el.focus({ preventScroll: true }),
  );
}

const {
  targets,
  editorGeneration,
  appendSelectors,
  getTargetElement,
  removeExactTarget,
  config,
  settings,
  tabId,
  url,
  frameId,
  selection,
  selector,
  matchCount,
  scopeSelector,
  selectedRuleIds,
  selectedRules,
  setSelectedRules,
  editSelectedTypography,
  targetingBusy,
  selectorCommitting,
  createRule,
  rule,
  selectedId,
  connected,
  connectionIssue,
  siteOrigin,
  allowingSite,
  allSitesAllowed,
  changingAllSites,
  allSitesError,
  picking,
  busy,
  error,
  restorationNotice,
  dismissRestorationNotice,
  status,
  canUndo,
  canRedo,
  changeSettings,
  retry,
  allowSite,
  allowAllSites,
  commit,
  commitSelector,
  togglePick,
  setProperties,
  chooseFont,
  editRule,
  reorderRule,
  deleteRules,
  undo,
  redo,
  resetPage,
  resetSite,
  report,
  clearTarget,
} = app;
const { highlightTarget, clearHighlight } = useTargetHighlight(
  tabId,
  connected,
  picking,
);
const exactTargets = computed(() =>
  targets.value.filter((target) => target.kind === "exact"),
);
const appliedSelectors = computed(() =>
  targets.value
    .filter((target) => target.kind === "selector")
    .map((target) => target.selector),
);
const editingDisabled = computed(() => busy.value || picking.value);
const selectingRules = ref(false);
async function switchEditingRule(id: string) {
  if (!connected.value || editingDisabled.value) return;
  const ownsPage = app.captureOwner();
  const viewport =
    document.querySelector<HTMLElement>(".floating-editor main") ??
    document.scrollingElement;
  const scrollTop = viewport?.scrollTop;
  selectingRules.value = false;
  setSelectedRules([]);
  await editRule(id, "select");
  await nextTick();
  if (
    ownsPage() &&
    selectedId.value === id &&
    viewport &&
    scrollTop !== undefined
  )
    viewport.scrollTop = scrollTop;
}
const typographyAvailable = computed(() =>
  selectingRules.value ? selectedRules.value.length > 0 : !!scopeSelector.value,
);
const needsTarget = computed(() => connected.value && !scopeSelector.value);
const hasTypography = computed(() =>
  config.value.rules.some((rule) => Object.keys(rule.properties).length > 0),
);
const hasActiveTypography = computed(() =>
  config.value.rules.some(
    (rule) =>
      rule.enabled && rule.selector && Object.keys(rule.properties).length > 0,
  ),
);
const firstTarget = computed(
  () => config.value.rules.length === 1 && !hasTypography.value,
);
function highlightSelector(value?: string) {
  const exact = exactTargets.value.find(
    (target) => targetQuery(target) === value,
  );
  highlightTarget(
    value ? [exact ?? { kind: "selector", selector: value }] : undefined,
    rule.value?.frameId ?? frameId.value,
  );
}
function highlightRule(value?: Rule) {
  highlightTarget(value ? ruleTargets(value) : undefined, value?.frameId);
}
watch([selectedId, frameId, selector], clearHighlight);
async function startBlankRule() {
  await createRule();
  await openDetails("targets", "#selector");
}
const targetPresets = [
  {
    label: "Headings",
    selector: "h1, h2, h3, h4, h5, h6",
    hint: "All headings (h1–h6)",
  },
  { label: "Paragraphs", selector: "p", hint: "All paragraphs (p)" },
  { label: "Links", selector: "a", hint: "All links (a)" },
];
const { downloadJSON, importJSON } = useBackup(app, presetManager);
const { dataRevision, clearData } = useDataReset(app, () => {
  customFaces.value = [];
  presets.value = [];
});
const { beforeActive, beforeBusy, requestBefore } = useOriginalComparison(app);
const notice = ref("");
const settingsOpen = ref(false);
const settingsNotice = ref("");
let settingsTrigger: HTMLElement | undefined;
async function openSettings(trigger: HTMLElement) {
  const ownsPage = app.captureOwner();
  if (picking.value) {
    await togglePick();
    if (!ownsPage()) return;
  }
  settingsTrigger = trigger;
  settingsNotice.value = "";
  settingsOpen.value = true;
}
function returnToSettings() {
  if (!confirmKind.value) settingsTrigger?.focus({ preventScroll: true });
}
function manageSiteAccess() {
  void chrome.tabs
    .create({ url: `chrome://extensions/?id=${chrome.runtime.id}` })
    .catch(report);
}
const noticeSequence = ref(0);
watch(connected, (ready) => {
  if (!ready) notice.value = "";
});
const presetUndoAvailable = computed(
  () =>
    notice.value === "Preset applied" &&
    presetUndoConfig.value === config.value &&
    canUndo.value &&
    !editingDisabled.value,
);
const ruleDeletionConfig = ref<Config>();
const ruleDeletionNotice = ref("");
const ruleDeletionUndoAvailable = computed(
  () =>
    !!ruleDeletionNotice.value &&
    notice.value === ruleDeletionNotice.value &&
    ruleDeletionConfig.value === config.value &&
    canUndo.value &&
    !editingDisabled.value,
);
async function deleteSelectedRules(ids: string[]) {
  const ownsPage = app.captureOwner();
  const count = config.value.rules.filter((item) =>
    ids.includes(item.id),
  ).length;
  if (!(await deleteRules(ids)) || !ownsPage()) return;
  ruleDeletionConfig.value = config.value;
  ruleDeletionNotice.value = `${count} ${count === 1 ? "rule" : "rules"} deleted.`;
  status.value = ruleDeletionNotice.value;
}
watch(status, (message) => {
  if (!message) return;
  const firstRuleCreated =
    message.startsWith("Rule created.") && firstTarget.value;
  if (message.startsWith("Rule created.") && !firstRuleCreated) {
    // Reveal the new rule without interrupting ongoing keyboard target entry.
    void nextTick(() => {
      const trigger = document.querySelector<HTMLButtonElement>(
        '#rules-heading [data-slot="collapsible-trigger"]',
      );
      if (trigger?.getAttribute("aria-expanded") === "false") trigger.click();
    });
  }
  // Consume each event so repeated saves can announce the same message again.
  status.value = "";
  // Continuous typography edits already provide immediate visual feedback.
  if (firstRuleCreated || message === "Applied to the website.") return;
  if (settingsOpen.value) settingsNotice.value = message;
  notice.value = message;
  noticeSequence.value++;
});
async function undoNotifiedAction() {
  const deletedRules = ruleDeletionUndoAvailable.value;
  if (!presetUndoAvailable.value && !deletedRules) return;
  const ownsPage = app.captureOwner();
  if (!(await undo()) || !ownsPage()) return;
  status.value = deletedRules ? "Rules restored." : "Preset undone.";
  await nextTick();
  if (!ownsPage()) return;
  if (deletedRules) {
    const row = Array.from(
      document.querySelectorAll<HTMLElement>(".rule-row"),
    ).find((item) => item.dataset.ruleId === selectedId.value);
    const target =
      row?.querySelector<HTMLButtonElement>(".rule-select") ??
      document.getElementById("rules-actions-button");
    target?.focus();
  } else
    document
      .querySelector<HTMLButtonElement>('[aria-label="Presets"]')
      ?.focus();
}
const confirmKind = ref<"site" | "data">();
const confirmError = ref("");
const siteClearOrigin = ref<string>();
const confirming = ref(false);
const confirmTitle = computed(() =>
  confirmKind.value === "site"
    ? "Clear site edits?"
    : "Clear all Fontzie data?",
);
const siteHost = computed(() =>
  siteClearOrigin.value ? new URL(siteClearOrigin.value).host : "this site",
);
function openClearConfirmation(kind: "site" | "data") {
  siteClearOrigin.value = kind === "site" ? siteOrigin.value : undefined;
  confirmError.value = "";
  confirmKind.value = kind;
}
async function confirmReset() {
  if (!confirmKind.value || confirming.value) return;
  confirming.value = true;
  confirmError.value = "";
  try {
    if (confirmKind.value === "site") {
      await resetSite(siteClearOrigin.value);
      status.value = "Site edits cleared.";
    } else await clearData();
    confirmKind.value = undefined;
  } catch (e) {
    confirmError.value = errorMessage(e);
  } finally {
    confirming.value = false;
  }
}
const preview = ref(config.value.preview);
const themeSaving = ref(false);
const themeNames = { light: "Light", dark: "Dark", system: "System" } as const;
const themeIcons = { light: "sun", dark: "moon", system: "monitor" } as const;
const nextTheme = computed(
  () =>
    (({ light: "dark", dark: "system", system: "light" }) as const)[
      settings.value.theme
    ],
);
const themeAction = computed(
  () =>
    `Theme: ${themeNames[settings.value.theme]}. Switch to ${themeNames[nextTheme.value]}.`,
);
async function saveTheme(theme: Settings["theme"]) {
  themeSaving.value = true;
  try {
    await changeSettings({ theme });
  } catch (error) {
    report(error);
  } finally {
    themeSaving.value = false;
  }
}
async function cycleTheme() {
  await saveTheme(nextTheme.value);
}
watch(
  () => config.value.preview,
  (value) => {
    preview.value = value;
  },
);
async function setPreview(value: boolean) {
  preview.value = value;
  await commit({ ...config.value, preview: value });
  preview.value = config.value.preview;
}
const exportOpen = ref(false);
const dialogLoaded = ref({ settings: false, export: false, preset: false });
watch(
  [
    settingsOpen,
    exportOpen,
    presetManager.presetSaveOpen,
    presetManager.pendingPreset,
    presetManager.deletingPreset,
  ],
  ([settings, exporting, saving, pending, deleting]) => {
    if (settings) dialogLoaded.value.settings = true;
    if (exporting) dialogLoaded.value.export = true;
    if (saving || pending || deleting) dialogLoaded.value.preset = true;
  },
);
const exporter = useTypographyExport(
  app,
  customFaces,
  custom,
  local,
  exportOpen,
);
const additionalFonts = computed(() => [...custom.value, ...local.value]);
function fontForRule(rule: Rule) {
  void catalogFonts.value;
  return rule.font ? findFont(rule.font.id, additionalFonts.value) : undefined;
}
const bulkFonts = computed(() => selectedRules.value.map(fontForRule));
const bulkFamily = computed(() => {
  const [first, ...rest] = selectedRules.value;
  if (!first) return;
  const familyKey = (rule: Rule) =>
    rule.font?.id ?? rule.properties["font-family"];
  return {
    mixed: rest.some((rule) => familyKey(rule) !== familyKey(first)),
    first,
  };
});
const selectedFont = computed(() => {
  if (!selectingRules.value) return rule.value && fontForRule(rule.value);
  const family = bulkFamily.value;
  return family && !family.mixed ? fontForRule(family.first) : undefined;
});
const browserSelected = computed(() =>
  selectingRules.value ? selectedFont.value?.id : rule.value?.font?.id,
);
const browserFamilyStatus = computed(() => {
  const family = bulkFamily.value;
  if (!family || !selectingRules.value) return;
  if (family.mixed) return "Mixed";
  return (
    family.first.font?.family ??
    family.first.properties["font-family"] ??
    "Original"
  );
});
async function favorite(id: string) {
  try {
    await app.updateSettings({ type: "settings.favorite", id });
  } catch (error) {
    report(error);
  }
}
const keys = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  if (settingsOpen.value || target.closest('[role="dialog"]')) return;
  const editing =
    ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) ||
    target.isContentEditable;
  if (picking.value) {
    if (e.key === "Escape") {
      e.preventDefault();
      void togglePick();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "z") e.preventDefault();
    return;
  }
  if (e.key === "/" && !editing && typographyAvailable.value) {
    e.preventDefault();
    void openDetails("font-browser", "#font-search");
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !editing) {
    e.preventDefault();
    void (e.shiftKey ? redo() : undo());
  }
};
onMounted(() => {
  void initializeLocal().catch(report);
  document.addEventListener("keydown", keys);
});
onUnmounted(() => {
  document.removeEventListener("keydown", keys);
});
</script>
<template>
  <Dialog v-model:open="exportOpen">
    <FloatingBar
      v-if="isFloating"
      :minimized="floatingMinimized"
      @minimize="minimizeFloating"
      @dock="editorAction('dock')"
      @close="editorAction('close')"
    >
      <template #controls>
        <EditorControls
          floating
          :theme-action="themeAction"
          :theme-icon="themeIcons[settings.theme]"
          :theme-saving="themeSaving"
          :preview="preview"
          :disabled="!connected || editingDisabled"
          :settings-open="settingsOpen"
          @settings="openSettings"
          @cycle-theme="cycleTheme"
          @update:preview="setPreview"
        />
      </template>
    </FloatingBar>
    <div
      v-show="!floatingMinimized"
      class="panel"
      :class="{ 'panel--disconnected': !connected }"
      :aria-busy="busy"
    >
      <div class="editor-top">
        <header v-if="!isFloating">
          <div class="brand-line">
            <BrandLogo v-if="!isFloating" />
            <div class="header-actions">
              <Button
                size="icon"
                variant="ghost"
                v-if="!isFloating"
                class="icon-button"
                aria-label="Float editor over webpage"
                title="Float editor over webpage"
                :disabled="!connected || (busy && !picking) || floatingOpening"
                :aria-busy="floatingOpening"
                @click="editorAction('float')"
                ><Icon name="float"
              /></Button>
              <EditorControls
                :theme-action="themeAction"
                :theme-icon="themeIcons[settings.theme]"
                :theme-saving="themeSaving"
                :preview="preview"
                :disabled="!connected || editingDisabled"
                :settings-open="settingsOpen"
                @settings="openSettings"
                @cycle-theme="cycleTheme"
                @update:preview="setPreview"
              />
            </div>
          </div>
        </header>
        <EditingBar
          :rules="config.rules"
          :selected="selectedId"
          :selecting="selectingRules"
          :selected-ids="selectedRuleIds"
          :connected="connected"
          :disabled="!connected || editingDisabled"
          :context-key="`${tabId}:${url}:${connected}`"
          @select="switchEditingRule"
        />
      </div>
      <CardStack :ready="connected">
        <InlineAlert
          v-if="error"
          :message="error"
          :dismissible="connectionIssue !== 'failed'"
          @dismiss="error = ''"
        >
          <Button
            v-if="connectionIssue === 'failed' && !busy"
            size="xs"
            @click="retry"
          >
            Retry
          </Button>
        </InlineAlert>
        <InlineAlert
          :message="restorationNotice"
          class="session-notice"
          dismissible
          @dismiss="dismissRestorationNotice"
        />
        <Card
          v-if="
            !connected &&
            connectionIssue !== 'failed' &&
            (busy || connectionIssue)
          "
          class="connection"
          aria-labelledby="connection-heading"
        >
          <CardHeader>
            <h2 id="connection-heading">Connect a website</h2>
          </CardHeader>
          <p class="connection-guidance" role="status">
            <template v-if="busy">Connecting…</template>
            <template v-else-if="connectionIssue === 'unsupported-page'">
              Open a website, then click the
              <strong>Fontzie toolbar icon</strong>.
            </template>
            <template v-else>
              Click the <strong>Fontzie toolbar icon</strong> to allow temporary
              access to this tab.
            </template>
          </p>
        </Card>
        <RuleList
          v-model:selecting="selectingRules"
          :selected-ids="selectedRuleIds"
          @update:selected-ids="setSelectedRules"
          :rules="config.rules"
          :selected="selectedId"
          :disabled="!connected || editingDisabled"
          :open-on-activate="firstTarget ? true : undefined"
          :blocked="picking"
          :context-key="`${tabId}:${url}:${connected}`"
          :error="error"
          @action="editRule"
          @delete="deleteSelectedRules"
          @reorder="reorderRule"
          @create="startBlankRule"
          @highlight="highlightRule"
        />
        <Card
          v-if="!selectingRules"
          aria-labelledby="target-heading"
          :class="{ 'targets-empty': needsTarget }"
        >
          <Disclosure
            id="targets"
            persist-key="targets"
            heading="h2"
            heading-id="target-heading"
            default-open
            show-actions-when-closed
            :heading-disabled="!connected || picking"
          >
            <template #title>Targets</template>
            <template #actions="{ expanded }">
              <Button
                v-if="!needsTarget || !expanded"
                size="xs"
                :variant="picking ? 'secondary' : 'outline'"
                :disabled="!connected || (busy && !picking)"
                :aria-pressed="picking"
                @click="togglePick"
              >
                <Icon name="pick" />{{
                  picking ? "Cancel picking" : "Pick element"
                }}
              </Button>
            </template>
            <div id="target-options" class="target-details">
              <template v-if="needsTarget">
                <p class="target-first-step">
                  Choose an element on the page to try different typography.
                </p>
                <Button
                  :variant="picking ? 'secondary' : 'default'"
                  class="target-pick"
                  :disabled="!connected || (busy && !picking)"
                  :aria-pressed="picking"
                  @click="togglePick"
                >
                  <Icon name="pick" />{{
                    picking ? "Cancel picking" : "Pick element"
                  }}
                </Button>
                <Label class="target-alternative subtle" for="selector">
                  Or enter a CSS selector
                </Label>
              </template>
              <p
                v-else-if="scopeSelector"
                class="subtle target-summary"
                aria-live="polite"
              >
                {{
                  matchCount === undefined
                    ? "Checking selected elements…"
                    : `${matchCount} ${matchCount === 1 ? "element" : "elements"} selected.`
                }}
              </p>
              <div
                class="target-composer picking-controls"
                :data-blocked="picking || undefined"
                :inert="picking"
              >
                <div class="selector-box">
                  <SelectorInput
                    v-model="selector"
                    :exact-targets="exactTargets"
                    :applied-selectors="appliedSelectors"
                    :get-target-element="getTargetElement"
                    :placeholder="
                      needsTarget ? 'e.g. h1, .page-title' : undefined
                    "
                    @add-selector="appendSelectors"
                    @remove-exact="removeExactTarget"
                    :disabled="
                      !connected || picking || (busy && !selectorCommitting)
                    "
                    @clear="clearTarget"
                    @highlight="highlightSelector"
                    @commit="commitSelector"
                    @remove="commitSelector"
                  />
                </div>
                <div
                  class="targeting-shortcuts"
                  role="group"
                  aria-label="CSS selector shortcuts"
                >
                  <span class="targeting-shortcuts-label" aria-hidden="true"
                    >Add:</span
                  >
                  <Button
                    v-for="preset in targetPresets"
                    :key="preset.label"
                    variant="ghost"
                    size="xs"
                    :disabled="!connected || editingDisabled"
                    :title="`Add ${preset.hint.toLowerCase()}`"
                    @click="appendSelectors(preset.selector)"
                    >{{ preset.label }}</Button
                  >
                  <Button
                    variant="ghost"
                    size="xs"
                    :disabled="!connected || editingDisabled"
                    title="Add every element on this page"
                    @click="appendSelectors('body, body *')"
                    >Whole page</Button
                  >
                </div>
              </div>
            </div>
          </Disclosure>
        </Card>
        <FontBrowser
          :inactive="!typographyAvailable"
          :blocked="picking"
          :settings="settings"
          :custom="custom"
          :local="local"
          :local-state="localState"
          :local-error="localError"
          :selected="browserSelected"
          :family-status="browserFamilyStatus"
          :disabled="!connected || editingDisabled || !typographyAvailable"
          @choose="chooseFont"
          @favorite="favorite"
          @local="browseLocal"
        >
          <template #custom="{ uploaded, family, back }">
            <CustomFonts
              :key="dataRevision"
              :refresh="reloadCustom"
              :empty="!custom.length"
              :family="family"
              @back="back"
              :disabled="!connected || editingDisabled || !typographyAvailable"
              @uploaded="uploaded"
              @error="report"
            />
          </template>
        </FontBrowser>
        <TypographyEditor
          :inactive="!typographyAvailable"
          :blocked="picking"
          :open-on-activate="firstTarget ? false : undefined"
          :generation="editorGeneration"
          :rule="rule"
          :font="selectedFont"
          :selection="selection"
          :bulk-rules="selectingRules ? selectedRules : undefined"
          :bulk-fonts="selectingRules ? bulkFonts : undefined"
          :disabled="
            !connected ||
            editingDisabled ||
            targetingBusy ||
            !typographyAvailable
          "
          @change="(patch) => setProperties(patch)"
          @bulk-change="(change) => editSelectedTypography(change, fontForRule)"
        >
          <template #sample>
            <FontSample
              :rule="rule"
              :selection="selection"
              :font="selectedFont"
            />
          </template>
        </TypographyEditor>
      </CardStack>
      <footer class="editor-footer">
        <div class="footer-actions">
          <div class="footer-presets">
            <PresetPicker
              :names="presets.map((p) => p.name)"
              :selected="selectedPreset"
              :modified="presetModified"
              :disabled="
                !connected || editingDisabled || savingPreset || applyingPreset
              "
              :can-save="hasTypography"
              @apply="loadPreset"
              @create="showPresetSave"
              @rename="showPresetRename"
              @delete="
                presetError = '';
                deletingPreset = $event;
              "
            />
            <Button
              size="icon-lg"
              variant="ghost"
              ref="presetSaveTrigger"
              class="icon-button"
              aria-label="Save preset"
              :title="
                selectedPreset
                  ? `Update ${selectedPreset}`
                  : 'Save current rules as a preset'
              "
              :disabled="
                !connected ||
                editingDisabled ||
                savingPreset ||
                applyingPreset ||
                !hasTypography
              "
              @click="saveCurrentPreset"
              ><Icon name="save"
            /></Button>
          </div>
        </div>
        <div class="footer-tools">
          <div class="footer-history">
            <Button
              size="icon-xs"
              variant="ghost"
              class="icon-button"
              :disabled="!canUndo || editingDisabled"
              aria-label="Undo"
              title="Undo (⌘/Ctrl Z)"
              @click="undo"
            >
              <Icon name="undo" /></Button
            ><Button
              size="icon-xs"
              variant="ghost"
              class="icon-button"
              :disabled="!canRedo || editingDisabled"
              aria-label="Redo"
              @click="redo"
            >
              <Icon name="redo"
            /></Button>
            <Button
              size="icon-xs"
              variant="ghost"
              class="icon-button"
              :disabled="
                !connected ||
                editingDisabled ||
                beforeBusy ||
                !preview ||
                !hasActiveTypography
              "
              :aria-label="beforeActive ? 'Back to edited' : 'Show original'"
              :aria-pressed="beforeActive"
              :title="
                !preview
                  ? 'Turn Preview on to compare with the original page'
                  : beforeActive
                    ? 'Back to edited'
                    : 'Show original'
              "
              @click="requestBefore(!beforeActive)"
            >
              <Icon name="before-after" />
            </Button>
          </div>
          <ActionMenu
            label="Clear edits"
            :disabled="!connected || editingDisabled"
            :items="[
              {
                id: 'page',
                label: 'Clear page edits',
                danger: true,
                disabled: !config.rules.length,
              },
              { id: 'site', label: 'Clear site edits…', danger: true },
            ]"
            @select="
              $event === 'page' ? resetPage() : openClearConfirmation('site')
            "
          />
          <DialogTrigger as-child
            ><Button
              :variant="hasActiveTypography ? 'default' : 'ghost'"
              class="export-button"
              title="Export current typography edits"
              :disabled="!connected || editingDisabled || !hasActiveTypography"
            >
              <Icon name="export" />Export
            </Button></DialogTrigger
          >
        </div>
        <NotificationToast
          :message="notice"
          :sequence="noticeSequence"
          :undo-available="presetUndoAvailable || ruleDeletionUndoAvailable"
          :undo-label="
            ruleDeletionUndoAvailable
              ? 'Undo rule deletion'
              : 'Undo the applied preset'
          "
          @undo="undoNotifiedAction"
        />
      </footer>
      <ExportDialog v-if="dialogLoaded.export" :exporter="exporter" />
    </div>
  </Dialog>
  <SettingsDialog
    v-if="dialogLoaded.settings"
    v-model:open="settingsOpen"
    :settings="settings"
    :busy="busy || allowingSite"
    :theme-saving="themeSaving"
    :connected="connected"
    :site-origin="siteOrigin"
    :all-sites-allowed="allSitesAllowed"
    :changing-all-sites="changingAllSites"
    :all-sites-error="allSitesError"
    :error="error"
    :message="settingsNotice"
    :return-focus="returnToSettings"
    @theme="saveTheme"
    @allow-site="allowSite"
    @allow-all-sites="allowAllSites"
    @manage-site-access="manageSiteAccess"
    @export="downloadJSON"
    @import="importJSON"
    @clear="openClearConfirmation('data')"
  />
  <PresetSaveDialog
    v-if="dialogLoaded.preset"
    :presets="presetManager"
    :busy="busy"
    :error="error"
    :return-focus="returnToPresetSave"
  />
  <!-- Keep the confirmation portal above dialogs loaded after startup. -->
  <ConfirmAction
    v-if="confirmKind"
    :open="!!confirmKind"
    :title="confirmTitle"
    :action="
      confirmKind === 'site' ? 'Clear site edits' : 'Clear all Fontzie data'
    "
    :busy="confirming"
    @update:open="!$event && (confirmKind = undefined)"
    @confirm="confirmReset"
  >
    <template #description>
      <template v-if="confirmKind === 'site'">
        Clear saved edits for every page on <strong>{{ siteHost }}</strong
        >.
      </template>
      <template v-else>
        Delete saved edits for all websites, plus presets, settings and uploaded
        font files from this device.
      </template>
      <strong class="mt-1 block text-foreground">This can’t be undone.</strong>
    </template>
    <Button :disabled="confirming" @click="downloadJSON">
      <Icon name="download" />{{
        connected ? "Export current rules & presets" : "Export presets"
      }}
    </Button>
    <p class="subtle">
      <template v-if="connected">
        Other pages’ edits and uploaded font files are excluded.
      </template>
      <template v-else>Uploaded font files are excluded.</template>
    </p>
    <InlineAlert :message="confirmError" />
  </ConfirmAction>
</template>
