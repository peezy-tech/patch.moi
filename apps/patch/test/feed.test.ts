import { describe, expect, test } from "bun:test";
import { parseFeedEntries, parseNpmPackageEntries, signalFromEntry } from "../src/feed";
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
    mode: "workspace_automation",
    eventType: "upstream.branch_update",
    automations: ["peezy-codex-fork"],
  },
};

describe("feed watcher", () => {
  test("parses Atom feed entries", () => {
    expect(parseFeedEntries(atom)[0]).toMatchObject({
      title: "Update main",
      author: "alice",
      url: "https://github.com/openai/codex/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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

  test("normalizes commit feed entries into automation-targeted push signals", () => {
    const signal = signalFromEntry(source, parseFeedEntries(atom)[0]!);
    expect(signal).toMatchObject({
      sourceId: "github-openai-codex-main",
      provider: "github",
      event: "push",
      ref: "refs/heads/main",
      sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      repo: { fullName: "openai/codex" },
      target: {
        mode: "workspace_automation",
        automations: ["peezy-codex-fork"],
      },
    });
  });
});
