import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { loadSources, parseFeedEntries, pollFeedsOnce, signalFromEntry } from "../src/feed";
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

  test("loads configured feed sources", async () => {
    const sources = await loadSources(join(import.meta.dir, "..", "feed-sources.json"));
    expect(sources.map((item) => item.id)).toEqual([
      "codeberg-forgejo-branch",
      "codeberg-forgejo-releases",
      "github-openai-codex-main",
      "github-openai-codex-releases",
    ]);
  });

  test("first poll primes state without emitting old entries", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patchbay-feed-"));
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
    const dataDir = await mkdtemp(join(tmpdir(), "patchbay-feed-"));
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

  test("later polls dispatch generic flow events", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patchbay-feed-"));
    const sourcesPath = join(dataDir, "sources.json");
    const releaseSource: FeedSourceConfig = {
      ...source,
      id: "github-openai-codex-releases",
      url: "https://github.com/openai/codex/releases.atom",
      event: "release",
      target: {
        mode: "flow_dispatch",
        eventType: "upstream.release",
        dispatchUrlEnv: "FLOW_URL",
        dispatchSecretEnv: "FLOW_SECRET",
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
          FLOW_URL: "https://flow.example/events",
          FLOW_SECRET: "secret",
        },
        fetchImpl: async (_url, init) => {
          dispatchedBody = String(init.body);
          const headers = init.headers as Record<string, string>;
          dispatchedSignature = String(headers["x-patchbay-flow-signature-256"]);
          return new Response(null, { status: 202 });
        },
      },
    }, async () => {
      return new Response(rss, { status: 200 });
    });

    const flowEventText = await readFile(join(dataDir, "flow-events.jsonl"), "utf8");
    const flowEvent = JSON.parse(flowEventText.trim()) as Record<string, any>;
    expect(flowEvent.type).toBe("upstream.release");
    expect(flowEvent.source).toBe("patchbay");
    expect(flowEvent.payload.repo).toBe("openai/codex");
    expect(flowEvent.payload.tag).toBe("v1.2.3");
    expect(JSON.parse(dispatchedBody).id).toBe(flowEvent.id);
    expect(dispatchedSignature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(await readFile(join(dataDir, "flow-dispatches.jsonl"), "utf8")).toContain("\"status\":\"dispatched\"");
  });
});
