import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { EventStore } from "../src/queue";
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
    const handler = createHandler({ githubSecret: "gh", jojoSecret: "jojo", dataDir: await mkdtemp(join(tmpdir(), "patch-")) });
    const response = await handler(new Request("http://localhost/healthz"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok\n");
  });

  test("rejects invalid signatures", async () => {
    const handler = createHandler({ githubSecret: "gh", jojoSecret: "jojo", dataDir: await mkdtemp(join(tmpdir(), "patch-")) });
    const response = await handler(new Request("http://localhost/github", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=bad" },
      body: "{}",
    }));
    expect(response.status).toBe(401);
  });

  test("does not serve old path-prefixed routes", async () => {
    const handler = createHandler({ githubSecret: "gh", jojoSecret: "jojo", dataDir: await mkdtemp(join(tmpdir(), "patch-")) });
    const prefixedJojo = await handler(new Request("http://localhost/prefix/jojo", { method: "POST", body: "{}" }));
    const prefixedGithub = await handler(new Request("http://localhost/prefix/github", { method: "POST", body: "{}" }));
    expect(prefixedJojo.status).toBe(404);
    expect(prefixedGithub.status).toBe(404);
  });

  test("accepts jojo main pushes and queues a job", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-"));
    const handler = createHandler({ githubSecret: "gh", jojoSecret: "jojo", dataDir });
    const request = await signedRequest("/jojo", "jojo", "jojo", {
      ref: "refs/heads/main",
      after: "abc123",
      repository: {
        name: "patch.moi",
        full_name: "peezy-tech/patch.moi",
        owner: { username: "peezy-tech" },
      },
    });

    const response = await handler(request);
    expect(response.status).toBe(202);
    expect(await readFile(join(dataDir, "events.jsonl"), "utf8")).toContain("\"provider\":\"jojo\"");
    expect(await readFile(join(dataDir, "jobs.jsonl"), "utf8")).toContain("\"kind\":\"main_push\"");
  });

  test("continues accepting webhooks when Discord returns an error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("bad", { status: 500 })) as unknown as typeof fetch;

    try {
      const dataDir = await mkdtemp(join(tmpdir(), "patch-"));
      const handler = createHandler({
        githubSecret: "gh",
        jojoSecret: "jojo",
        dataDir,
        discord: {
          enabled: true,
          webhookUrl: "https://discord.example/webhook",
          notifyEvents: new Set(["push"]),
        },
      });
      const request = await signedRequest("/jojo", "jojo", "jojo", {
        ref: "refs/heads/main",
        after: "abc123",
        repository: {
          name: "patch.moi",
          full_name: "peezy-tech/patch.moi",
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

  test("lists, retries, and replays stored flow events behind admin auth", async () => {
    const originalFetch = globalThis.fetch;
    const originalDispatchUrl = process.env.PATCH_FLOW_DISPATCH_URL;
    const dataDir = await mkdtemp(join(tmpdir(), "patch-"));
    const store = new EventStore(dataDir);
    const event = {
      id: "patch:source:entry:upstream.release",
      type: "upstream.release",
      source: "patch",
      receivedAt: "2026-05-13T00:00:00.000Z",
      payload: { repo: "openai/codex", tag: "v1.2.3" },
    };
    await store.appendFlowEvent(event);
    await store.appendFlowDispatch({
      eventId: event.id,
      eventType: event.type,
      status: "failed",
      error: "network",
      createdAt: "2026-05-13T00:00:01.000Z",
    });

    const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    process.env.PATCH_FLOW_DISPATCH_URL = "http://172.20.0.1:7345/events";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: init?.headers as Record<string, string>,
      });
      return new Response("accepted", { status: 202 });
    }) as unknown as typeof fetch;

    try {
      const handler = createHandler({
        githubSecret: "gh",
        jojoSecret: "jojo",
        dataDir,
        adminToken: "admin",
      });

      const unauthorized = await handler(new Request("http://localhost/flow-events"));
      expect(unauthorized.status).toBe(401);

      const list = await handler(new Request("http://localhost/flow-events", {
        headers: { authorization: "Bearer admin" },
      }));
      expect(list.status).toBe(200);
      expect(await list.json()).toMatchObject({ events: [{ id: event.id, type: event.type }] });

      const dispatches = await handler(new Request("http://localhost/flow-dispatches?status=failed", {
        headers: { "x-patch-admin-token": "admin" },
      }));
      expect(dispatches.status).toBe(200);
      expect(await dispatches.json()).toMatchObject({ dispatches: [{ status: "failed", eventId: event.id }] });

      const retry = await handler(new Request(`http://localhost/flow-events/${encodeURIComponent(event.id)}/retry`, {
        method: "POST",
        headers: { authorization: "Bearer admin" },
      }));
      expect(retry.status).toBe(202);
      expect(calls.at(-1)?.url).toBe("http://172.20.0.1:7345/events");
      expect(JSON.parse(calls.at(-1)?.body ?? "{}")).toMatchObject({ id: event.id });
      expect(calls.at(-1)?.headers["x-flow-delivery"]).toBe(event.id);

      const replay = await handler(new Request(`http://localhost/flow-events/${encodeURIComponent(event.id)}/replay`, {
        method: "POST",
        headers: { authorization: "Bearer admin" },
      }));
      expect(replay.status).toBe(202);
      expect(calls.at(-1)?.url).toBe(`http://172.20.0.1:7345/events/${encodeURIComponent(event.id)}/replay`);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalDispatchUrl === undefined) {
        delete process.env.PATCH_FLOW_DISPATCH_URL;
      } else {
        process.env.PATCH_FLOW_DISPATCH_URL = originalDispatchUrl;
      }
    }
  });
});
