import { expect, it } from "vitest";
import { decodeBase64, encodeBase64 } from "../../core/bytes";

it("round trips every byte across encoding chunk boundaries", () => {
  const bytes = Uint8Array.from({ length: 65539 }, (_, index) => index % 256);
  expect(decodeBase64(encodeBase64(bytes.buffer))).toEqual(bytes);
  expect(decodeBase64(encodeBase64(new ArrayBuffer(0)))).toEqual(
    new Uint8Array(0),
  );
});
