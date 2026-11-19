import { reactive } from "vue";

export const cardIds = [
  "connection",
  "targets",
  "rules",
  "font-browser",
  "typography",
  "custom-fonts",
  "settings",
] as const;
export type CardId = (typeof cardIds)[number];
const states = reactive<Partial<Record<CardId, boolean>>>({});
const writes: Partial<Record<CardId, Promise<void>>> = {};
const storageKey = (id: CardId) => `panel:card:${id}`;

export const readCardState = (id: CardId) => states[id];

export async function initializeCardState() {
  const changedDuringLoad = new Set<CardId>();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const id of cardIds) {
      const change = changes[storageKey(id)];
      if (!change) continue;
      changedDuringLoad.add(id);
      if (writes[id]) continue;
      if (typeof change.newValue === "boolean") states[id] = change.newValue;
      else delete states[id];
    }
  });
  try {
    const saved = await chrome.storage.local.get(cardIds.map(storageKey));
    for (const id of cardIds) {
      if (changedDuringLoad.has(id)) continue;
      const value = saved[storageKey(id)];
      if (typeof value === "boolean") states[id] = value;
    }
  } catch (error) {
    console.warn("Could not restore panel layout.", error);
  }
}

export async function saveCardState(id: CardId, open: boolean) {
  if (states[id] === open) return;
  states[id] = open;
  // Separate keys avoid overwriting other cards; a queue preserves rapid toggles.
  const write = (writes[id] ?? Promise.resolve())
    .then(() => chrome.storage.local.set({ [storageKey(id)]: open }))
    .catch((error) => console.warn("Could not save panel layout.", error));
  writes[id] = write;
  await write;
  if (writes[id] === write) delete writes[id];
}
