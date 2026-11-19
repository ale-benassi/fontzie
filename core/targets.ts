import type { Rule, Target } from "./schema";
import { splitSelectors } from "./selectors";

export function ruleTargets(rule: Rule): Target[] {
  if (rule.targets) return rule.targets;
  if (!rule.selector) return [];
  return rule.mode === "exact"
    ? [{ kind: "exact", selector: rule.selector, handle: rule.handle }]
    : splitSelectors(rule.selector).map((selector) => ({
        kind: "selector",
        selector,
      }));
}
export function targetQuery(target: Target) {
  return target.kind === "exact"
    ? target.handle
      ? `[data-fontzie-target~="${target.handle}"]`
      : ":not(*)"
    : target.selector;
}
export const targetsQuery = (targets: Target[]) =>
  targets.map(targetQuery).join(", ");
export const ruleQuery = (rule: Rule) => targetsQuery(ruleTargets(rule));
export const hasExactTargets = (rule: Rule) =>
  ruleTargets(rule).some((target) => target.kind === "exact");
export function withTargets(rule: Rule, targets: Target[]): Rule {
  const unique = targets.filter(
    (target, index) =>
      targets.findIndex(
        (other) =>
          other.kind === target.kind &&
          (target.kind === "exact" && other.kind === "exact"
            ? target.handle
              ? other.handle === target.handle
              : other.selector === target.selector
            : other.selector === target.selector),
      ) === index,
  );
  const exact =
    unique.length === 1 && unique[0]?.kind === "exact" ? unique[0] : undefined;
  return {
    ...rule,
    selector: unique.map((target) => target.selector).join(", "),
    mode: exact ? "exact" : "selector",
    handle: exact?.handle,
    targets: unique.length ? unique : undefined,
  };
}
