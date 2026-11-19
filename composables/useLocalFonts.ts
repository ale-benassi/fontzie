import { onScopeDispose, ref } from "vue";
import type { FontFamily } from "../core/schema";
import type { Fontzie } from "./useFontzie";
import { errorMessage } from "../core/errors";
import {
  LOCAL_FONTS_KEY,
  localFamilies,
  localFontFacesSchema,
} from "../core/local-fonts";

export type LocalFontState =
  "idle" | "loading" | "permission" | "ready" | "empty" | "error";
export function useLocalFonts(
  app: Pick<Fontzie, "error" | "status" | "report">,
  options: { setup?: boolean } = {},
) {
  const local = ref<FontFamily[]>([]);
  const localState = ref<LocalFontState>("idle");
  const localError = ref("");
  let generation = 0;
  let setupTab: number | undefined;
  let permissionStatus: PermissionStatus | undefined;
  let disposed = false;

  function applyFaces(value: unknown) {
    local.value = localFamilies(value);
    localState.value = local.value.length ? "ready" : "empty";
    localError.value = "";
  }
  function permissionChanged() {
    if (permissionStatus?.state === "granted") return;
    // An active request checks the resulting permission before accepting data.
    if (localState.value === "loading") return;
    generation++;
    local.value = [];
    localState.value = "idle";
    void chrome.storage.session.remove(LOCAL_FONTS_KEY).catch(app.report);
  }
  async function getPermission() {
    const permission = await navigator.permissions.query({
      name: "local-fonts" as PermissionName,
    });
    if (disposed) return permission;
    permissionStatus?.removeEventListener("change", permissionChanged);
    permissionStatus = permission;
    permission.addEventListener("change", permissionChanged);
    return permission;
  }
  async function initializeLocal() {
    const current = generation;
    if (!("queryLocalFonts" in window)) return;
    const permission = await getPermission();
    if (permission.state !== "granted") return;
    const saved = await chrome.storage.session.get(LOCAL_FONTS_KEY);
    if (
      current === generation &&
      permission.state === "granted" &&
      saved[LOCAL_FONTS_KEY] !== undefined
    )
      applyFaces(saved[LOCAL_FONTS_KEY]);
  }
  const changed = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "session" || !changes[LOCAL_FONTS_KEY]) return;
    generation++;
    if (changes[LOCAL_FONTS_KEY].newValue === undefined) {
      local.value = [];
      localState.value = "idle";
      return;
    }
    void initializeLocal().catch(app.report);
  };
  chrome.storage.onChanged.addListener(changed);
  onScopeDispose(() => {
    disposed = true;
    generation++;
    chrome.storage.onChanged.removeListener(changed);
    permissionStatus?.removeEventListener("change", permissionChanged);
  });

  async function openSetup(current: number) {
    if (setupTab !== undefined) {
      try {
        await chrome.tabs.update(setupTab, { active: true });
        return;
      } catch {
        /* The previous setup tab may have been closed. */
      }
    }
    const [active] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (current !== generation) return;
    const url = new URL(chrome.runtime.getURL("sidepanel.html"));
    url.searchParams.set("local-fonts", "setup");
    if (active?.id !== undefined)
      url.searchParams.set("return-tab", String(active.id));
    const tab = await chrome.tabs.create({ url: url.href });
    setupTab = tab.id;
  }

  async function browseLocal() {
    if (localState.value === "loading") return;
    const current = ++generation;
    localState.value = "loading";
    localError.value = "";
    app.error.value = app.status.value = "";
    try {
      const query = (
        window as unknown as {
          queryLocalFonts?: () => Promise<
            Array<{ family: string; style: string }>
          >;
        }
      ).queryLocalFonts;
      if (!query)
        throw Error(
          "Chrome cannot read installed fonts here. You can add font files in Custom instead.",
        );
      const permission = await getPermission();
      if (current !== generation) return;
      if (permission.state === "denied")
        throw Error(
          "Font access is blocked. Allow local fonts in Chrome's site settings, or add font files in Custom.",
        );
      // Side panels cannot show Chrome's font permission prompt. A normal tab
      // requests it with its own button; the result is shared through Session.
      if (permission.state === "prompt" && !options.setup) {
        await openSetup(current);
        if (current === generation) localState.value = "permission";
        return;
      }
      const faces = localFontFacesSchema.parse(await query.call(window));
      if (current !== generation) return;
      const resultPermission = await getPermission();
      if (current !== generation) return;
      if (resultPermission.state !== "granted") {
        // Chrome resolves a dismissed/denied permission request with [].
        throw Error(
          "Font access wasn't allowed. Try again and choose Allow in Chrome's prompt.",
        );
      }
      applyFaces(faces);
      await chrome.storage.session.set({ [LOCAL_FONTS_KEY]: faces });
      if (local.value.length)
        app.status.value =
          "Found " +
          local.value.length +
          " installed " +
          (local.value.length === 1 ? "family." : "families.");
    } catch (error) {
      if (current !== generation) return;
      if (permissionStatus?.state !== "granted") local.value = [];
      localState.value = "error";
      localError.value = errorMessage(error);
      app.report(error);
    }
  }
  return { local, localState, localError, browseLocal, initializeLocal };
}
