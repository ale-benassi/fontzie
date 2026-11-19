import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLoadedFonts,
  loadFont,
  loadPayload,
  pruneCustomFonts,
  retainFontFamilies,
  releaseFontFamilies,
  FONT_CACHE_FAMILIES,
  FONT_CACHE_BYTES,
  FONT_CACHE_REQUESTS,
} from "../../providers/load";
import { Engine } from "../../content/engine";
import { emptyConfig, newRule } from "../../core/schema";
vi.mock("../../content/inspector", () => ({
  roots: () => [],
  matches: () => [],
}));
vi.mock("../../content/roots", () => ({ watchRoots: () => () => {} }));
import { alias, CUSTOM_FONTS_REVISION_KEY } from "../../core/fonts";
import type { FacePayload } from "../../providers/delivery";

let faces: Set<FontFace>;
let revision: string;
let decodes: number;
const remote: FacePayload = {
  family: "Fontzie-google-inter",
  bytes: btoa("fixture"),
  weight: "100 900",
  style: "normal",
};
const sendMessage = vi.fn();
const request = { id: "google:inter", weight: 400, style: "normal" };
beforeEach(() => {
  revision = "original";
  decodes = 0;
  faces = new Set();
  sendMessage.mockReset().mockResolvedValue({ ok: true, data: [remote] });
  vi.stubGlobal("document", {
    fonts: faces,
    querySelectorAll: () => [],
    documentElement: {},
  });
  vi.stubGlobal("CSS", { supports: () => true });
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );

  vi.stubGlobal("chrome", {
    runtime: { sendMessage },
    storage: {
      local: {
        get: vi.fn(async () => ({ [CUSTOM_FONTS_REVISION_KEY]: revision })),
      },
    },
  });
  vi.stubGlobal(
    "FontFace",
    class {
      constructor(
        public family: string,
        _bytes: ArrayBuffer,
        options: FontFaceDescriptors,
      ) {
        Object.assign(this, options);
      }
      async load() {
        decodes++;
        return this;
      }
    },
  );
});
afterEach(() => {
  clearLoadedFonts();
  vi.unstubAllGlobals();
});

