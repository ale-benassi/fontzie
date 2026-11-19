import type { Axis, FontFamily, Properties, Rule } from "./schema";
export const alias = (id: string) =>
  id.startsWith("custom:")
    ? "Fontzie-custom-u" +
      id
        .split("")
        .map((character) =>
          character.charCodeAt(0).toString(16).padStart(4, "0"),
        )
        .join("")
    : "Fontzie-" + id.replace(/[^a-z0-9-]/gi, "-");
export function fontRequest(rule: Rule) {
  return {
    id: rule.font!.id,
    weight: Number(rule.properties["font-weight"] ?? 400),
    style: rule.properties["font-style"] ?? "normal",
  };
}

export function fontRequestKey(request: FontRequest, font?: FontFamily) {
  const axis =
    font &&
    availableAxes(font, request.style, request.weight).find(
      (axis) => axis.tag === "wght",
    );
  // Remote variable files contain a full range. Custom files keep their exact
  // request identity because a family can mix static and variable faces.
  const weight =
    axis &&
    font &&
    font.provider !== "custom" &&
    supportsWeight(font, request.weight, request.style)
      ? `${axis.min}..${axis.max}`
      : request.weight;
  return JSON.stringify([request.id, weight, request.style]);
}

interface FaceAvailability {
  weight: number;
  style: string;
  variable?: boolean;
  axes?: Axis[];
}

function faceAxes(face: FaceAvailability, fallbackAxes: Axis[]) {
  return face.axes ?? (face.variable ? fallbackAxes : []);
}

function hasFaceAxes(font: FontFamily) {
  return (
    font.faces !== undefined &&
    (font.provider === "custom" ||
      font.faces.some((face) => face.axes !== undefined))
  );
}

export function supportsFaceWeight(
  face: FaceAvailability,
  weight: number,
  fallbackAxes: Axis[] = [],
) {
  const axis = faceAxes(face, fallbackAxes).find((axis) => axis.tag === "wght");
  return axis
    ? weight >= axis.min && weight <= axis.max
    : weight === face.weight;
}

export function supportsWeight(
  font: FontFamily,
  weight: number,
  style = "normal",
) {
  if (!font.styles.includes(style)) return false;
  if (hasFaceAxes(font))
    return font.faces!.some(
      (face) =>
        face.style === style && supportsFaceWeight(face, weight, font.axes),
    );
  const axis = font.axes.find((axis) => axis.tag === "wght");
  return axis
    ? weight >= axis.min && weight <= axis.max
    : availableWeights(font, style).includes(weight);
}

export function availableWeights(font: FontFamily, style = "normal") {
  if (!font.styles.includes(style)) return [];
  if (!hasFaceAxes(font)) {
    const values = font.faces
      ?.filter((face) => face.style === style && !face.variable)
      .map((face) => face.weight);
    return [...new Set(values?.length ? values : font.weights)].sort(
      (a, b) => a - b,
    );
  }
  const values = font
    .faces!.filter((face) => face.style === style)
    .flatMap((face) => {
      const axis = faceAxes(face, font.axes).find(
        (axis) => axis.tag === "wght",
      );
      if (!axis) return [face.weight];
      return [
        Math.ceil(axis.min),
        Math.floor(axis.max),
        Math.round(axis.default),
        face.weight,
        ...font.weights,
        ...Array.from({ length: 10 }, (_, index) => (index + 1) * 100),
      ].filter((weight) => supportsFaceWeight(face, weight, font.axes));
    });
  return [...new Set(values)].sort((a, b) => a - b);
}

export function closestWeight(
  font: FontFamily,
  desired: number,
  style = "normal",
) {
  const weights = availableWeights(font, style);
  const axes = hasFaceAxes(font)
    ? font
        .faces!.filter((face) => face.style === style)
        .flatMap((face) => faceAxes(face, font.axes))
    : font.styles.includes(style)
      ? font.axes
      : [];
  for (const axis of axes.filter((axis) => axis.tag === "wght"))
    weights.push(
      Math.min(
        Math.floor(axis.max),
        Math.max(Math.ceil(axis.min), Math.round(desired)),
      ),
    );
  if (!weights.length) throw Error(`${font.family} does not provide ${style}.`);
  return weights.reduce((best, weight) =>
    Math.abs(weight - desired) < Math.abs(best - desired) ? weight : best,
  );
}

