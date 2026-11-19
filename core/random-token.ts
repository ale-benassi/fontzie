// Page scripts also run on HTTP, where randomUUID is unavailable.
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
