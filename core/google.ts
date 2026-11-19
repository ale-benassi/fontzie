import type { FontFamily } from "./schema";
export function googleCSSURL(font: FontFamily, weight: number, style: string) {
  const axes = font.axes.filter((a) => a.tag !== "ital");
  const values = new Map(
    axes.map((a) => [
      a.tag,
      a.min === a.max ? `${a.min}` : `${a.min}..${a.max}`,
    ]),
  );
  if (!values.has("wght")) values.set("wght", String(weight));
  if (font.styles.includes("italic"))
    values.set("ital", style === "italic" ? "1" : "0");
  const names = [...values.keys()].sort((a, b) => a.localeCompare(b, "en-US"));
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family).replace(/%20/g, "+")}:${names.join(",")}@${names.map((n) => values.get(n)).join(",")}&display=swap`;
}
