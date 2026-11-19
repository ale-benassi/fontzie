import { z } from "zod";

const fallbackMessage =
  "Something went wrong. Try again. If it keeps happening, reopen Fontzie.";

// Chrome and DOM failures also travel through the worker as plain messages.
// Match those messages here while preserving Fontzie's actionable feedback.
const technicalErrors: [RegExp, string][] = [
  [
    /Frame with ID 0 is showing error page/i,
    "This page couldn’t load. Reload the website, then try again.",
  ],
  [
    /Frame with ID \d+ is showing error page/i,
    "Part of this page couldn’t load. Reload the website, then try again.",
  ],
  [
    /No tab with id|Invalid tab ID|tab (?:was|has been) closed/i,
    "This tab is no longer available. Open a website, then reopen Fontzie.",
  ],
  [
    /No (?:frame|document) with (?:given )?id|frame (?:was|has been) removed|Frame with ID \d+ (?:was removed|does not exist)|document (?:was|has been) unloaded/i,
    "The page changed before Fontzie could finish. Try again on the current page.",
  ],
  [
    /Extension context invalidated|Receiving end does not exist|Could not establish connection|message (?:port|channel) closed|message port closed|asynchronous response.*channel closed/i,
    "Fontzie lost its connection to this page. Reload the website, then try again.",
  ],
  [
    /Cannot access (?:contents of|a chrome)|cannot be scripted|Missing host permission/i,
    "Fontzie cannot access this page. Open a regular website and click Fontzie’s toolbar icon to allow access.",
  ],
  [
    /not a valid selector|invalid selector/i,
    "This CSS selector isn’t valid. Check it and try again, or use Pick element.",
  ],
  [
    /QUOTA_BYTES|quota.*exceed|exceed.*quota|QuotaExceededError/i,
    "There isn’t enough space to save this. Export a backup before removing unused presets or custom fonts, then try again.",
  ],
  [
    /IndexedDB|IDBDatabase|IDBTransaction|database (?:connection|is closed)|transaction (?:was aborted|is inactive)|backing store/i,
    "Fontzie couldn’t access its saved data. Reopen Fontzie and try again.",
  ],
  [
    /Failed to fetch|NetworkError|Network request failed|net::ERR_/i,
    "The requested download failed. Check your connection, then try again.",
  ],
  [
    /TimeoutError|timed out|aborted due to timeout/i,
    "This took too long. Check your connection, then try again.",
  ],
  [
    /AbortError|signal is aborted|operation was aborted/i,
    "The operation was interrupted. Try again.",
  ],
  [
    /NotAllowedError|Permission denied|User denied|request is not allowed/i,
    "Chrome didn’t allow this action. Check the requested permission, then try again.",
  ],
  [
    /^(?:TypeError|ReferenceError|SyntaxError|SecurityError|InvalidStateError|DataError|UnknownError):|Cannot (?:read|set) propert|is not (?:a function|defined)|Unexpected (?:token|end)|not valid JSON|Failed to execute|^Unknown content command\.|^Missing page command\.|^Invalid command\.|^Page command failed\./i,
    fallbackMessage,
  ],
];

// Worker errors can arrive as an Error whose message contains serialized issues.
// Keep validation internals out of the panel, including that transport case.
export function errorMessage(
  error: unknown,
  fallback = fallbackMessage,
): string {
  const message = (
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ""
  )
    .trim()
    .replace(/^Error:\s*/, "");
  let issues: unknown = error instanceof z.ZodError ? error.issues : undefined;
  if (!issues && message.trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(message);
      if (
        Array.isArray(parsed) &&
        parsed.length &&
        parsed.every(
          (issue) =>
            issue &&
            typeof issue.code === "string" &&
            Array.isArray(issue.path),
        )
      )
        issues = parsed;
    } catch {}
  }
  if (Array.isArray(issues)) {
    return "Some values are invalid. Check the typography values, then try again.";
  }
  for (const [pattern, explanation] of technicalErrors) {
    if (pattern.test(message))
      return explanation === fallbackMessage ? fallback : explanation;
  }
  // Native JavaScript errors can have arbitrary implementation details. This
  // also catches DOM exceptions before a worker serializes their name away.
  if (
    error instanceof Error &&
    error.name !== "Error" &&
    error.name !== "ZodError"
  )
    return fallback;
  return message || fallback;
}
