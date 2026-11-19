import { describe, expect, it } from "vitest";
import { errorMessage } from "../../core/errors";

describe("readable error messages", () => {
  it.each([
    [
      "Frame with ID 0 is showing error page",
      "This page couldn’t load. Reload the website, then try again.",
    ],
    [
      "Frame with ID 23 is showing error page",
      "Part of this page couldn’t load. Reload the website, then try again.",
    ],
    [
      "No tab with id: 123.",
      "This tab is no longer available. Open a website, then reopen Fontzie.",
    ],
    [
      "No frame with id 24 in tab 123.",
      "The page changed before Fontzie could finish. Try again on the current page.",
    ],
    [
      "Frame with ID 24 was removed.",
      "The page changed before Fontzie could finish. Try again on the current page.",
    ],
    [
      "Could not establish connection. Receiving end does not exist.",
      "Fontzie lost its connection to this page. Reload the website, then try again.",
    ],
    [
      "Extension context invalidated.",
      "Fontzie lost its connection to this page. Reload the website, then try again.",
    ],
    [
      "The message port closed before a response was received.",
      "Fontzie lost its connection to this page. Reload the website, then try again.",
    ],
    [
      'Cannot access contents of url "https://example.com/". Extension manifest must request permission.',
      "Fontzie cannot access this page. Open a regular website and click Fontzie’s toolbar icon to allow access.",
    ],
    [
      "Failed to execute 'querySelectorAll' on 'Document': 'h1[' is not a valid selector.",
      "This CSS selector isn’t valid. Check it and try again, or use Pick element.",
    ],
    [
      "QUOTA_BYTES quota exceeded",
      "There isn’t enough space to save this. Export a backup before removing unused presets or custom fonts, then try again.",
    ],
    [
      "Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.",
      "Fontzie couldn’t access its saved data. Reopen Fontzie and try again.",
    ],
    [
      "Failed to fetch",
      "The requested download failed. Check your connection, then try again.",
    ],
    [
      "The operation was aborted due to timeout",
      "This took too long. Check your connection, then try again.",
    ],
    [
      "AbortError: signal is aborted without reason",
      "The operation was interrupted. Try again.",
    ],
    [
      "NotAllowedError: User denied access",
      "Chrome didn’t allow this action. Check the requested permission, then try again.",
    ],
  ])("explains %s locally and after transport", (raw, readable) => {
    expect(errorMessage(new Error(raw))).toBe(readable);
    expect(errorMessage(raw)).toBe(readable);
  });

  it("handles native exceptions and hides unexpected implementation details", () => {
    const fallback = "Could not save this preset. Try again.";
    for (const error of [
      new TypeError("Unexpected implementation detail"),
      new Error("Cannot read properties of undefined (reading 'config')"),
      new Error("Unexpected token 'x', invalid JSON"),
      new Error("Unknown content command."),
      undefined,
      null,
      {},
      "",
    ])
      expect(errorMessage(error, fallback)).toBe(fallback);
    expect(
      errorMessage(new DOMException("Quota exceeded", "QuotaExceededError")),
    ).toContain("Export a backup");
    expect(
      errorMessage(new DOMException("Failed to fetch", "NetworkError")),
    ).toContain("Check your connection");
  });

  it("preserves actionable application errors and never displays objects", () => {
    for (const message of [
      "Name this preset first.",
      "The custom font file is missing. Import it again.",
      "Font access is blocked. Allow local fonts in Chrome's site settings, or add font files in Custom.",
      "This font does not provide that weight.",
    ]) {
      expect(errorMessage(new Error(message))).toBe(message);
      expect(errorMessage(`Error: ${message}`)).toBe(message);
    }
    expect(errorMessage({ error: "raw internals" })).not.toContain(
      "[object Object]",
    );
  });
});