describe("font loading cache", () => {
  it("keeps distinct custom names loaded when their punctuation previously shared an alias", async () => {
    const ids = ["custom:Acme Sans", "custom:Acme-Sans"];
    await loadPayload(
      ids.map((id, index) => ({
        family: alias(id),
        bytes: btoa(`custom face ${index}`),
        weight: "400",
        style: "normal",
        revision: String(index),
      })),
    );
    expect([...faces].map((face) => face.family)).toEqual(ids.map(alias));
    expect(faces.size).toBe(2);
  });
  it("bounds idle families, preserves both consumers' fonts, and reloads evicted requests", async () => {
    sendMessage.mockImplementation(async (request) => ({
      ok: true,
      data: [{ ...remote, family: "Fontzie-" + request.id.replace(":", "-") }],
    }));
    const rules = {},
      specimens = {};
    retainFontFamilies(rules, ["google:applied"]);
    retainFontFamilies(specimens, ["google:visible"]);
    await loadFont({ ...request, id: "google:applied" });
    await loadFont({ ...request, id: "google:visible" });
    for (let index = 0; index < FONT_CACHE_FAMILIES + 8; index++)
      await loadFont({ ...request, id: "google:preview-" + index });
    expect(faces.size).toBe(FONT_CACHE_FAMILIES + 2);
    expect(
      [...faces].some((face) => face.family === "Fontzie-google-applied"),
    ).toBe(true);
    expect(
      [...faces].some((face) => face.family === "Fontzie-google-visible"),
    ).toBe(true);
    const calls = sendMessage.mock.calls.length;
    await loadFont({ ...request, id: "google:preview-0" });
    expect(sendMessage).toHaveBeenCalledTimes(calls + 1);
    releaseFontFamilies(rules);
    releaseFontFamilies(specimens);
    expect(faces.size).toBe(FONT_CACHE_FAMILIES);
  });
  it("evicts the least recently used idle family", async () => {
    sendMessage.mockImplementation(async (request) => ({
      ok: true,
      data: [{ ...remote, family: "Fontzie-" + request.id.replace(":", "-") }],
    }));
    for (let index = 0; index < FONT_CACHE_FAMILIES; index++)
      await loadFont({ ...request, id: "google:font-" + index });
    await loadFont({ ...request, id: "google:font-0" });
    await loadFont({ ...request, id: "google:overflow" });
    expect(
      [...faces].some((face) => face.family === "Fontzie-google-font-0"),
    ).toBe(true);
    expect(
      [...faces].some((face) => face.family === "Fontzie-google-font-1"),
    ).toBe(false);
  });
  it("bounds static variant request records while keeping retained decoded faces", async () => {
    sendMessage.mockImplementation(async (request) => ({
      ok: true,
      data: [{ ...remote, weight: String(request.weight) }],
    }));
    const owner = {};
    retainFontFamilies(owner, [request.id]);
    for (let index = 0; index <= FONT_CACHE_REQUESTS; index++)
      await loadFont({ ...request, weight: 100 + index });
    expect(faces.size).toBe(FONT_CACHE_REQUESTS + 1);
    const calls = sendMessage.mock.calls.length;
    await loadFont({ ...request, weight: 100 });
    expect(sendMessage).toHaveBeenCalledTimes(calls + 1);
    expect(faces.size).toBe(FONT_CACHE_REQUESTS + 1);
    releaseFontFamilies(owner);
  });
  it("enforces a byte budget for large idle font faces", async () => {
    const bytes = btoa("a".repeat(Math.floor(FONT_CACHE_BYTES / 2) + 1));
    await loadPayload([{ ...remote, family: "First", bytes }]);
    await loadPayload([{ ...remote, family: "Second", bytes }]);
    expect(faces.size).toBe(1);
    expect([...faces][0]!.family).toBe("Second");
  });
  it("shares requests across simultaneous previews and repeated page edits", async () => {
    await Promise.all([
      loadFont(request),
      loadFont(request),
      loadFont(request, "content"),
    ]);
    await loadFont(request);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(decodes).toBe(1);
    expect(faces.size).toBe(1);
  });
  it("transfers a shared font once across rules and subsequent size edits", async () => {
    const engine = new Engine();
    const rules = ["h1", "h2", "p"].map((selector) => ({
      ...newRule(selector),
      font: {
        id: "google:inter",
        family: "Inter",
        provider: "google" as const,
      },
      properties: { "font-family": "Inter", "font-size": "16px" },
    }));
    await engine.apply({ ...emptyConfig(), rules }, 0);
    for (const rule of rules) rule.properties["font-size"] = "18px";
    await engine.apply({ ...emptyConfig(), rules }, 0);
    expect(
      sendMessage.mock.calls.filter(([message]) => message.type === "font"),
    ).toHaveLength(1);
    expect(
      sendMessage.mock.calls.filter(([message]) => message.type === "css"),
    ).toHaveLength(2);
    engine.dispose();
  });
  it("preserves normal and italic descriptors when registering faces", async () => {
    await loadPayload([remote, { ...remote, style: "italic" }]);
    expect([...faces].map((face) => face.style)).toEqual(["normal", "italic"]);
    expect([...faces].map((face) => face.weight)).toEqual([
      "100 900",
      "100 900",
    ]);
  });
  it("starts independent rule fonts together and applies CSS only after all succeed", async () => {
    const finish = new Map<string, () => void>();
    sendMessage.mockImplementation((message) =>
      message.type === "css"
        ? Promise.resolve({ ok: true })
        : new Promise((resolve) =>
            finish.set(message.id, () =>
              resolve({
                ok: true,
                data: [{ ...remote, family: alias(message.id) }],
              }),
            ),
          ),
    );
    const engine = new Engine();
    const rules = ["one", "two", "three"].map((name) => ({
      ...newRule("h1"),
      font: { id: `google:${name}`, family: name, provider: "google" as const },
      properties: { "font-family": name },
    }));
    const applied = engine.apply({ ...emptyConfig(), rules }, 0);
    expect(finish.size).toBe(3);
    finish.get("google:two")?.();
    finish.get("google:three")?.();
    await Promise.resolve();
    expect(
      sendMessage.mock.calls.some(([message]) => message.type === "css"),
    ).toBe(false);
    finish.get("google:one")?.();
    await applied;
    expect(
      sendMessage.mock.calls.filter(([message]) => message.type === "css"),
    ).toHaveLength(1);
    engine.dispose();
  });

  it("does not reuse a variable weight outside one subset's coverage or across styles", async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      data: [
        remote,
        { ...remote, weight: "300 500", unicodeRange: "U+0400-04FF" },
      ],
    });
    await loadFont(request);
    await loadFont({ ...request, weight: 600 });
    await loadFont({ ...request, style: "italic" });
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });
  it("shares decoded variable faces across requested weights", async () => {
    await loadFont(request);
    for (let weight = 410; weight <= 600; weight += 10)
      await loadFont({ ...request, weight });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(decodes).toBe(1);
  });
  it("keeps custom weights distinct even when a delivered face covers a wider range", async () => {
    const id = "custom:Mixed files";
    sendMessage.mockResolvedValue({
      ok: true,
      data: [{ ...remote, family: alias(id), revision }],
    });
    await loadFont({ ...request, id, weight: 600 });
    await loadFont({ ...request, id, weight: 400 });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
  it("retries failed delivery instead of retaining a rejected request", async () => {
    sendMessage.mockRejectedValueOnce(Error("Offline"));
    await expect(loadFont(request)).rejects.toThrow("Offline");
    await loadFont(request);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(faces.size).toBe(1);
  });
  it("retries failed decodes", async () => {
    vi.stubGlobal(
      "FontFace",
      class {
        async load() {
          throw Error("Invalid font");
        }
      },
    );
    await expect(loadFont(request)).rejects.toThrow("could not be decoded");
    vi.stubGlobal(
      "FontFace",
      class {
        async load() {
          return this;
        }
      },
    );
    await loadFont(request);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(faces.size).toBe(1);
  });
  it("keeps multiple custom weights while replacing only a changed face", async () => {
    const face = {
      ...remote,
      family: "Fontzie-custom-Fixture",
      weight: "400",
      revision: "a",
    };
    await loadPayload([face]);
    await loadPayload([{ ...face, weight: "700", revision: "b" }]);
    expect(faces.size).toBe(2);
    await loadPayload([{ ...face, revision: "replacement" }]);
    expect(faces.size).toBe(2);
    expect(decodes).toBe(3);
  });
  it("requests replacement custom files after their stored revision changes", async () => {
    const custom = { id: "custom:Fixture", weight: 400, style: "normal" };
    sendMessage.mockImplementation(async () => ({
      ok: true,
      data: [{ ...remote, family: "Fontzie-custom-Fixture", revision }],
    }));
    await loadFont(custom);
    await loadFont(custom);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    revision = "replacement";
    await loadFont(custom);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(decodes).toBe(2);
    expect(faces.size).toBe(1);
  });
  it("ignores an older custom delivery that finishes after a replacement", async () => {
    const custom = { id: "custom:Fixture", weight: 400, style: "normal" };
    let finish!: (result: unknown) => void;
    sendMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const old = loadFont(custom);
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    revision = "replacement";
    const face = { ...remote, family: "Fontzie-custom-Fixture", revision };
    sendMessage.mockResolvedValue({ ok: true, data: [face] });
    await loadFont(custom);
    finish({ ok: true, data: [{ ...face, revision: "original" }] });
    await old;
    expect(decodes).toBe(1);
    expect(faces.size).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
  it("prunes custom faces and reloads them if their rules return", async () => {
    const custom = { id: "custom:Fixture", weight: 400, style: "normal" };
    sendMessage.mockResolvedValue({
      ok: true,
      data: [{ ...remote, family: "Fontzie-custom-Fixture", revision }],
    });
    await loadFont(custom);
    pruneCustomFonts(new Set());
    expect(faces.size).toBe(0);
    await loadFont(custom);
    expect(faces.size).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
  it("does not register a face whose decode finishes after disposal", async () => {
    let complete!: () => void;
    let calls = 0;
    vi.stubGlobal(
      "FontFace",
      class {
        load() {
          if (calls++) return Promise.resolve();
          return new Promise<void>((resolve) => {
            complete = resolve;
          });
        }
      },
    );
    const loading = loadPayload([
      remote,
      { ...remote, unicodeRange: "U+0400-04FF" },
    ]);
    clearLoadedFonts();
    complete();
    await loading;
    expect(faces.size).toBe(0);
  });
});
