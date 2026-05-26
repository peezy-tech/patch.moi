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

  test("lists stored automation events behind admin auth", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-"));
    const store = new EventStore(dataDir);
    const event = {
      id: "patch:source:entry:upstream.release",
      type: "upstream.release",
      source: "patch",
      receivedAt: "2026-05-13T00:00:00.000Z",
      automations: ["peezy-codex-fork"],
      payload: { repo: "openai/codex", tag: "v1.2.3" },
    };
    await store.appendAutomationEvent(event);
    await store.appendWorkspaceDispatch({
      eventId: event.id,
      eventType: event.type,
      status: "failed",
      error: "network",
      createdAt: "2026-05-13T00:00:01.000Z",
    });

    const handler = createHandler({
      dataDir,
      adminToken: "admin",
    });

    const unauthorized = await handler(new Request("http://localhost/automation-events"));
    expect(unauthorized.status).toBe(401);

    const list = await handler(new Request("http://localhost/automation-events", {
      headers: { authorization: "Bearer admin" },
    }));
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ events: [{ id: event.id, type: event.type }] });

    const dispatches = await handler(new Request("http://localhost/workspace-dispatches?status=failed", {
      headers: { "x-patch-admin-token": "admin" },
    }));
    expect(dispatches.status).toBe(200);
    expect(await dispatches.json()).toMatchObject({ dispatches: [{ status: "failed", eventId: event.id }] });
  });
});
