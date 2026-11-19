import { z } from "zod";
import {
  ConnectionBlocked,
  panelEnvelopeSchema,
  fontRequestSchema,
  historyHandoffSchema,
  pageEventSchema,
  storageCommandSchema,
} from "../core/messages";
import { createQueue } from "../core/queue";
import { createFloatingService } from "../background/floating";
import { createSessionService } from "../background/session";
import { createPanelService } from "../background/panel";
import {
  applyOwnedCSS,
  clearClosedDocumentStyles,
  indexLegacyStyles,
  removeTabStyles,
} from "../background/styles";
import { mutateStorage, withStorageLock } from "../storage/mutations";
import { createLibraryService } from "../background/library";
import { deliverFont } from "../providers/delivery";
import {
  migrateStorage,
  removeLegacyFontComparisons,
} from "../storage/migrations";
export default defineBackground(() => {
  void withStorageLock(async () => {
    await migrateStorage();
    await removeLegacyFontComparisons();
  }).catch(console.error);
  const isEditor = (sender: chrome.runtime.MessageSender) => {
    try {
      const url = new URL(sender.url ?? "");
      return (
        url.protocol === "chrome-extension:" &&
        url.host === chrome.runtime.id &&
        url.pathname === "/sidepanel.html"
      );
    } catch {
      return false;
    }
  };
  const { hideFloating, showFloating } = createFloatingService();
  // The destination editor connects during the move. Keep the handoff out of
  // durable storage and bind it to the destination mode and original document.
  const handoffs = new Map<
    number,
    { floating: boolean; history: z.infer<typeof historyHandoffSchema> }
  >();
  const serial = createQueue();
  // Page operations can wait for a site clear. CSS replies to those operations
  // must run independently so the clear can remove styles while it holds that queue.
  const cssSerial = createQueue();
  void cssSerial.exclusive(indexLegacyStyles).catch(console.error);
  const sessions = createSessionService(serial, showFloating);
  const { restoreTab } = sessions;
  const panel = createPanelService(serial, sessions);
  const library = createLibraryService(panel);
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(console.error);
  // Handle the action explicitly so Chrome grants activeTab before the panel
  // connects. Automatic side-panel toggling does not grant that permission.
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    // Chrome's own pages can open the sidebar but cannot host a floating editor.
    void hideFloating(tab.id).catch(() => {});
    void chrome.sidePanel
      .open({ windowId: tab.windowId })
      .then(() =>
        chrome.runtime
          .sendMessage({ channel: "fontzie-action", tabId: tab.id })
          .catch(() => {}),
      )
      .catch(console.error);
  });
  chrome.runtime.onMessage.addListener((raw, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    const embeddedEditor = sender.tab?.url?.startsWith("http");
    if (raw?.channel === "fontzie-library" && isEditor(sender)) {
      if (raw.type === "clear-data") {
        void library
          .clearData()
          .then((data) => {
            handoffs.clear();
            respond({ ok: true, data });
          })
          .catch((error) => respond({ ok: false, error: error.message }));
        return true;
      }
      if (
        raw.type === "reconcile-fonts" &&
        Number.isInteger(raw.tabId) &&
        raw.tabId >= 0 &&
        (!embeddedEditor || sender.tab!.id === raw.tabId)
      ) {
        void library
          .reconcileFonts(raw.tabId)
          .then((data) => respond({ ok: true, data }))
          .catch((error) => respond({ ok: false, error: error.message }));
        return true;
      }
      respond({ ok: false, error: "Invalid library command." });
      return;
    }
    if (raw?.channel === "fontzie-storage" && isEditor(sender)) {
      const command = storageCommandSchema.safeParse(raw.command);
      if (!command.success) {
        respond({ ok: false, error: "Invalid storage command." });
        return;
      }
      void mutateStorage(command.data)
        .then(() => respond({ ok: true }))
        .catch((error) => respond({ ok: false, error: error.message }));
      return true;
    }
    if (raw?.channel === "fontzie-editor" && isEditor(sender)) {
      const parsed = z
        .object({
          tabId: z.number().int().min(0),
          action: z.enum(["float", "dock", "close"]),
          history: historyHandoffSchema.optional(),
        })
        .safeParse(raw);
      if (
        !parsed.success ||
        (embeddedEditor && sender.tab!.id !== parsed.data.tabId)
      )
        return;
      const { tabId, action } = parsed.data;
      const handoff =
        parsed.data.history && action !== "close"
          ? { floating: action === "float", history: parsed.data.history }
          : undefined;
      if (handoff) handoffs.set(tabId, handoff);
      else handoffs.delete(tabId);
      const work =
        action === "dock"
          ? chrome.sidePanel.open({ tabId }).then(() => hideFloating(tabId))
          : action === "close"
            ? hideFloating(tabId)
            : showFloating(tabId);
      void work
        .then(async () => {
          respond({ ok: true });
          if (action === "float") {
            const tab = await chrome.tabs.get(tabId);
            const api = chrome.sidePanel as typeof chrome.sidePanel & {
              close?: (options: { windowId: number }) => Promise<void>;
            };
            await api.close?.({ windowId: tab.windowId }).catch(() => {});
          }
        })
        .catch((error) => {
          if (handoffs.get(tabId) === handoff) handoffs.delete(tabId);
          respond({ ok: false, error: error.message });
        });
      return true;
    }
    if (raw?.channel === "fontzie-panel" && isEditor(sender)) {
      const parsed = panelEnvelopeSchema.safeParse(raw);
      if (!parsed.success) {
        respond({ ok: false, error: "Invalid panel command." });
        return;
      }
      const { tabId } = parsed.data;
      if (embeddedEditor && sender.tab!.id !== tabId) {
        respond({
          ok: false,
          error: "The floating editor belongs to a different tab.",
        });
        return;
      }
      void panel
        .handle(parsed.data)
        .then((data) => {
          const handoff = handoffs.get(tabId);
          if (
            parsed.data.type === "connect" &&
            handoff &&
            typeof data === "object" &&
            "documentToken" in data &&
            handoff.floating ===
              new URL(sender.url!).searchParams.has("floating")
          ) {
            handoffs.delete(tabId);
            if (
              data.documentToken === handoff.history.documentToken &&
              data.url === handoff.history.url
            )
              return respond({
                ok: true,
                data: { ...data, history: handoff.history.snapshot },
              });
          }
          respond({ ok: true, data });
        })
        .catch((error: unknown) =>
          respond({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            ...(error instanceof ConnectionBlocked && {
              connectionBlock: error.reason,
            }),
          }),
        );
      return true;
    }
    if (raw?.channel === "fontzie-content" && sender.tab?.id !== undefined) {
      const tabId = sender.tab.id;
      const frameId = sender.frameId ?? 0;
      void (async () => {
        if (raw.type === "css") {
          return applyOwnedCSS(sender, raw.css, cssSerial);
        }

        if (raw.type === "font") {
          const p = fontRequestSchema.parse(raw);
          return deliverFont(p.id, p.weight, p.style);
        }
        if (raw.type === "event") {
          const data = pageEventSchema.parse(raw.data);
          if (data.type === "selection") {
            const key = `tab:${tabId}`;
            data.selection.frameId = frameId;
            await serial(key, async () => {
              const old = (await chrome.storage.session.get(key))[key] ?? {};
              await chrome.storage.session.set({
                [key]: { ...old, selection: data.selection },
              });
            });
          }
          await chrome.runtime
            .sendMessage({
              channel: "fontzie-event",
              tabId,
              frameId,
              data,
            })
            .catch(() => {});
          return true;
        }
        throw Error("Unknown content command.");
      })()
        .then((data) => respond({ ok: true, data }))
        .catch((e) => respond({ ok: false, error: e.message }));
      return true;
    }
    if (raw?.channel === "fontzie-font" && isEditor(sender)) {
      const p = fontRequestSchema.safeParse(raw);
      if (!p.success) return;
      deliverFont(p.data.id, p.data.weight, p.data.style)
        .then((data) => respond({ ok: true, data }))
        .catch((e) => respond({ ok: false, error: e.message }));
      return true;
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    handoffs.delete(tabId);
    void serial(`tab:${tabId}`, () =>
      cssSerial(`css:${tabId}`, () => removeTabStyles(tabId)),
    ).catch(console.error);
  });
  chrome.tabs.onUpdated.addListener((_tabId, info, tab) => {
    if (info.status === "loading") handoffs.delete(_tabId);
    if (info.status === "complete" || (info.url && tab.status === "complete"))
      void restoreTab(tab).catch(() => {});
  });
  const restoreOpenTabs = () => {
    void chrome.tabs
      .query({ status: "complete" })
      .then((tabs) =>
        Promise.all(tabs.map((tab) => restoreTab(tab).catch(() => {}))),
      )
      .catch(console.error);
  };
  chrome.runtime.onStartup.addListener(() => {
    // Browser shutdown removes the documents and their USER styles.
    void cssSerial
      .exclusive(clearClosedDocumentStyles)
      .then(restoreOpenTabs)
      .catch(console.error);
  });
  chrome.runtime.onInstalled.addListener(restoreOpenTabs);
});
