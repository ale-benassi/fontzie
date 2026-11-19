import type { z } from "zod";
import {
  emptyConfig,
  configSchema,
  type Config,
  type Inspection,
  type ContentRequest,
  type TabState,
} from "../core/schema";
import { tabStateSchema, type panelEnvelopeSchema } from "../core/messages";
import type { createQueue } from "../core/queue";
import { validateFontRule } from "../core/font-rules";
import { findFont, loadCatalog } from "../providers/catalog";
import { allFaces, groupFamilies } from "../storage/fonts";
import { draftKey, writePageDraft } from "../storage/drafts";
import { inspectableWebsite } from "../core/site-access";
import { restoreRuleFrames } from "../core/frames";
import type { SessionService } from "./session";
export function createPanelService(
  serial: ReturnType<typeof createQueue>,
  { send, connect, inject }: SessionService,
) {
  type Broadcast = Extract<
    ContentRequest,
    { type: "apply" | "clear" | "clear-selection" | "before" | "pick" }
  >;
  async function broadcast(tabId: number, ids: number[], command: Broadcast) {
    const warnings = new Set<string>();
    async function refresh() {
      const live = await inject(tabId);
      if (!live.some((frame) => frame.id === 0))
        throw Error("The website is no longer connected.");
      if (command.type === "apply")
        command = {
          ...command,
          config: restoreRuleFrames(command.config, live, true, warnings),
        };
      return live.map((frame) => frame.id);
    }
    let currentIds = ids;
    if (
      command.type === "apply" &&
      command.config.rules.some(
        (rule) => rule.enabled && !ids.includes(rule.frameId),
      )
    )
      currentIds = await refresh();
    for (const id of currentIds) {
      const result = await send(tabId, id, command);
      if (result.ok) continue;
      if (
        id === 0 ||
        !/receiving end does not exist|no frame with id|frame.*(?:was removed|not found)/i.test(
          result.error,
        )
      )
        throw Error(result.error);
      // Confirm that the child disappeared before treating a failed delivery as harmless.
      currentIds = await refresh();
      if (currentIds.includes(id)) throw Error(result.error);
      for (const liveId of currentIds) {
        const retry = await send(tabId, liveId, command);
        if (!retry.ok) throw Error(retry.error);
      }
      break;
    }
    return {
      command,
      frames: currentIds,
      changed: currentIds !== ids,
      warnings: [...warnings],
    };
  }
  async function run(
    {
      tabId,
      type,
      request,
      frameId = 0,
      activeRuleId,
      pageUrl,
    }: z.infer<typeof panelEnvelopeSchema>,
    siteClearId?: string,
  ) {
    if (type === "connect") return connect(tabId);
    if (type === "list-frames") return inject(tabId);
    if (type === "select-rule") {
      const key = `tab:${tabId}`;
      const state = tabStateSchema
        .passthrough()
        .parse((await chrome.storage.session.get(key))[key]);
      if (!pageUrl || draftKey(pageUrl) !== draftKey(state.url))
        throw Error("The website changed before the rule could be remembered.");
      if (
        activeRuleId &&
        !state.config.rules.some((rule) => rule.id === activeRuleId)
      )
        throw Error("This rule is no longer available.");
      if (state.activeRuleId === activeRuleId) return true;
      await writePageDraft(
        state.url,
        state.config,
        state.selection,
        activeRuleId,
      );
      // Preserve document/frame ownership metadata outside the public state schema.
      await chrome.storage.session.set({ [key]: { ...state, activeRuleId } });
      return true;
    }
    if (!request) throw Error("Missing page command.");
    if (request.type === "clear-selection") {
      const ids = ((await chrome.storage.session.get(`frames:${tabId}`))[
        `frames:${tabId}`
      ] as number[] | undefined) ?? [0];
      await broadcast(tabId, ids, request);
      const key = `tab:${tabId}`;
      const old = (await chrome.storage.session.get(key))[key] as
        TabState | undefined;
      if (old) {
        await chrome.storage.session.set({
          [key]: { ...old, selection: undefined },
        });
        await writePageDraft(old.url, old.config, undefined, old.activeRuleId);
      }
      return true;
    }
    if (
      request.type === "apply" ||
      request.type === "clear" ||
      request.type === "before" ||
      request.type === "pick"
    ) {
      if (request.type === "apply") {
        if (
          request.config.rules.some(
            (rule) =>
              rule.enabled &&
              (rule.font?.provider === "google" ||
                rule.font?.provider === "fontshare"),
          )
        )
          await loadCatalog();
        const custom = request.config.rules.some(
          (r) => r.font?.provider === "custom",
        )
          ? groupFamilies(await allFaces())
          : [];
        for (const rule of request.config.rules.filter((r) => r.enabled))
          if (rule.font) validateFontRule(rule, findFont(rule.font.id, custom));
      }
      const ids = ((await chrome.storage.session.get(`frames:${tabId}`))[
        `frames:${tabId}`
      ] as number[] | undefined) ?? [0];
      const previous =
        (
          (await chrome.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`] as
            { config?: Config } | undefined
        )?.config ?? emptyConfig();
      let delivered;
      try {
        delivered = await broadcast(tabId, ids, request);
        request = delivered.command;
        const current = (await chrome.storage.session.get(`tab:${tabId}`))[
          `tab:${tabId}`
        ] as
          | { url?: string; selection?: Inspection; activeRuleId?: string }
          | undefined;
        if (
          current?.url &&
          (request.type === "apply" || request.type === "clear")
        )
          await writePageDraft(
            current.url,
            request.type === "apply" ? request.config : emptyConfig(),
            request.type === "apply" ? current.selection : undefined,
            request.type === "apply" ? current.activeRuleId : undefined,
          );
      } catch (error) {
        if (request.type === "apply" || siteClearId)
          for (const id of ids)
            await send(tabId, id, {
              type: "apply",
              config: previous,
            }).catch(() => {});
        throw error;
      }
      if (request.type === "before" || request.type === "pick") return true;
      const key = `tab:${tabId}`;
      const old = (await chrome.storage.session.get(key))[key] ?? {};
      await chrome.storage.session.set({
        [key]: {
          ...old,
          ...(request.type === "clear" && {
            selection: undefined,
            activeRuleId: undefined,
          }),
          ...(siteClearId && { siteClearId }),
          restorationWarnings: delivered.warnings,
          frames: delivered.frames,
          config: request.type === "apply" ? request.config : emptyConfig(),
        },
      });
      return request.type === "apply" && delivered.changed
        ? {
            config: request.config,
            frames: delivered.frames,
            warnings: delivered.warnings,
          }
        : true;
    }
    if (request.type === "inspect" && !request.previewOnly) {
      const result = await send(tabId, frameId, request);
      if (!result.ok) throw Error(result.error);
      const key = `tab:${tabId}`;
      const old = (await chrome.storage.session.get(key))[key] ?? {};
      await chrome.storage.session.set({
        [key]: { ...old, selection: result.data.selection },
      });
      return result.data;
    }
    const result = await send(tabId, frameId, request);
    if (!result.ok) throw Error(result.error);
    return result.data;
  }
  async function clearSite(tabId: number, origin?: string) {
    const tab = await chrome.tabs.get(tabId);
    const sessions = await chrome.storage.session.get(null);
    const source = tabStateSchema.safeParse(sessions[`tab:${tabId}`]);
    if (
      !origin ||
      !source.success ||
      inspectableWebsite(source.data.url)?.origin !== origin ||
      inspectableWebsite(tab.url)?.origin !== origin ||
      (tab.pendingUrl && inspectableWebsite(tab.pendingUrl)?.origin !== origin)
    )
      throw Error("The website changed. Open Clear site edits again.");

    const siteClearId = crypto.randomUUID();
    for (const [key, value] of Object.entries(sessions)) {
      if (!key.startsWith("tab:")) continue;
      const state = tabStateSchema.passthrough().safeParse(value);
      if (
        !state.success ||
        inspectableWebsite(state.data.url)?.origin !== origin
      )
        continue;
      const id = Number(key.slice(4));
      const open = await chrome.tabs.get(id).catch(() => undefined);
      if (!open) continue;
      if (inspectableWebsite(open.url)?.origin === origin) {
        await run(
          {
            channel: "fontzie-panel",
            tabId: id,
            type: "request",
            request: { type: "clear" },
          },
          siteClearId,
        );
      } else {
        // The tab navigated away. Discard its old state without touching the new page.
        await chrome.storage.session.set({
          [key]: {
            ...state.data,
            config: emptyConfig(),
            selection: undefined,
            activeRuleId: undefined,
            restorationWarnings: [],
            siteClearId,
          },
        });
      }
    }

    const prefix = draftKey(`${origin}/`);
    const saved = await chrome.storage.local.get(null);
    await chrome.storage.local.remove(
      Object.keys(saved).filter((key) => key.startsWith(prefix)),
    );
    return true;
  }
  function handle(message: z.infer<typeof panelEnvelopeSchema>) {
    if (message.type === "clear-site")
      return serial.exclusive(() =>
        clearSite(message.tabId, message.siteOrigin),
      );
    const key = `tab:${message.tabId}`;
    return serial(key, async () => {
      if (message.request?.type === "apply") {
        const state = (await chrome.storage.session.get(key))[key] as
          { siteClearId?: string } | undefined;
        if (message.siteClearId !== state?.siteClearId)
          throw Error(
            "Site edits were cleared. Try again after Fontzie refreshes.",
          );
      }
      return run(message);
    });
  }
  function clearAllData(removeSavedData: () => Promise<void>) {
    return serial.exclusive(async () => {
      const reloadTabs: number[] = [];
      const states = await chrome.storage.session.get(null);
      for (const [key, value] of Object.entries(states)) {
        if (!key.startsWith("tab:")) continue;
        const tabId = Number(key.slice(4));
        const tab = await chrome.tabs.get(tabId).catch(() => undefined);
        const url = inspectableWebsite(tab?.url);
        if (
          !url ||
          !value ||
          typeof value !== "object" ||
          !("url" in value) ||
          typeof value.url !== "string" ||
          draftKey(url.href) !== draftKey(value.url)
        )
          continue;
        try {
          await run({
            channel: "fontzie-panel",
            tabId,
            type: "request",
            request: { type: "clear" },
          });
        } catch {
          // One unreachable document must not prevent deletion of the saved library.
          reloadTabs.push(tabId);
        }
      }
      await removeSavedData();
      return { reloadTabs };
    });
  }
  function updateConfig(
    tabId: number,
    update: (
      current: Config,
    ) => Config | undefined | Promise<Config | undefined>,
  ) {
    return serial(`tab:${tabId}`, async () => {
      const state = (await chrome.storage.session.get(`tab:${tabId}`))[
        `tab:${tabId}`
      ] as { config?: unknown } | undefined;
      const current = configSchema.safeParse(state?.config);
      if (!current.success) return;
      const config = await update(current.data);
      if (!config) return;
      // Already inside the tab queue: use the same apply path directly.
      const result = await run({
        channel: "fontzie-panel",
        type: "request",
        tabId,
        request: { type: "apply", config },
      });
      return typeof result === "object" && "config" in result
        ? result.config
        : config;
    });
  }
  return { handle, updateConfig, clearAllData };
}
