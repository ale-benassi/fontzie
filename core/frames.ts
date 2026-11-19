import type { Config } from "./schema";

export interface FrameLocation {
  id: number;
  url: string;
}

export function resolveFrame<T extends FrameLocation>(
  frames: T[],
  id: number,
  url: string | undefined,
  sameDocument: boolean,
) {
  if (id === 0) return frames.find((frame) => frame.id === 0);
  const matches = frames.filter((frame) => frame.id !== 0 && frame.url === url);
  if (sameDocument) return matches.find((frame) => frame.id === id);
  return matches.length === 1 ? matches[0] : undefined;
}

export function restoreRuleFrames(
  config: Config,
  frames: FrameLocation[],
  sameDocument: boolean,
  warnings: Set<string>,
): Config {
  return {
    ...config,
    rules: config.rules.map((rule) => {
      if (rule.frameId === 0) return rule;
      const frame = resolveFrame(
        frames,
        rule.frameId,
        rule.frameUrl,
        sameDocument,
      );
      if (frame) return { ...rule, frameId: frame.id };
      const ambiguous =
        frames.filter((frame) => frame.id !== 0 && frame.url === rule.frameUrl)
          .length > 1;
      warnings.add(
        `The frame for “${rule.selector}” ${ambiguous ? "matches more than one frame" : "was not found"}. Its rule is paused; create a new rule in the intended frame.`,
      );
      return { ...rule, frameId: 2147483647, enabled: false };
    }),
  };
}
