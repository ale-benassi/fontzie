import { afterEach, expect, test, vi } from "vitest";
import { effectScope, ref, type EffectScope } from "vue";
import { LOCAL_FONTS_KEY } from "../../core/local-fonts";
import { useLocalFonts } from "../../composables/useLocalFonts";

const scopes: EffectScope[] = [];
afterEach(() => {
  for (const scope of scopes) scope.stop();
  scopes.length = 0;
  vi.unstubAllGlobals();
});

function setup(
  query = vi.fn().mockResolvedValue([]),
  permission = "granted",
  inSetup = false,
) {
  const app = { error: ref(""), status: ref(""), report: vi.fn() };
  const permissionStatus = Object.assign(new EventTarget(), {
    state: permission,
  });
  const saved: Record<string, unknown> = {};
  type Listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => void;
  const listeners = new Set<Listener>();
  const session = {
    get: vi.fn().mockImplementation(() => Promise.resolve({ ...saved })),
    set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
      Object.assign(saved, values);
      return Promise.resolve();
    }),
    remove: vi.fn().mockImplementation((key: string) => {
      delete saved[key];
      return Promise.resolve();
    }),
  };
  const tabs = {
    query: vi.fn().mockResolvedValue([{ id: 42 }]),
    create: vi.fn().mockResolvedValue({ id: 43 }),
    update: vi.fn().mockResolvedValue({ id: 43 }),
  };
  vi.stubGlobal("chrome", {
    storage: {
      session,
      onChanged: {
        addListener: (listener: Listener) => listeners.add(listener),
        removeListener: (listener: Listener) => listeners.delete(listener),
      },
    },
    runtime: { getURL: (path: string) => "chrome-extension://fontzie/" + path },
    tabs,
  });
  vi.stubGlobal("window", { queryLocalFonts: query });
  vi.stubGlobal("navigator", {
    permissions: { query: vi.fn().mockResolvedValue(permissionStatus) },
  });
  const scope = effectScope();
  scopes.push(scope);
  const fonts = scope.run(() => useLocalFonts(app, { setup: inSetup }));
  if (!fonts) throw Error("Missing scope.");
  return {
    app,
    query,
    permissionStatus,
    saved,
    session,
    tabs,
    listeners,
    scope,
    ...fonts,
  };
}

test("starts unloaded and treats an empty response as an empty state", async () => {
  const fonts = setup();
  expect(fonts.localState.value).toBe("idle");
  expect(fonts.query).not.toHaveBeenCalled();
  await fonts.browseLocal();
  expect(fonts.local.value).toEqual([]);
  expect(fonts.localState.value).toBe("empty");
  expect(fonts.app.status.value).toBe("");
});

test("an empty result can be retried and populated with installed families", async () => {
  const fonts = setup();
  await fonts.browseLocal();
  fonts.query.mockResolvedValue([
    { family: "Clash Display", style: "Regular" },
    { family: "Clash Display", style: "Bold Italic" },
  ]);
  await fonts.browseLocal();
  expect(fonts.localState.value).toBe("ready");
  expect(fonts.local.value).toMatchObject([
    {
      family: "Clash Display",
      provider: "local",
      weights: [400, 700],
      styles: ["normal", "italic"],
    },
  ]);
  expect(fonts.app.status.value).toBe("Found 1 installed family.");
});

test("denied access reports recovery guidance without querying fonts", async () => {
  const fonts = setup(undefined, "denied");
  await fonts.browseLocal();
  expect(fonts.localState.value).toBe("error");
  expect(fonts.localError.value).toContain("Font access is blocked");
  expect(fonts.query).not.toHaveBeenCalled();
  expect(fonts.app.report).toHaveBeenCalledOnce();
});

test("unavailable font access has an actionable error state", async () => {
  const fonts = setup();
  vi.stubGlobal("window", {});
  await fonts.browseLocal();
  expect(fonts.localState.value).toBe("error");
  expect(fonts.localError.value).toContain("add font files in Custom");
});

