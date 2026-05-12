import { describe, expect, test } from "bun:test";
import { buildDiscordPayload, notifyDiscord, parseDiscordConfig } from "../src/discord";
import type { GitWebhookEvent } from "../src/types";

const pushEvent: GitWebhookEvent = {
  provider: "jojo",
  event: "push",
  providerEvent: "push",
  deliveryId: "delivery-1",
  receivedAt: "2026-05-12T21:00:00.000Z",
  repo: {
    owner: "peezy-tech",
    name: "git-webhooks",
    fullName: "peezy-tech/git-webhooks",
  },
  sender: {
    username: "matamune",
  },
  ref: "refs/heads/main",
  after: "0123456789abcdef",
  raw: {
    head_commit: {
      url: "https://jojo.build/peezy-tech/git-webhooks/commit/0123456789abcdef",
    },
  },
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
        repoFullName: "peezy-tech/git-webhooks",
        ref: "refs/heads/main",
        sha: "0123456789abcdef",
        deliveryId: "delivery-1",
        createdAt: "2026-05-12T21:00:00.000Z",
      },
    });

    expect(payload.username).toBe("git-webhooks");
    expect(payload.embeds[0].title).toBe("[jojo] peezy-tech/git-webhooks push to main");
    expect(payload.embeds[0].url).toBe("https://jojo.build/peezy-tech/git-webhooks/commit/0123456789abcdef");
    expect(payload.embeds[0].fields).toContainEqual({ name: "Queued", value: "main_push", inline: true });
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

    expect(JSON.parse(body).embeds[0].title).toBe("[jojo] peezy-tech/git-webhooks push to main");
  });

  test("throws on Discord failure", async () => {
    await expect(notifyDiscord(parseDiscordConfig({ webhookUrl: "https://discord.example/webhook" }), { event: pushEvent }, async () => {
      return new Response("bad", { status: 500 });
    })).rejects.toThrow("Discord webhook returned 500");
  });
});
