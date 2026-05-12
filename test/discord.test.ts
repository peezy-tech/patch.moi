import { describe, expect, test } from "bun:test";
import { buildDiscordPayload, notifyDiscord, parseDiscordConfig } from "../src/discord";
import type { FeedSignal, GitWebhookEvent } from "../src/types";

const pushEvent: GitWebhookEvent = {
  provider: "jojo",
  event: "push",
  providerEvent: "push",
  deliveryId: "delivery-1",
  receivedAt: "2026-05-12T21:00:00.000Z",
  repo: {
    owner: "peezy-tech",
    name: "patchbay",
    fullName: "peezy-tech/patchbay",
  },
  sender: {
    username: "matamune",
  },
  ref: "refs/heads/main",
  after: "0123456789abcdef",
  raw: {
    head_commit: {
      url: "https://jojo.build/peezy-tech/patchbay/commit/0123456789abcdef",
    },
  },
};

const feedSignal: FeedSignal = {
  sourceId: "github-openai-codex-main",
  provider: "github",
  event: "push",
  entryId: "tag:github.com,2008:Grit::Commit/0123456789abcdef0123456789abcdef01234567",
  title: "Tighten sandbox setup",
  url: "https://github.com/openai/codex/commit/0123456789abcdef0123456789abcdef01234567",
  author: "bookholt-oai",
  publishedAt: "2026-05-12T21:00:00.000Z",
  repo: {
    owner: "openai",
    name: "codex",
    fullName: "openai/codex",
    webUrl: "https://github.com/openai/codex",
    defaultBranch: "main",
  },
  ref: "refs/heads/main",
  sha: "0123456789abcdef0123456789abcdef01234567",
  target: {
    provider: "github",
    repoFullName: "peezy-tech/codex",
    branch: "main",
    mode: "notify_only",
  },
  raw: {},
};

describe("discord notifications", () => {
  test("parses default notify events", () => {
    const config = parseDiscordConfig({});
    expect(config.notifyEvents.has("push")).toBe(true);
    expect(config.notifyEvents.has("pull_request")).toBe(true);
    expect(config.notifyEvents.has("release")).toBe(true);
    expect(config.notifyEvents.has("ping")).toBe(false);
  });

  test("builds readable push embeds", () => {
    const payload = buildDiscordPayload({
      event: pushEvent,
      job: {
        id: "jojo:delivery-1:main_push",
        kind: "main_push",
        provider: "jojo",
        repoFullName: "peezy-tech/patchbay",
        ref: "refs/heads/main",
        sha: "0123456789abcdef",
        deliveryId: "delivery-1",
        createdAt: "2026-05-12T21:00:00.000Z",
      },
    });

    expect(payload.username).toBe("patchbay");
    expect(payload.embeds[0].title).toBe("[jojo] peezy-tech/patchbay push to main");
    expect(payload.embeds[0].url).toBe("https://jojo.build/peezy-tech/patchbay/commit/0123456789abcdef");
    expect(payload.embeds[0].fields).toContainEqual({ name: "Queued", value: "main_push", inline: true });
  });

  test("builds readable feed embeds", () => {
    const payload = buildDiscordPayload({ signal: feedSignal });
    expect(payload.embeds[0].title).toBe("[github] openai/codex upstream update on main");
    expect(payload.embeds[0].description).toBe("Tighten sandbox setup");
    expect(payload.embeds[0].url).toBe("https://github.com/openai/codex/commit/0123456789abcdef0123456789abcdef01234567");
    expect(payload.embeds[0].footer.text).toBe("feed watcher");
  });

  test("does nothing without a webhook URL", async () => {
    let calls = 0;
    await notifyDiscord(parseDiscordConfig({}), { event: pushEvent }, async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    });
    expect(calls).toBe(0);
  });

  test("skips unconfigured events", async () => {
    let calls = 0;
    await notifyDiscord(parseDiscordConfig({ webhookUrl: "https://discord.example/webhook", notifyEvents: "release" }), { event: pushEvent }, async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    });
    expect(calls).toBe(0);
  });

  test("posts configured events", async () => {
    let body = "";
    await notifyDiscord(parseDiscordConfig({ webhookUrl: "https://discord.example/webhook", notifyEvents: "push" }), { event: pushEvent }, async (_url, init) => {
      body = String(init?.body);
      return new Response(null, { status: 204 });
    });

    expect(JSON.parse(body).embeds[0].title).toBe("[jojo] peezy-tech/patchbay push to main");
  });

  test("throws on Discord failure", async () => {
    await expect(notifyDiscord(parseDiscordConfig({ webhookUrl: "https://discord.example/webhook" }), { event: pushEvent }, async () => {
      return new Response("bad", { status: 500 });
    })).rejects.toThrow("Discord webhook returned 500");
  });
});
