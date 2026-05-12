import { timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();

function timingSafeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Buffer.from(signature).toString("hex");
}

export async function verifyGithubSignature(
  secret: string,
  body: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!secret || !signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const expected = await hmacSha256Hex(secret, body);
  const actual = signatureHeader.slice("sha256=".length).toLowerCase();
  return /^[0-9a-f]{64}$/.test(actual) && timingSafeEqualHex(actual, expected);
}

export async function verifyJojoSignature(
  secret: string,
  body: string,
  headers: Headers,
): Promise<boolean> {
  if (!secret) {
    return false;
  }

  const candidates = [
    headers.get("x-forgejo-signature-256"),
    headers.get("x-forgejo-signature"),
    headers.get("x-gitea-signature-256"),
    headers.get("x-gitea-signature"),
  ].filter((value): value is string => Boolean(value));

  const expected = await hmacSha256Hex(secret, body);
  return candidates.some((candidate) => {
    const actual = candidate.startsWith("sha256=")
      ? candidate.slice("sha256=".length).toLowerCase()
      : candidate.toLowerCase();
    return /^[0-9a-f]{64}$/.test(actual) && timingSafeEqualHex(actual, expected);
  });
}
