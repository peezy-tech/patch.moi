import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { loadSources, parseFeedEntries, parseNpmPackageEntries, pollFeedsOnce, signalFromEntry } from "../src/feed";
import { dispatchWorkspaceEvent, patchDownstreamReleaseEvent, patchUpstreamReleaseEvent } from "../src/flow";
import type { FeedSourceConfig } from "../src/types";

const atom = `<?xml version="1.0"?>
<feed>
  <entry>
    <id>tag:github.com,2008:Grit::Commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</id>
    <link type="text/html" rel="alternate" href="https://github.com/openai/codex/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/>
    <title>Update main</title>
    <updated>2026-05-12T10:00:00Z</updated>
    <author><name>alice</name></author>
  </entry>
  <entry>
    <id>tag:github.com,2008:Grit::Commit/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb</id>
    <link type="text/html" rel="alternate" href="https://github.com/openai/codex/commit/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/>
    <title>Older update</title>
    <updated>2026-05-12T09:00:00Z</updated>
    <author><name>bob</name></author>
  </entry>
</feed>`;

const rss = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>v1.2.3</title>
    <link>https://codeberg.org/forgejo/forgejo/releases/tag/v1.2.3</link>
    <guid>release-123</guid>
    <author>release-team</author>
    <pubDate>Tue, 12 May 2026 10:00:00 +0000</pubDate>
  </item>
</channel></rss>`;

const githubReleaseAtom = `<?xml version="1.0"?>
<feed>
  <entry>
    <id>tag:github.com,2008:Repository/965415649/rust-v0.131.0</id>
    <link type="text/html" rel="alternate" href="https://github.com/openai/codex/releases/tag/rust-v0.131.0"/>
    <title>0.131.0</title>
    <updated>2026-05-18T18:05:43Z</updated>
    <author><name>github-actions</name></author>
  </entry>
