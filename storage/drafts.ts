import { durableConfig } from "../core/persistence";
import { z } from "zod";
import {
  configSchema,
  selectorSchema,
  type Config,
  type Inspection,
} from "../core/schema";
import { migrateStorage } from "./migrations";

const draftSchema = z.object({
  config: configSchema,
  activeRuleId: z.string().max(200).optional(),
  selection: z
    .object({
      selector: selectorSchema,
      frameUrl: z.string().url().max(5000).optional(),
    })
    .optional(),
});
export const draftKey = (url: string) => {
  const u = new URL(url);
  return `draft:page:${u.origin}${u.pathname}${u.search}`;
};

export async function readPageDraft(url: string) {
  await migrateStorage();
  const key = draftKey(url);
  const values = await chrome.storage.local.get(key);
  const parsed = draftSchema.safeParse(values[key]);
  return parsed.success ? parsed.data : undefined;
}

export async function writePageDraft(
  url: string,
  config: Config,
  selection?: Inspection,
  activeRuleId?: string,
) {
  // DOM handles and tab/frame IDs are session ownership, not durable identity.
  // A new document must rebind exact picks through the existing unique-match check.
  const data = draftSchema.parse({
    config: durableConfig(config),
    activeRuleId: config.rules.some((rule) => rule.id === activeRuleId)
      ? activeRuleId
      : undefined,
    selection: selection
      ? {
          selector: selection.selector,
          frameUrl: selection.frameId ? selection.url : undefined,
        }
      : undefined,
  });
  await chrome.storage.local.set({ [draftKey(url)]: data });
}
