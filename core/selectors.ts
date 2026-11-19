// Split selector lists without breaking commas inside :is(), attributes,
// strings, comments, or escaped class/ID names. Leave invalid empty entries
// intact so the browser can report them rather than silently changing scope.
export function splitSelectors(value: string): string[] {
  if (!value.trim()) return [];
  const parts: string[] = [];
  let start = 0,
    depth = 0,
    quote = "",
    comment = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (comment) {
      if (char === "*" && value[i + 1] === "/") {
        comment = false;
        i++;
      }
      continue;
    }
    if (char === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && value[i + 1] === "*") {
      comment = true;
      i++;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

// In the editor, empty comma-separated slots are typing gestures, not targets.
// Keep splitSelectors strict for validation of saved and imported selectors.
export function splitSelectorDraft(value: string) {
  const parts = splitSelectors(value);
  const separated = parts.length > 1;
  return {
    parts: parts.filter(Boolean),
    separated,
    trailing: separated && parts.at(-1) === "",
  };
}