test("loading prevents duplicate requests and preserves fonts if refresh fails", async () => {
  const fonts = setup(
    vi.fn().mockResolvedValue([{ family: "SF Pro", style: "Regular" }]),
  );
  await fonts.browseLocal();
  let rejectQuery: (reason: Error) => void = () => {};
  fonts.query.mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectQuery = reject;
    }),
  );
  const loading = fonts.browseLocal();
  expect(fonts.localState.value).toBe("loading");
  await fonts.browseLocal();
  rejectQuery(new Error("Font reading failed. Try again."));
  await loading;
  expect(fonts.query).toHaveBeenCalledTimes(2);
  expect(fonts.localState.value).toBe("error");
  expect(fonts.local.value[0]?.family).toBe("SF Pro");
  expect(fonts.localError.value).toBe("Font reading failed. Try again.");
});

test("first access opens a setup tab without querying fonts in the side panel", async () => {
  const fonts = setup(undefined, "prompt");
  await fonts.browseLocal();
  expect(fonts.query).not.toHaveBeenCalled();
  expect(fonts.tabs.create).toHaveBeenCalledWith({
    url: "chrome-extension://fontzie/sidepanel.html?local-fonts=setup&return-tab=42",
  });
  expect(fonts.localState.value).toBe("permission");
  await fonts.browseLocal();
  expect(fonts.tabs.create).toHaveBeenCalledOnce();
  expect(fonts.tabs.update).toHaveBeenCalledWith(43, { active: true });
});

test("dismissing the setup permission is explained instead of treated as no fonts", async () => {
  const fonts = setup(undefined, "prompt", true);
  await fonts.browseLocal();
  expect(fonts.query).toHaveBeenCalledOnce();
  expect(fonts.localState.value).toBe("error");
  expect(fonts.localError.value).toContain("wasn't allowed");
  expect(fonts.session.set).not.toHaveBeenCalled();
});

test("setup accepts a grant and shares installed font metadata", async () => {
  const fonts = setup(undefined, "prompt", true);
  fonts.query.mockImplementation(() => {
    fonts.permissionStatus.state = "granted";
    fonts.permissionStatus.dispatchEvent(new Event("change"));
    return Promise.resolve([{ family: "SF Pro", style: "Regular" }]);
  });
  await fonts.browseLocal();
  expect(fonts.localState.value).toBe("ready");
  expect(fonts.session.set).toHaveBeenCalledWith({
    [LOCAL_FONTS_KEY]: [{ family: "SF Pro", style: "Regular" }],
  });
});

test("a reopened panel restores fonts only while access is granted", async () => {
  const fonts = setup();
  fonts.saved[LOCAL_FONTS_KEY] = [{ family: "SF Pro", style: "Regular" }];
  await fonts.initializeLocal();
  expect(fonts.local.value[0]?.family).toBe("SF Pro");
  fonts.permissionStatus.state = "denied";
  fonts.permissionStatus.dispatchEvent(new Event("change"));
  expect(fonts.local.value).toEqual([]);
  expect(fonts.session.remove).toHaveBeenCalledWith(LOCAL_FONTS_KEY);
  await fonts.initializeLocal();
  expect(fonts.local.value).toEqual([]);
});

test("storage updates reach the panel and listeners are removed on disposal", async () => {
  const fonts = setup();
  fonts.saved[LOCAL_FONTS_KEY] = [
    { family: "Clash Display", style: "Regular" },
  ];
  for (const listener of fonts.listeners)
    listener(
      {
        [LOCAL_FONTS_KEY]: { newValue: fonts.saved[LOCAL_FONTS_KEY] },
      },
      "session",
    );
  await vi.waitFor(() =>
    expect(fonts.local.value[0]?.family).toBe("Clash Display"),
  );
  fonts.scope.stop();
  expect(fonts.listeners.size).toBe(0);
});
