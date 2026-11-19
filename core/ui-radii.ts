/** Shared corner geometry for the panel, floating shell and page labels. */
export const radiusTokens = {
  "--radius": "8px",
  "--radius-sm": "calc(var(--radius) * 0.5)",
  "--radius-md": "calc(var(--radius) * 0.75)",
  "--radius-lg": "var(--radius)",
  "--radius-xl": "calc(var(--radius) * 1.5)",
  "--radius-inset": "max(0px, calc(var(--radius-lg) - 1px))",
  "--radius-pill": "999px",
  "--radius-circle": "50%",
} as const;

export const radiusDeclarations = Object.entries(radiusTokens)
  .map(([name, value]) => `${name}:${value};`)
  .join("");
