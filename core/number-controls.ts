export type NumberKind = "size" | "leading" | "tracking";
// Practical pointer ranges are separate from the wider typed-value limits.
export function numberControl(kind: NumberKind, unit: string, value: number) {
  const ranges: Record<NumberKind, Record<string, [number, number, number]>> = {
    size: { px: [8, 120, 1], rem: [0.5, 8, 0.05], em: [0.5, 8, 0.05] },
    leading: { "": [0.8, 2.4, 0.05], px: [12, 120, 1], em: [0.8, 2.4, 0.05] },
    tracking: { px: [-4, 8, 0.1], em: [-0.1, 0.4, 0.01] },
  };
  const [min, max, step] = ranges[kind][unit] ?? ranges[kind].px!;
  // Existing or explicitly typed outliers stay editable without clamping.
  return {
    min: Math.min(min, Math.floor(value / step) * step),
    max: Math.max(max, Math.ceil(value / step) * step),
    step,
  };
}
export function numberStep(value: number, direction: number, step: number) {
  return Number((value + direction * step).toFixed(4));
}