</feed>`;

const npmPackage = JSON.stringify({
  name: "@peezy.tech/codex-flows",
  "dist-tags": {
    latest: "0.4.0",
  },
  time: {
    created: "2026-05-10T00:00:00.000Z",
    modified: "2026-05-17T00:00:00.000Z",
    "0.3.6": "2026-05-15T00:00:00.000Z",
    "0.4.0": "2026-05-17T00:00:00.000Z",
  },
});

const source: FeedSourceConfig = {
  id: "github-openai-codex-main",
  provider: "github",
  url: "https://github.com/openai/codex/commits/main.atom",
  event: "push",
  repo: {
    owner: "openai",
    name: "codex",
    fullName: "openai/codex",
    webUrl: "https://github.com/openai/codex",
    defaultBranch: "main",
  },
  target: {
    provider: "github",
    repoFullName: "peezy-tech/codex",
    branch: "main",
    mode: "notify_only",
  },
};

describe("feed watcher", () => {
  test("parses Atom and RSS feed entries", () => {
    expect(parseFeedEntries(atom)[0]).toMatchObject({
      title: "Update main",
      author: "alice",
      url: "https://github.com/openai/codex/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(parseFeedEntries(rss)[0]).toMatchObject({
      id: "release-123",
      title: "v1.2.3",
      author: "release-team",
    });
  });

  test("parses npm package releases newest first", () => {
    expect(parseNpmPackageEntries(npmPackage).map((entry) => entry.title)).toEqual(["0.4.0", "0.3.6"]);
    expect(parseNpmPackageEntries(npmPackage)[0]).toMatchObject({
      id: "npm:@peezy.tech/codex-flows:0.4.0",
      author: "npm",
      publishedAt: "2026-05-17T00:00:00.000Z",
    });
  });

  test("normalizes commit feed entries into push signals", () => {
    const signal = signalFromEntry(source, parseFeedEntries(atom)[0]);
    expect(signal).toMatchObject({
      sourceId: "github-openai-codex-main",
      provider: "github",
      event: "push",
      ref: "refs/heads/main",
      sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      repo: { fullName: "openai/codex" },
    });
  });

  test("normalizes GitHub release refs from release tag URLs", () => {
    const releaseSource: FeedSourceConfig = {
      ...source,
      id: "github-openai-codex-releases",
      url: "https://github.com/openai/codex/releases.atom",
      event: "release",
    };

    const signal = signalFromEntry(releaseSource, parseFeedEntries(githubReleaseAtom)[0]);
    expect(signal).toMatchObject({
      sourceId: "github-openai-codex-releases",
      provider: "github",
      event: "release",
      title: "0.131.0",
      ref: "rust-v0.131.0",
      repo: { fullName: "openai/codex" },
    });
  });

  test("bundled feed source config has no private operational defaults", async () => {
    const sources = await loadSources(join(import.meta.dir, "..", "feed-sources.json"));
    expect(sources).toEqual([]);
  });

  test("first poll primes state without emitting old entries", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-feed-"));
    const sourcesPath = join(dataDir, "sources.json");
    await writeFile(sourcesPath, JSON.stringify({ sources: [source] }), "utf8");

    await pollFeedsOnce({ dataDir, sourcesPath, discord: { enabled: true, webhookUrl: "https://discord.example/webhook", notifyEvents: new Set(["push"]) } }, async () => {
      return new Response(atom, { status: 200 });
    });

    const state = JSON.parse(await readFile(join(dataDir, "feed-state.json"), "utf8"));
    expect(state["github-openai-codex-main"].lastSeenId).toBe("tag:github.com,2008:Grit::Commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    await expect(readFile(join(dataDir, "feed-events.jsonl"), "utf8")).rejects.toThrow();
  });

  test("later polls emit new entries and release fork sync jobs", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-feed-"));
    const sourcesPath = join(dataDir, "sources.json");
    const releaseSource: FeedSourceConfig = {
      ...source,
      id: "github-openai-codex-releases",
      url: "https://github.com/openai/codex/releases.atom",
      event: "release",
      target: {
        provider: "github",
        repoFullName: "peezy-tech/codex",
        branch: "main",
        mode: "fork_sync",
      },
    };
    await writeFile(sourcesPath, JSON.stringify({ sources: [releaseSource] }), "utf8");
    await writeFile(join(dataDir, "feed-state.json"), JSON.stringify({
      "github-openai-codex-releases": {
        lastSeenId: "older-release",
        lastCheckedAt: "2026-05-12T09:00:00.000Z",
      },
    }), "utf8");

    let feedCalls = 0;
    await pollFeedsOnce({ dataDir, sourcesPath, discord: { enabled: false, notifyEvents: new Set(["release"]) } }, async () => {
      feedCalls += 1;
      return new Response(rss, { status: 200 });
    });

    expect(await readFile(join(dataDir, "feed-events.jsonl"), "utf8")).toContain("\"event\":\"release\"");
    expect(await readFile(join(dataDir, "feed-jobs.jsonl"), "utf8")).toContain("\"kind\":\"fork_sync\"");
    expect(feedCalls).toBe(1);
  });

  test("primeOnly false emits existing release entries on first poll", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-feed-"));
    const sourcesPath = join(dataDir, "sources.json");
    const releaseSource: FeedSourceConfig = {
      ...source,
      id: "github-openai-codex-releases",
      url: "https://github.com/openai/codex/releases.atom",
      event: "release",
      primeOnly: false,
      target: {
        mode: "workspace_flow",
        eventType: "upstream.release",
        workspaceUrlEnv: "WORKSPACE_URL",
        payload: {
          repo: "openai/codex",
          provider: "github",
        },
      },
    };
    await writeFile(sourcesPath, JSON.stringify({ sources: [releaseSource] }), "utf8");

    await pollFeedsOnce({
      dataDir,
      sourcesPath,
      discord: { enabled: false, notifyEvents: new Set(["release"]) },
      flowDispatch: {
        env: {
          WORKSPACE_URL: "https://workspace.example/events",
        },
        fetchImpl: async (_url, init) => {
          const eventId = JSON.parse(String(init.body ?? "{}")).id;
          return Response.json({ status: "accepted", eventId, runIds: [], matched: 1 }, { status: 202 });
        },
      },
    }, async () => {
      return new Response(githubReleaseAtom, { status: 200 });
    });

    const flowEventText = await readFile(join(dataDir, "flow-events.jsonl"), "utf8");
    const flowEvent = JSON.parse(flowEventText.trim()) as Record<string, any>;
    expect(flowEvent.id).toBe("patch:github-openai-codex-releases:tag:github.com,2008:Repository/965415649/rust-v0.131.0:upstream.release");
    expect(flowEvent.payload.tag).toBe("rust-v0.131.0");
    expect(flowEvent.payload.title).toBe("0.131.0");
    const state = JSON.parse(await readFile(join(dataDir, "feed-state.json"), "utf8"));
    expect(state["github-openai-codex-releases"].lastSeenId).toBe("tag:github.com,2008:Repository/965415649/rust-v0.131.0");
  });

  test("later polls dispatch generic flow events through the workspace backend adapter", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-feed-"));
    const sourcesPath = join(dataDir, "sources.json");
    const releaseSource: FeedSourceConfig = {
      ...source,
      id: "github-openai-codex-releases",
      url: "https://github.com/openai/codex/releases.atom",
      event: "release",
      target: {
        mode: "workspace_flow",
        eventType: "upstream.release",
        workspaceUrlEnv: "WORKSPACE_URL",
        workspaceSecretEnv: "WORKSPACE_SECRET",
        payload: {
          repo: "openai/codex",
          provider: "github",
        },
      },
    };
    await writeFile(sourcesPath, JSON.stringify({ sources: [releaseSource] }), "utf8");
    await writeFile(join(dataDir, "feed-state.json"), JSON.stringify({
      "github-openai-codex-releases": {
        lastSeenId: "older-release",
        lastCheckedAt: "2026-05-12T09:00:00.000Z",
      },
    }), "utf8");

    let dispatchedBody = "";
    let dispatchedSignature = "";
    await pollFeedsOnce({
      dataDir,
      sourcesPath,
      discord: { enabled: false, notifyEvents: new Set(["release"]) },
      flowDispatch: {
        env: {
          WORKSPACE_URL: "https://workspace.example/events",
          WORKSPACE_SECRET: "secret",
        },
        fetchImpl: async (_url, init) => {
          dispatchedBody = String(init.body);
          dispatchedSignature = headerValue(init.headers, "x-flow-signature-256");
          return Response.json({ status: "accepted", eventId: "event-1", runIds: [], matched: 0 }, { status: 202 });
        },
      },
    }, async () => {
      return new Response(rss, { status: 200 });
    });

    const flowEventText = await readFile(join(dataDir, "flow-events.jsonl"), "utf8");
    const flowEvent = JSON.parse(flowEventText.trim()) as Record<string, any>;
    expect(flowEvent.type).toBe("upstream.release");
    expect(flowEvent.source).toBe("patch");
    expect(flowEvent.payload.repo).toBe("openai/codex");
    expect(flowEvent.payload.tag).toBe("v1.2.3");
    expect(JSON.parse(dispatchedBody).id).toBe(flowEvent.id);
    expect(dispatchedSignature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(await readFile(join(dataDir, "workspace-dispatches.jsonl"), "utf8")).toContain("\"transport\":\"workspace-http\"");
    const attempt = JSON.parse((await readFile(join(dataDir, "maintenance-attempts.jsonl"), "utf8")).trim());
    expect(attempt).toMatchObject({
      eventId: flowEvent.id,
      eventType: "upstream.release",
      operation: "dispatch",
      status: "started",
      upstreamRepo: "openai/codex",
      upstreamTag: "v1.2.3",
      workspaceBackendUrl: "https://workspace.example",
      workspaceRunIds: [],
      candidateRefs: [],
    });
  });

  test("later main commit polls dispatch upstream branch update events", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-feed-"));
    const sourcesPath = join(dataDir, "sources.json");
    const branchSource: FeedSourceConfig = {
      ...source,
      target: {
        mode: "workspace_flow",
        eventType: "upstream.branch_update",
        workspaceUrlEnv: "WORKSPACE_URL",
        payload: {
          repo: "openai/codex",
          provider: "github",
          ref: "refs/heads/main",
        },
      },
    };
    await writeFile(sourcesPath, JSON.stringify({ sources: [branchSource] }), "utf8");
    await writeFile(join(dataDir, "feed-state.json"), JSON.stringify({
      "github-openai-codex-main": {
        lastSeenId: "tag:github.com,2008:Grit::Commit/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        lastCheckedAt: "2026-05-12T09:00:00.000Z",
      },
    }), "utf8");

    let dispatchedBody = "";
    await pollFeedsOnce({
      dataDir,
      sourcesPath,
      discord: { enabled: false, notifyEvents: new Set(["push"]) },
      flowDispatch: {
        env: {
          WORKSPACE_URL: "https://workspace.example/events",
        },
        fetchImpl: async (_url, init) => {
          dispatchedBody = String(init.body);
          const eventId = JSON.parse(String(init.body ?? "{}")).id;
          return Response.json({ status: "accepted", eventId, runIds: [], matched: 1 }, { status: 202 });
        },
      },
    }, async () => {
      return new Response(atom, { status: 200 });
    });

    const flowEventText = await readFile(join(dataDir, "flow-events.jsonl"), "utf8");
    const flowEvent = JSON.parse(flowEventText.trim()) as Record<string, any>;
    expect(flowEvent.type).toBe("upstream.branch_update");
    expect(flowEvent.payload.repo).toBe("openai/codex");
    expect(flowEvent.payload.ref).toBe("refs/heads/main");
    expect(flowEvent.payload.sha).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(JSON.parse(dispatchedBody).id).toBe(flowEvent.id);
    const attempt = JSON.parse((await readFile(join(dataDir, "maintenance-attempts.jsonl"), "utf8")).trim());
    expect(attempt).toMatchObject({
      eventType: "upstream.branch_update",
      status: "started",
      upstreamRepo: "openai/codex",
      upstreamRef: "refs/heads/main",
      upstreamSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });

  test("later npm release polls dispatch downstream release events", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-feed-"));
    const sourcesPath = join(dataDir, "sources.json");
    const releaseSource: FeedSourceConfig = {
      id: "npm-peezy-codex-flows-releases",
      provider: "npm",
      url: "https://registry.npmjs.org/@peezy.tech%2Fcodex-flows",
      event: "release",
      repo: {
        owner: "@peezy.tech",
        name: "codex-flows",
        fullName: "@peezy.tech/codex-flows",
        webUrl: "https://www.npmjs.com/package/@peezy.tech/codex-flows",
      },
      target: {
        mode: "workspace_flow",
        eventType: "downstream.release",
        workspaceUrlEnv: "WORKSPACE_URL",
        payload: {
          packageName: "@peezy.tech/codex-flows",
          repo: "peezy-tech/codex-flows",
        },
      },
    };
    await writeFile(sourcesPath, JSON.stringify({ sources: [releaseSource] }), "utf8");
    await writeFile(join(dataDir, "feed-state.json"), JSON.stringify({
      "npm-peezy-codex-flows-releases": {
        lastSeenId: "npm:@peezy.tech/codex-flows:0.3.6",
        lastCheckedAt: "2026-05-15T00:00:00.000Z",
      },
    }), "utf8");

    let dispatchedBody = "";
    await pollFeedsOnce({
      dataDir,
      sourcesPath,
      discord: { enabled: false, notifyEvents: new Set(["release"]) },
      flowDispatch: {
        env: {
          WORKSPACE_URL: "https://workspace.example/events",
        },
        fetchImpl: async (_url, init) => {
          dispatchedBody = String(init.body);
          const eventId = JSON.parse(String(init.body ?? "{}")).id;
          return Response.json({ status: "accepted", eventId, runIds: [], matched: 1 }, { status: 202 });
        },
      },
    }, async () => {
      return new Response(npmPackage, { status: 200 });
    });

    const flowEventText = await readFile(join(dataDir, "flow-events.jsonl"), "utf8");
    const flowEvent = JSON.parse(flowEventText.trim()) as Record<string, any>;
    expect(flowEvent.type).toBe("downstream.release");
    expect(flowEvent.payload.packageName).toBe("@peezy.tech/codex-flows");
    expect(flowEvent.payload.version).toBe("0.4.0");
    expect(flowEvent.payload.tag).toBe("0.4.0");
    expect(flowEvent.payload.repo).toBe("peezy-tech/codex-flows");
    expect(JSON.parse(dispatchedBody).id).toBe(flowEvent.id);
  });

  test("workspace dispatch uses default workspace backend env names", async () => {
    let dispatchedUrl = "";
    let dispatchedSignature = "";

    const record = await dispatchWorkspaceEvent({
      id: "patch:source:entry:upstream.release",
      type: "upstream.release",
      source: "patch",
      receivedAt: "2026-05-13T00:00:00.000Z",
      payload: { repo: "openai/codex", tag: "v1.2.3" },
    }, {}, {
      env: {
        PATCH_WORKSPACE_BACKEND_URL: "https://workspace.example",
        PATCH_WORKSPACE_BACKEND_SECRET: "secret",
      },
      fetchImpl: async (url, init) => {
        dispatchedUrl = url;
        dispatchedSignature = headerValue(init.headers, "x-flow-signature-256");
        return Response.json({ status: "accepted", eventId: "event-1", runIds: [], matched: 0 }, { status: 202 });
      },
    });

    expect(record.status).toBe("dispatched");
    expect(record).toMatchObject({ target: "workspace-backend", transport: "workspace-http" });
    expect(dispatchedUrl).toBe("https://workspace.example/events");
    expect(dispatchedSignature).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  test("workspace dispatch accepts legacy Patch dispatch URL env name", async () => {
    let dispatchedUrl = "";

    const record = await dispatchWorkspaceEvent({
      id: "patch:source:entry:upstream.release",
      type: "upstream.release",
      source: "patch",
      receivedAt: "2026-05-13T00:00:00.000Z",
      payload: { repo: "openai/codex", tag: "v1.2.3" },
    }, {}, {
      env: {
        PATCH_FLOW_DISPATCH_URL: "https://flow.example/events",
      },
      fetchImpl: async (url) => {
        dispatchedUrl = url;
        return Response.json({ status: "accepted", eventId: "event-1", runIds: [], matched: 0 }, { status: 202 });
      },
    });

    expect(record.status).toBe("dispatched");
    expect(dispatchedUrl).toBe("https://flow.example/events");
  });

  test("workspace dispatch accepts legacy Patch backend URL env name", async () => {
    let dispatchedUrl = "";

    const record = await dispatchWorkspaceEvent({
      id: "patch:source:entry:upstream.release",
      type: "upstream.release",
      source: "patch",
      receivedAt: "2026-05-13T00:00:00.000Z",
      payload: { repo: "openai/codex", tag: "v1.2.3" },
    }, {}, {
      env: {
        PATCH_FLOW_BACKEND_URL: "https://flow.example",
      },
      fetchImpl: async (url) => {
        dispatchedUrl = url;
        return Response.json({ status: "accepted", eventId: "event-1", runIds: [], matched: 0 }, { status: 202 });
      },
    });

    expect(record.status).toBe("dispatched");
    expect(dispatchedUrl).toBe("https://flow.example/events");
  });

  test("workspace dispatch can use the workspace backend websocket flow method", async () => {
    const methods: string[] = [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request, bunServer) {
        if (bunServer.upgrade(request)) {
          return undefined;
        }
        return new Response("upgrade required", { status: 426 });
      },
      websocket: {
        message(socket, message) {
          const request = JSON.parse(String(message)) as {
            id: number;
            method: string;
            params?: { capabilities?: { appServerPassThrough?: boolean }; event?: { id?: string } };
          };
          methods.push(request.method);
          if (request.method === "workspace.initialize") {
            expect(request.params?.capabilities?.appServerPassThrough).toBe(true);
            socket.send(JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result: {
                ok: true,
                serverInfo: { name: "test", version: "0.0.0" },
                capabilities: { appServerPassThrough: true, workspaceMethods: ["flow.dispatch"], flowInspection: true },
              },
            }));
            return;
          }
          socket.send(JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: {
              status: "accepted",
              eventId: request.params?.event?.id,
              runIds: ["run-1"],
              matched: 1,
            },
          }));
        },
      },
    });

    try {
      const record = await dispatchWorkspaceEvent({
        id: "patch:source:entry:upstream.release",
        type: "upstream.release",
        source: "patch",
        receivedAt: "2026-05-13T00:00:00.000Z",
        payload: { repo: "openai/codex", tag: "v1.2.3" },
      }, {}, {
        env: {
          PATCH_WORKSPACE_BACKEND_URL: `ws://127.0.0.1:${server.port}`,
        },
      });

      expect(methods).toEqual(["workspace.initialize", "flow.dispatch"]);
      expect(record).toMatchObject({
        status: "dispatched",
        transport: "workspace-ws",
        runIds: ["run-1"],
        matched: 1,
      });
    } finally {
      server.stop(true);
    }
  });

  test("workspace dispatch records backend HTTP failures", async () => {
    const record = await dispatchWorkspaceEvent({
      id: "patch:source:entry:upstream.release",
      type: "upstream.release",
      source: "patch",
      receivedAt: "2026-05-13T00:00:00.000Z",
      payload: { repo: "openai/codex", tag: "v1.2.3" },
    }, {}, {
      env: {
        PATCH_FLOW_DISPATCH_URL: "https://flow.example/events",
      },
      fetchImpl: async () => Response.json({ error: "bad" }, { status: 500 }),
    });

    expect(record).toMatchObject({
      eventId: "patch:source:entry:upstream.release",
      status: "failed",
      httpStatus: 500,
    });
  });

  test("workspace dispatch uses local mode when no backend URL is configured", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-flow-local-"));
    await writeDemoFlow(dataDir);

    const record = await dispatchWorkspaceEvent({
      id: "patch:local:demo",
      type: "demo.event",
      source: "patch",
      receivedAt: "2026-05-15T00:00:00.000Z",
      payload: { name: "Ada" },
    }, {}, {
      cwd: dataDir,
      env: {},
    });

    expect(record).toMatchObject({
      eventId: "patch:local:demo",
      eventType: "demo.event",
      status: "dispatched",
      target: "local",
      transport: "local",
    });
    expect(record.url).toBeUndefined();
    expect(JSON.parse(await readFile(join(dataDir, "local-flow-output.json"), "utf8"))).toEqual({
      name: "Ada",
    });
  });

  test("workspace dispatch uses actions-local mode without a running backend", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-flow-actions-"));
    await writeDemoFlow(dataDir);

    const record = await dispatchWorkspaceEvent({
      id: "patch:actions:demo",
      type: "demo.event",
      source: "patch",
      receivedAt: "2026-05-15T00:00:00.000Z",
      payload: { name: "Grace" },
    }, {}, {
      cwd: dataDir,
      env: {
        CODEX_WORKSPACE_MODE: "actions",
      },
    });

    expect(record).toMatchObject({
      eventId: "patch:actions:demo",
      eventType: "demo.event",
      status: "dispatched",
      target: "local",
      transport: "actions-local",
    });
    expect(JSON.parse(await readFile(join(dataDir, "local-flow-output.json"), "utf8"))).toEqual({
      name: "Grace",
    });

    const state = JSON.parse(
      await readFile(join(dataDir, ".codex/workspace/actions/flow-client/state.json"), "utf8"),
    ) as { events: Array<{ event: { id: string } }>; runs: Array<{ id: string }> };
    expect(state.events.map((entry) => entry.event.id)).toContain("patch:actions:demo");
    expect(state.runs.map((entry) => entry.id)).toEqual(record.runIds ?? []);
  });

  test("Patch upstream release helper creates deterministic product events", () => {
    expect(patchUpstreamReleaseEvent({
      repo: "openai/codex",
      tag: "rust-v1.2.3",
      receivedAt: "2026-05-15T00:00:00.000Z",
    })).toEqual({
      id: "patch:upstream.release:openai/codex:rust-v1.2.3",
      type: "upstream.release",
      source: "patch",
      receivedAt: "2026-05-15T00:00:00.000Z",
      payload: {
        repo: "openai/codex",
        tag: "rust-v1.2.3",
      },
    });
  });

  test("Patch downstream release helper creates deterministic product events", () => {
    expect(patchDownstreamReleaseEvent({
      packageName: "@peezy.tech/codex-flows",
      version: "0.4.0",
      repo: "peezy-tech/codex-flows",
      receivedAt: "2026-05-17T00:00:00.000Z",
    })).toEqual({
      id: "patch:downstream.release:@peezy.tech/codex-flows:0.4.0",
      type: "downstream.release",
      source: "patch",
      receivedAt: "2026-05-17T00:00:00.000Z",
      payload: {
        packageName: "@peezy.tech/codex-flows",
        version: "0.4.0",
        tag: "0.4.0",
        repo: "peezy-tech/codex-flows",
      },
    });
  });
});

