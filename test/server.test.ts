import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { createHandler } from "../src/server";
import { hmacSha256Hex } from "../src/signatures";

async function signedRequest(path: string, provider: "github" | "jojo", secret: string, body: unknown): Promise<Request> {
  const raw = JSON.stringify(body);
  const digest = await hmacSha256Hex(secret, raw);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider === "github") {
    headers["x-hub-signature-256"] = `sha256=${digest}`;
    headers["x-github-event"] = "push";
    headers["x-github-delivery"] = "github-delivery";
  } else {
    headers["x-forgejo-signature-256"] = `sha256=${digest}`;
    headers["x-forgejo-event"] = "push";
    headers["x-forgejo-delivery"] = "jojo-delivery";
  }
  return new Request(`http://localhost${path}`, { method: "POST", headers, body: raw });
}

describe("server", () => {
  test("healthz returns ok", async () => {
    const handler = createHandler({ githubSecret: "gh", jojoSecret: "jojo", dataDir: await mkdtemp(join(tmpdir(), "patchbay-")) });
    const response = await handler(new Request("http://localhost/healthz"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok\n");
  });

  test("rejects invalid signatures", async () => {
    const handler = createHandler({ githubSecret: "gh", jojoSecret: "jojo", dataDir: await mkdtemp(join(tmpdir(), "patchbay-")) });
    const response = await handler(new Request("http://localhost/patchbay/github", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=bad" },
      body: "{}",
    }));
    expect(response.status).toBe(401);
  });

  test("accepts jojo main pushes and queues a job", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patchbay-"));
    const handler = createHandler({ githubSecret: "gh", jojoSecret: "jojo", dataDir });
    const request = await signedRequest("/patchbay/jojo", "jojo", "jojo", {
      ref: "refs/heads/main",
      after: "abc123",
      repository: {
        name: "patchbay",
        full_name: "peezy-tech/patchbay",
        owner: { username: "peezy-tech" },
      },
    });

    const response = await handler(request);
    expect(response.status).toBe(202);
    expect(await readFile(join(dataDir, "events.jsonl"), "utf8")).toContain("\"provider\":\"jojo\"");
    expect(await readFile(join(dataDir, "jobs.jsonl"), "utf8")).toContain("\"kind\":\"main_push\"");
  });

  test("keeps legacy git-webhooks routes as aliases", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patchbay-"));
    const handler = createHandler({ githubSecret: "gh", jojoSecret: "jojo", dataDir });
    const request = await signedRequest("/git-webhooks/jojo", "jojo", "jojo", {
      ref: "refs/heads/main",
      after: "abc123",
      repository: {
        name: "patchbay",
        full_name: "peezy-tech/patchbay",
        owner: { username: "peezy-tech" },
      },
    });

    const response = await handler(request);
    expect(response.status).toBe(202);
    expect(await readFile(join(dataDir, "events.jsonl"), "utf8")).toContain("\"provider\":\"jojo\"");
  });

  test("continues accepting webhooks when Discord returns an error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("bad", { status: 500 })) as unknown as typeof fetch;

    try {
      const dataDir = await mkdtemp(join(tmpdir(), "patchbay-"));
      const handler = createHandler({
        githubSecret: "gh",
        jojoSecret: "jojo",
        dataDir,
        discord: {
          webhookUrl: "https://discord.example/webhook",
          notifyEvents: new Set(["push"]),
        },
      });
      const request = await signedRequest("/patchbay/jojo", "jojo", "jojo", {
        ref: "refs/heads/main",
        after: "abc123",
        repository: {
          name: "patchbay",
          full_name: "peezy-tech/patchbay",
          owner: { username: "peezy-tech" },
        },
      });

      const response = await handler(request);
      expect(response.status).toBe(202);
      expect(await readFile(join(dataDir, "events.jsonl"), "utf8")).toContain("\"provider\":\"jojo\"");
      expect(await readFile(join(dataDir, "jobs.jsonl"), "utf8")).toContain("\"kind\":\"main_push\"");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
