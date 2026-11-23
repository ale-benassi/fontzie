import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, nextTick, type EffectScope } from "vue";
import { defaultSettings } from "../../core/schema";
import { useAppearance } from "../../composables/useAppearance";
const storage = vi.hoisted(() => ({
  readSettings: vi.fn(),
  patchSettings: vi.fn(),
}));
vi.mock("../../storage/config", () => storage);
let scope: EffectScope;
let media: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
let element: { dataset: Record<string, string>; style: Record<string, string> };
beforeEach(() => {
  scope = effectScope();
  storage.readSettings.mockResolvedValue({
    ...defaultSettings(),
    theme: "dark",
  });
  storage.patchSettings.mockReset().mockImplementation(async (patch) => {
    storage.readSettings.mockResolvedValue({ ...defaultSettings(), ...patch });
  });
  vi.stubGlobal("chrome", {
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  });
  media = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  element = { dataset: {}, style: {} };
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal("document", { documentElement: element });
});
afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
});
it("restores appearance, follows System changes, and preserves an explicit theme", async () => {
  const app = scope.run(useAppearance)!;
  expect(element.dataset.theme).toBe("light");
  await app.initialize();
  expect(element.dataset.theme).toBe("dark");
  await app.changeSettings({ theme: "system" });
  await nextTick();
  expect(element.dataset.theme).toBe("light");
  media.matches = true;
  media.addEventListener.mock.calls[0]![1]();
  expect(element.style.colorScheme).toBe("dark");
  await app.changeSettings({ theme: "light" });
  await nextTick();
  media.addEventListener.mock.calls[0]![1]();
  expect(element.dataset.theme).toBe("light");
  expect(storage.patchSettings).toHaveBeenLastCalledWith(
    expect.objectContaining({ theme: "light" }),
  );
});
it("removes the operating-system listener when the editor scope closes", () => {
  scope.run(useAppearance);
  const listener = media.addEventListener.mock.calls[0]![1];
  scope.stop();
  expect(media.removeEventListener).toHaveBeenCalledWith("change", listener);
});
it("synchronizes settings written by another editor and removes its storage listener", async () => {
  const app = scope.run(useAppearance)!;
  const listener = vi.mocked(chrome.storage.onChanged.addListener).mock
    .calls[0]![0];
  listener(
    {
      settings: {
        newValue: {
          ...defaultSettings(),
          theme: "dark",
          favorites: ["google:inter"],
        },
      },
    },
    "local",
  );
  await nextTick();
  expect(app.settings.value.favorites).toEqual(["google:inter"]);
  expect(element.dataset.theme).toBe("dark");
  scope.stop();
  expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(
    listener,
  );
});
it("uses the external appearance in Incognito even when the panel reports dark", async () => {
  const port = {
    onMessage: {
      addListener: vi.fn<(listener: (dark: boolean) => void) => void>(),
    },
    onDisconnect: { addListener: vi.fn() },
    disconnect: vi.fn(),
  };
  Object.assign(chrome, {
    windows: { getCurrent: vi.fn().mockResolvedValue({ incognito: true }) },
    runtime: {
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
      getContexts: vi.fn().mockResolvedValue([]),
      connect: () => port,
    },
    offscreen: {
      Reason: { MATCH_MEDIA: "MATCH_MEDIA" },
      createDocument: vi.fn().mockResolvedValue(undefined),
    },
  });
  vi.stubGlobal("navigator", {
    locks: { request: (_name: string, run: () => Promise<void>) => run() },
  });
  media.matches = true;
  storage.readSettings.mockResolvedValue(defaultSettings());
  const app = scope.run(useAppearance)!;
  await app.initialize();
  await vi.waitFor(() =>
    expect(port.onMessage.addListener).toHaveBeenCalledOnce(),
  );
  const update = port.onMessage.addListener.mock.calls[0]![0];
  update(false);
  expect(element.dataset.theme).toBe("light");
  update(true);
  expect(element.dataset.theme).toBe("dark");
  await app.changeSettings({ theme: "dark" });
  update(false);
  expect(element.dataset.theme).toBe("dark");
  scope.stop();
  expect(port.disconnect).toHaveBeenCalledOnce();
});
