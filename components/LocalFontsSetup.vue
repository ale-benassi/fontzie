<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import BrandLogo from "./BrandLogo.vue";
import Icon from "./Icon.vue";
import InlineAlert from "./InlineAlert.vue";
import { useAppearance } from "../composables/useAppearance";
import { useLocalFonts } from "../composables/useLocalFonts";
import { errorMessage } from "../core/errors";

const error = ref("");
const status = ref("");
const appearance = useAppearance();
const { local, localState, localError, browseLocal } = useLocalFonts(
  {
    error,
    status,
    report: (reason) => {
      error.value = errorMessage(reason);
    },
  },
  { setup: true },
);
const ready = computed(() => localState.value === "ready");
async function returnToWebsite() {
  const id = Number(new URLSearchParams(location.search).get("return-tab"));
  if (Number.isInteger(id) && id > 0) {
    try {
      await chrome.tabs.update(id, { active: true });
    } catch {
      /* The original website may have been closed. */
    }
  }
  window.close();
}
onMounted(() =>
  appearance.initialize().catch((reason) => {
    error.value = errorMessage(reason);
  }),
);
</script>
<template>
  <main class="local-fonts-setup">
    <BrandLogo />
    <Icon name="monitor" />
    <div aria-live="polite">
      <h1>{{ ready ? "Your fonts are ready" : "Use your installed fonts" }}</h1>
      <p v-if="ready" class="subtle">
        {{ local.length.toLocaleString() }} font families are now available in
        Fontzie’s Local tab.
      </p>
      <p v-else class="subtle">
        Allow Fontzie to read your installed fonts, then return to your website.
        Your font list stays on this device.
      </p>
      <p v-if="!localError && !error && localState === 'empty'" role="status">
        Chrome returned no installed fonts. You can add font files in the Custom
        tab instead.
      </p>
    </div>
    <InlineAlert :message="localError || error" />
    <Button v-if="ready" variant="default" @click="returnToWebsite"
      >Return to website</Button
    >
    <template v-else>
      <Button
        variant="default"
        :disabled="localState === 'loading'"
        @click="browseLocal"
        >{{
          localState === "loading" ? "Waiting for Chrome…" : "Allow font access"
        }}</Button
      >
      <Button variant="link" size="xs" @click="returnToWebsite">Cancel</Button>
    </template>
  </main>
</template>
