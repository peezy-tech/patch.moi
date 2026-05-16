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
    const originalWorkspaceUrl = process.env.PATCH_WORKSPACE_BACKEND_URL;
    const originalWorkspaceSecret = process.env.PATCH_WORKSPACE_BACKEND_SECRET;
    const originalBackendUrl = process.env.PATCH_FLOW_BACKEND_URL;
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
    await store.appendWorkspaceDispatch({
      eventId: event.id,
      eventType: event.type,
      status: "failed",
      error: "network",
      createdAt: "2026-05-13T00:00:01.000Z",
    });

    const calls: Array<{ url: string; body: string; headers: Headers }> = [];
    process.env.PATCH_WORKSPACE_BACKEND_URL = "http://172.20.0.1:3586/events";
    process.env.PATCH_WORKSPACE_BACKEND_SECRET = "secret";
    delete process.env.PATCH_FLOW_BACKEND_URL;
    delete process.env.PATCH_FLOW_DISPATCH_URL;
    delete process.env.PATCH_FLOW_DISPATCH_SECRET;
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

      const dispatches = await handler(new Request("http://localhost/workspace-dispatches?status=failed", {
        headers: { "x-patch-admin-token": "admin" },
      }));
      expect(dispatches.status).toBe(200);
      expect(await dispatches.json()).toMatchObject({ dispatches: [{ status: "failed", eventId: event.id }] });

      const retry = await handler(new Request(`http://localhost/flow-events/${encodeURIComponent(event.id)}/retry`, {
        method: "POST",
        headers: { authorization: "Bearer admin" },
      }));
      expect(retry.status).toBe(202);
      expect(calls.at(-1)?.url).toBe("http://172.20.0.1:3586/events");
      expect(JSON.parse(calls.at(-1)?.body ?? "{}")).toMatchObject({ id: event.id });
      expect(calls.at(-1)?.headers.get("x-flow-signature-256")).toMatch(/^sha256=[0-9a-f]{64}$/);

      const replay = await handler(new Request(`http://localhost/flow-events/${encodeURIComponent(event.id)}/replay`, {
        method: "POST",
        headers: { authorization: "Bearer admin" },
      }));
      expect(replay.status).toBe(202);
      expect(calls.at(-1)?.url).toBe(`http://172.20.0.1:3586/events/${encodeURIComponent(event.id)}/replay`);
      expect(JSON.parse(calls.at(-1)?.body ?? "{}")).toEqual({ wait: false });

      const attempts = await handler(new Request(`http://localhost/maintenance-attempts?eventId=${encodeURIComponent(event.id)}`, {
        headers: { authorization: "Bearer admin" },
      }));
      expect(attempts.status).toBe(200);
      expect(await attempts.json()).toMatchObject({
        attempts: [
          { eventId: event.id, operation: "replay", status: "started", upstreamRepo: "openai/codex" },
          { eventId: event.id, operation: "dispatch", status: "started", upstreamRepo: "openai/codex" },
        ],
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWorkspaceUrl === undefined) {
        delete process.env.PATCH_WORKSPACE_BACKEND_URL;
      } else {
        process.env.PATCH_WORKSPACE_BACKEND_URL = originalWorkspaceUrl;
      }
      if (originalWorkspaceSecret === undefined) {
        delete process.env.PATCH_WORKSPACE_BACKEND_SECRET;
      } else {
        process.env.PATCH_WORKSPACE_BACKEND_SECRET = originalWorkspaceSecret;
      }
      if (originalBackendUrl === undefined) {
        delete process.env.PATCH_FLOW_BACKEND_URL;
      } else {
        process.env.PATCH_FLOW_BACKEND_URL = originalBackendUrl;
      }
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

  test("inspects workspace backend runs and events behind admin auth", async () => {
    const originalFetch = globalThis.fetch;
    const originalWorkspaceUrl = process.env.PATCH_WORKSPACE_BACKEND_URL;
    const calls: Array<{ url: string; method?: string }> = [];
    process.env.PATCH_WORKSPACE_BACKEND_URL = "http://127.0.0.1:3586";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      if (String(url).includes("/runs/run-1")) {
        return Response.json({ run: { id: "run-1", eventId: "event-1", status: "completed" } });
      }
      if (String(url).includes("/events/event-1")) {
        return Response.json({ event: { id: "event-1", type: "upstream.release", runIds: ["run-1"] }, runs: [] });
      }
      if (String(url).includes("/events")) {
        return Response.json({ events: [{ id: "event-1", type: "upstream.release", runIds: ["run-1"] }] });
      }
      return Response.json({ runs: [{ id: "run-1", eventId: "event-1", status: "completed" }] });
    }) as unknown as typeof fetch;

    try {
      const handler = createHandler({
        dataDir: await mkdtemp(join(tmpdir(), "patch-")),
        adminToken: "admin",
      });

      const unauthorized = await handler(new Request("http://localhost/workspace-runs"));
      expect(unauthorized.status).toBe(401);

      const runs = await handler(new Request("http://localhost/workspace-runs?eventId=event-1", {
        headers: { authorization: "Bearer admin" },
      }));
      expect(runs.status).toBe(200);
      expect(await runs.json()).toMatchObject({ runs: [{ id: "run-1", eventId: "event-1" }] });

      const run = await handler(new Request("http://localhost/workspace-runs/run-1", {
        headers: { authorization: "Bearer admin" },
      }));
      expect(run.status).toBe(200);
      expect(await run.json()).toMatchObject({ run: { id: "run-1", eventId: "event-1" } });

      const event = await handler(new Request("http://localhost/workspace-events/event-1", {
        headers: { authorization: "Bearer admin" },
      }));
      expect(event.status).toBe(200);
      expect(await event.json()).toMatchObject({ event: { id: "event-1", type: "upstream.release" } });

      expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
        "/runs",
        "/runs/run-1",
        "/events/event-1",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWorkspaceUrl === undefined) {
        delete process.env.PATCH_WORKSPACE_BACKEND_URL;
      } else {
        process.env.PATCH_WORKSPACE_BACKEND_URL = originalWorkspaceUrl;
      }
    }
  });

  test("syncs maintenance attempt outcomes from workspace run results", async () => {
    const originalFetch = globalThis.fetch;
    const originalWorkspaceUrl = process.env.PATCH_WORKSPACE_BACKEND_URL;
    const dataDir = await mkdtemp(join(tmpdir(), "patch-"));
    const store = new EventStore(dataDir);
    const attempt = {
      id: "patch:source:entry:upstream.release:dispatch:2026-05-13T00:00:01.000Z",
      eventId: "patch:source:entry:upstream.release",
      eventType: "upstream.release",
      operation: "dispatch" as const,
      status: "started" as const,
      upstreamRepo: "openai/codex",
      upstreamTag: "v1.2.3",
      workspaceBackendUrl: "http://127.0.0.1:3586",
      workspaceRunIds: ["run-1"],
      candidateRefs: [],
      createdAt: "2026-05-13T00:00:01.000Z",
      updatedAt: "2026-05-13T00:00:01.000Z",
    };
    await store.appendMaintenanceAttempt(attempt);

    process.env.PATCH_WORKSPACE_BACKEND_URL = "http://127.0.0.1:3586";
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes("/runs/run-1")) {
        return Response.json({
          run: {
            id: "run-1",
            eventId: attempt.eventId,
            status: "completed",
            completedAt: "2026-05-13T00:00:05.000Z",
            resultJson: JSON.stringify({
              status: "changed",
              message: "candidate branch ready",
              artifacts: {
                candidateRefs: [{
                  kind: "branch",
                  repo: "matamune-peezy/patch-moi-harness",
                  remote: "origin",
                  ref: "refs/heads/main",
                  sha: "abc123",
                  pushed: true,
                }],
              },
            }),
          },
        });
      }
      return Response.json({ error: "not found" }, { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const handler = createHandler({
        dataDir,
        adminToken: "admin",
      });
      const sync = await handler(new Request(
        `http://localhost/maintenance-attempts/${encodeURIComponent(attempt.id)}/sync`,
        {
          method: "POST",
          headers: { authorization: "Bearer admin" },
        },
      ));
      expect(sync.status).toBe(202);
      expect(await sync.json()).toMatchObject({
        attempt: {
          id: attempt.id,
          status: "changed",
          message: "candidate branch ready",
          workspaceRunStatuses: { "run-1": "changed" },
          candidateRefs: [{
            kind: "branch",
            repo: "matamune-peezy/patch-moi-harness",
            remote: "origin",
            ref: "refs/heads/main",
            sha: "abc123",
            pushed: true,
          }],
        },
      });

      const changed = await handler(new Request("http://localhost/maintenance-attempts?status=changed", {
        headers: { authorization: "Bearer admin" },
      }));
      expect(changed.status).toBe(200);
      expect(await changed.json()).toMatchObject({
        attempts: [{ id: attempt.id, status: "changed" }],
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWorkspaceUrl === undefined) {
        delete process.env.PATCH_WORKSPACE_BACKEND_URL;
      } else {
        process.env.PATCH_WORKSPACE_BACKEND_URL = originalWorkspaceUrl;
      }
    }
  });
});
