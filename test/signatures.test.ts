import { describe, expect, test } from "bun:test";
import { hmacSha256Hex, verifyGithubSignature, verifyJojoSignature } from "../src/signatures";

describe("webhook signatures", () => {
  test("verifies GitHub sha256 signatures", async () => {
    const body = JSON.stringify({ ok: true });
    const digest = await hmacSha256Hex("secret", body);

    expect(await verifyGithubSignature("secret", body, `sha256=${digest}`)).toBe(true);
    expect(await verifyGithubSignature("wrong", body, `sha256=${digest}`)).toBe(false);
  });

  test("verifies jojo Forgejo/Gitea signature headers", async () => {
    const body = JSON.stringify({ ok: true });
    const digest = await hmacSha256Hex("secret", body);
    const headers = new Headers({ "x-forgejo-signature-256": `sha256=${digest}` });

    expect(await verifyJojoSignature("secret", body, headers)).toBe(true);
    expect(await verifyJojoSignature("wrong", body, headers)).toBe(false);
  });
});
