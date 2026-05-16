import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { EventStore } from "../src/queue";
import { createHandler } from "../src/server";

describe("server", () => {
  test("healthz returns ok", async () => {
    const handler = createHandler({ dataDir: await mkdtemp(join(tmpdir(), "patch-")) });
    const response = await handler(new Request("http://localhost/healthz"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok\n");
  });

  test("does not serve provider intake routes", async () => {
    const handler = createHandler({ dataDir: await mkdtemp(join(tmpdir(), "patch-")) });
    const github = await handler(new Request("http://localhost/github", { method: "POST", body: "{}" }));
    const jojo = await handler(new Request("http://localhost/jojo", { method: "POST", body: "{}" }));
    const prefixedJojo = await handler(new Request("http://localhost/prefix/jojo", { method: "POST", body: "{}" }));
    const prefixedGithub = await handler(new Request("http://localhost/prefix/github", { method: "POST", body: "{}" }));
    expect(github.status).toBe(404);
    expect(jojo.status).toBe(404);
    expect(prefixedJojo.status).toBe(404);
    expect(prefixedGithub.status).toBe(404);
  });

  test("lists, retries, and replays stored flow events behind admin auth", async () => {
    const originalFetch = globalThis.fetch;
    const originalDispatchUrl = process.env.PATCH_FLOW_DISPATCH_URL;
    const originalDispatchSecret = process.env.PATCH_FLOW_DISPATCH_SECRET;
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

    const calls: Array<{ url: string; body: string; headers: Headers }> = [];
    process.env.PATCH_FLOW_DISPATCH_URL = "http://172.20.0.1:7345/events";
    process.env.PATCH_FLOW_DISPATCH_SECRET = "secret";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: new Headers(init?.headers),
      });
      return Response.json({ status: "accepted", eventId: event.id, runIds: [], matched: 0 }, { status: 202 });
    }) as unknown as typeof fetch;

    try {
      const handler = createHandler({
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
      expect(calls.at(-1)?.headers.get("x-flow-signature-256")).toMatch(/^sha256=[0-9a-f]{64}$/);

      const replay = await handler(new Request(`http://localhost/flow-events/${encodeURIComponent(event.id)}/replay`, {
        method: "POST",
        headers: { authorization: "Bearer admin" },
      }));
      expect(replay.status).toBe(202);
      expect(calls.at(-1)?.url).toBe(`http://172.20.0.1:7345/events/${encodeURIComponent(event.id)}/replay`);
      expect(JSON.parse(calls.at(-1)?.body ?? "{}")).toEqual({ wait: false });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalDispatchUrl === undefined) {
        delete process.env.PATCH_FLOW_DISPATCH_URL;
      } else {
        process.env.PATCH_FLOW_DISPATCH_URL = originalDispatchUrl;
      }
      if (originalDispatchSecret === undefined) {
        delete process.env.PATCH_FLOW_DISPATCH_SECRET;
      } else {
        process.env.PATCH_FLOW_DISPATCH_SECRET = originalDispatchSecret;
      }
    }
  });
});