function headerValue(headers: HeadersInit | undefined, name: string): string {
  return new Headers(headers).get(name) ?? "";
}

async function writeDemoFlow(root: string): Promise<void> {
  const flowRoot = join(root, "flows/demo");
  await mkdir(join(flowRoot, "exec"), { recursive: true });
  await mkdir(join(flowRoot, "schemas"), { recursive: true });
  await writeFile(
    join(flowRoot, "flow.toml"),
    [
      'name = "demo"',
      "version = 1",
      'description = "demo"',
      "",
      "[[steps]]",
      'name = "hello"',
      'runner = "bun"',
      'script = "exec/hello.ts"',
      "timeout_ms = 30000",
      "",
      "[steps.trigger]",
      'type = "demo.event"',
      'schema = "schemas/demo-event.schema.json"',
      "",
    ].join("\n"),
  );
  await writeFile(
    join(flowRoot, "schemas/demo-event.schema.json"),
    JSON.stringify({
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
      },
    }),
  );
  await writeFile(
    join(flowRoot, "exec/hello.ts"),
    [
      'import { writeFileSync } from "node:fs";',
      "const context = JSON.parse(await Bun.stdin.text());",
      'writeFileSync("../../local-flow-output.json", JSON.stringify({ name: context.flow.event.payload.name }));',
      'console.log(`FLOW_RESULT ${JSON.stringify({ status: "completed" })}`);',
      "",
    ].join("\n"),
  );
}