export function availableAxes(
  font: FontFamily,
  style = "normal",
  weight?: number,
) {
  if (!font.styles.includes(style)) return [];
  if (!hasFaceAxes(font)) return font.axes;
  const candidates = font.faces!.filter(
    (face) =>
      face.style === style &&
      (weight === undefined || supportsFaceWeight(face, weight, font.axes)),
  );
  if (!candidates.length) return [];
  // Overlapping files may all be loaded for this descriptor. Only expose axis
  // values every matching face can render, rather than inventing a union.
  return faceAxes(candidates[0]!, font.axes).flatMap((axis) => {
    const shared = candidates.map((face) =>
      faceAxes(face, font.axes).find((candidate) => candidate.tag === axis.tag),
    );
    if (shared.some((candidate) => !candidate)) return [];
    const min = Math.max(...shared.map((candidate) => candidate!.min));
    const max = Math.min(...shared.map((candidate) => candidate!.max));
    return min > max
      ? []
      : [
          {
            ...axis,
            min,
            max,
            default: Math.min(max, Math.max(min, axis.default)),
          },
        ];
  });
}

export function fontVariantPatch(
  font: FontFamily,
  properties: Properties,
  desired: { style?: string; weight?: number },
): Properties {
  const preferred = desired.style ?? properties["font-style"] ?? "normal";
  const style = font.styles.includes(preferred)
    ? preferred
    : font.styles.includes("normal")
      ? "normal"
      : (font.styles[0] ?? "normal");
  const weight = closestWeight(
    font,
    desired.weight ?? Number(properties["font-weight"] ?? 400),
    style,
  );
  const axes = availableAxes(font, style, weight);
  const hasStyleFaces =
    font.styles.includes("normal") && font.styles.includes("italic");
  const variations = new Map<string, number>();
  for (const match of (properties["font-variation-settings"] ?? "").matchAll(
    /"([\w]{4})" (-?[\d.]+)/g,
  )) {
    const axis = axes.find((axis) => axis.tag === match[1]);
    if (!axis) continue;
    const value =
      axis.tag === "wght"
        ? weight
        : axis.tag === "ital" && hasStyleFaces
          ? style === "italic"
            ? 1
            : 0
          : Number(match[2]);
    variations.set(axis.tag, Math.min(axis.max, Math.max(axis.min, value)));
  }
  if (desired.weight !== undefined && axes.some((axis) => axis.tag === "wght"))
    variations.set("wght", weight);
  const patch: Properties = {
    "font-style": style as Properties["font-style"],
    "font-weight": String(weight),
    "font-variation-settings": variations.size
      ? [...variations].map(([tag, value]) => `"${tag}" ${value}`).join(", ")
      : properties["font-variation-settings"] === "normal"
        ? "normal"
        : undefined,
  };
  if (properties["font-stretch"] !== undefined) {
    const width = axes.find((axis) => axis.tag === "wdth");
    patch["font-stretch"] = width
      ? `${Math.min(width.max, Math.max(width.min, parseFloat(properties["font-stretch"])))}%`
      : undefined;
  }
  if (
    properties["font-optical-sizing"] !== undefined &&
    !axes.some((axis) => axis.tag === "opsz")
  )
    patch["font-optical-sizing"] = undefined;
  return patch;
}

export function parseAxes(settings = "") {
  const axes = new Map<string, number>();
  for (const match of settings.matchAll(
    /"([a-zA-Z0-9]{4})" (-?\d+(?:\.\d+)?)/g,
  )) {
    const [, tag, value] = match;
    if (tag && value !== undefined) axes.set(tag, Number(value));
  }
  return axes;
}

export function formatAxes(axes: ReadonlyMap<string, number>) {
  return axes.size
    ? [...axes].map(([tag, value]) => `"${tag}" ${value}`).join(", ")
    : undefined;
}

export function withoutAxis(settings: string | undefined, tag: string) {
  const axes = parseAxes(settings);
  return axes.delete(tag) ? formatAxes(axes) : settings;
}

export interface FontRequest {
  id: string;
  weight: number;
  style: string;
}
export const CUSTOM_FONTS_REVISION_KEY = "custom-fonts:revision";
