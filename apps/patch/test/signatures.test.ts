import { describe, expect, test } from "bun:test";
import { hmacSha256Hex } from "../src/signatures";

describe("workspace signatures", () => {
  test("builds HMAC-SHA256 digests for workspace HTTP signing", async () => {
    expect(await hmacSha256Hex("secret", "payload")).toBe(
      "b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4",
    );
  });
});
