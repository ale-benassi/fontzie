<script setup lang="ts">
import { ref } from "vue";
import { Button } from "./ui/button";
import { NativeSelect } from "./ui/native-select";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription } from "./ui/dialog";
import ActionMenu from "./ActionMenu.vue";
import Disclosure from "./Disclosure.vue";
import Icon from "./Icon.vue";
import InlineAlert from "./InlineAlert.vue";
import type { BackupImportScope } from "../core/backup";
import type { Settings } from "../core/schema";
const props = defineProps<{
  open: boolean;
  settings: Settings;
  busy: boolean;
  themeSaving: boolean;
  connected: boolean;
  siteOrigin?: string;
  allSitesAllowed?: boolean;
  changingAllSites: boolean;
  allSitesError: string;
  error: string;
  message: string;
  returnFocus: () => void;
}>();
const emit = defineEmits<{
  "update:open": [open: boolean];
  theme: [value: Settings["theme"]];
  allowSite: [];
  allowAllSites: [];
  manageSiteAccess: [];
  export: [];
  import: [file: File, scope: BackupImportScope];
  clear: [];
}>();
const jsonInput = ref<InstanceType<typeof Input>>();
const version = chrome.runtime.getManifest().version;
let importScope: BackupImportScope = "backup";
function openImport(scope: BackupImportScope) {
  importScope = scope;
  jsonInput.value?.click();
}
function chooseImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) emit("import", file, importScope);
}
function returnToSettings(event: Event) {
  event.preventDefault();
  props.returnFocus();
}
</script>
<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      id="settings"
      title="Settings"
      @close-auto-focus="returnToSettings"
    >
      <DialogDescription class="sr-only">
        Appearance, website access, backup, local data and about Fontzie.
      </DialogDescription>
      <section class="form-section" aria-labelledby="settings-appearance">
        <h3 id="settings-appearance">Appearance</h3>
        <div class="control-row">
          <Label for="settings-theme">Theme</Label
          ><NativeSelect
            id="settings-theme"
            aria-label="Theme"
            :value="settings.theme"
            :disabled="themeSaving"
            @change="
              emit(
                'theme',
                ($event.target as HTMLSelectElement).value as Settings['theme'],
              )
            "
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </NativeSelect>
        </div>
      </section>
      <section class="form-section" aria-labelledby="settings-access">
        <h3 id="settings-access">Website access</h3>
        <p id="settings-all-sites-description" class="subtle">
          <template v-if="allSitesAllowed">
            Fontzie connects automatically on supported websites.
          </template>
          <template v-else>
            Allow Fontzie to read and change pages on all websites so it can
            connect and restore saved edits automatically.
          </template>
        </p>
        <div class="action-row">
          <Button
            :disabled="
              !allSitesAllowed &&
              (allSitesAllowed === undefined || changingAllSites || busy)
            "
            :aria-busy="changingAllSites"
            aria-describedby="settings-all-sites-description"
            @click="
              allSitesAllowed ? emit('manageSiteAccess') : emit('allowAllSites')
            "
          >
            {{
              allSitesAllowed
                ? "Manage site access in Chrome"
                : "Connect automatically on all websites"
            }}
          </Button>
        </div>
        <InlineAlert :message="allSitesError" />
        <template v-if="!allSitesAllowed && siteOrigin">
          <p id="settings-site-origin" class="action-row">
            <Icon name="globe" />{{ siteOrigin }}
          </p>
          <p class="subtle">
            Restore saved edits automatically when you return to this site.
          </p>
          <div class="action-row">
            <Button :disabled="busy" @click="emit('allowSite')">
              <Icon name="shield-check" />Always allow this site
            </Button>
          </div>
        </template>
        <p v-else-if="!allSitesAllowed" class="subtle">
          Connect a website to manage access for that site.
        </p>
      </section>
      <div class="form-section">
        <Disclosure id="backup-data" class="settings-backup">
          <template #title>Backup &amp; data</template>
          <div class="grid gap-2">
            <p id="settings-export-description" class="subtle">
              <template v-if="connected">
                A backup includes this page’s rules and your presets.
              </template>
              Presets are shared across websites. Uploaded font files are
              excluded.
            </p>
            <div class="grid gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <Button
                  aria-describedby="settings-export-description"
                  @click="emit('export')"
                >
                  <Icon name="download" />{{
                    connected ? "Export backup" : "Export presets"
                  }}
                </Button>
                <ActionMenu
                  v-if="connected"
                  label="Import backup"
                  :disabled="busy"
                  :items="[
                    { id: 'presets', label: 'Import presets only' },
                    {
                      id: 'backup',
                      label: 'Replace page edits and import presets',
                      danger: true,
                    },
                  ]"
                  @select="
                    openImport($event === 'presets' ? 'presets' : 'backup')
                  "
                />
                <Button
                  v-else
                  :disabled="busy"
                  aria-describedby="settings-import-description"
                  @click="openImport('presets')"
                >
                  <Icon name="upload" />Import presets
                </Button>
                <Input
                  ref="jsonInput"
                  class="sr-only"
                  type="file"
                  accept=".json,application/json"
                  aria-label="Import configuration"
                  :disabled="busy"
                  @change="chooseImport"
                />
              </div>
              <p id="settings-import-description" class="subtle">
                Import replaces presets with matching names.
              </p>
            </div>
          </div>
          <div class="settings-clear-data action-row">
            <Button
              variant="destructive-outline"
              :disabled="busy"
              @click="emit('clear')"
              >Clear all Fontzie data</Button
            >
          </div>
        </Disclosure>
      </div>
      <section class="form-section" aria-labelledby="settings-about">
        <h3 id="settings-about">About</h3>
        <p class="subtle">Fontzie · {{ version }}</p>
        <p class="subtle settings-about-links">
          <a
            class="guidance-link settings-about-link"
            href="https://fontzie.app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="globe" />Website
          </a>
          <a
            class="guidance-link settings-about-link"
            href="https://github.com/ale-benassi/fontzie"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"
              />
            </svg>
            GitHub
          </a>
        </p>
        <p class="subtle settings-about-links">
          Made by
          <a
            class="guidance-link settings-about-link"
            href="https://alebenassi.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="settings-author-logo" aria-hidden="true"></span>
            Alessandro Benassi
          </a>
        </p>
      </section>
      <InlineAlert v-if="error" :message="error" />
      <p v-else-if="message" class="subtle" role="status">{{ message }}</p>
    </DialogContent>
  </Dialog>
</template>
