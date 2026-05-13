import { randomUUID } from "node:crypto";
import { notifyDiscord, parseDiscordConfig, type DiscordConfig } from "./discord";
import { startFeedPolling } from "./feed";
import { jsonResponse, methodNotAllowed, textResponse } from "./http";
import { normalizeGithubEvent } from "./providers/github";
import { normalizeJojoEvent } from "./providers/jojo";
import { EventStore, jobForEvent } from "./queue";
import { verifyGithubSignature, verifyJojoSignature } from "./signatures";
import type { GitWebhookEvent } from "./types";

const maxBodyBytes = 1024 * 1024;

export type ServerConfig = {
  githubSecret: string;
  jojoSecret: string;
  dataDir: string;
  discord?: DiscordConfig;
};

function getHeader(headers: Headers, name: string, fallback: string): string {
  return headers.get(name) ?? fallback;
}

async function parseJsonBody(request: Request): Promise<{ body: string; payload: unknown } | Response> {
  const body = await request.text();
  if (body.length > maxBodyBytes) {
    return jsonResponse({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    return { body, payload: JSON.parse(body) };
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }
}

async function persistAcceptedEvent(store: EventStore, event: GitWebhookEvent, discord?: DiscordConfig): Promise<Response> {
  await store.appendEvent(event);
  const job = jobForEvent(event);
  if (job) {
    await store.appendJob(job);
  }

  try {
    await notifyDiscord(discord ?? parseDiscordConfig({}), { event, job });
  } catch (error) {
    console.error(JSON.stringify({
      type: "discord.notify_failed",
      provider: event.provider,
      event: event.event,
      deliveryId: event.deliveryId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  console.log(JSON.stringify({ type: "webhook.accepted", provider: event.provider, event: event.event, deliveryId: event.deliveryId, job: job?.id }));
  return jsonResponse({ status: event.event === "ping" ? "ok" : "accepted", event: event.event, deliveryId: event.deliveryId }, {
    status: event.event === "ping" ? 200 : 202,
  });
}

async function handleGithub(request: Request, config: ServerConfig, store: EventStore): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const parsed = await parseJsonBody(request);
  if (parsed instanceof Response) return parsed;

  const verified = await verifyGithubSignature(config.githubSecret, parsed.body, request.headers.get("x-hub-signature-256"));
  if (!verified) return jsonResponse({ error: "invalid_signature" }, { status: 401 });

  const event = normalizeGithubEvent({
    providerEvent: getHeader(request.headers, "x-github-event", "unknown"),
    deliveryId: getHeader(request.headers, "x-github-delivery", randomUUID()),
    receivedAt: new Date().toISOString(),
    payload: parsed.payload as never,
  });
  return persistAcceptedEvent(store, event, config.discord);
}

async function handleJojo(request: Request, config: ServerConfig, store: EventStore): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const parsed = await parseJsonBody(request);
  if (parsed instanceof Response) return parsed;

  const verified = await verifyJojoSignature(config.jojoSecret, parsed.body, request.headers);
  if (!verified) return jsonResponse({ error: "invalid_signature" }, { status: 401 });

  const event = normalizeJojoEvent({
    providerEvent: getHeader(request.headers, "x-forgejo-event", request.headers.get("x-gitea-event") ?? "unknown"),
    deliveryId: getHeader(request.headers, "x-forgejo-delivery", request.headers.get("x-gitea-delivery") ?? randomUUID()),
    receivedAt: new Date().toISOString(),
    payload: parsed.payload as never,
  });
  return persistAcceptedEvent(store, event, config.discord);
}

export function createHandler(config: ServerConfig): (request: Request) => Promise<Response> | Response {
  const store = new EventStore(config.dataDir);

  return async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return textResponse("ok\n");
    }
    if (url.pathname === "/github") {
      return handleGithub(request, config, store);
    }
    if (url.pathname === "/jojo") {
      return handleJojo(request, config, store);
    }
    return jsonResponse({ error: "not_found" }, { status: 404 });
  };
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? "3000");
  const hostname = process.env.HOST ?? "0.0.0.0";
  const config: ServerConfig = {
    githubSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
    jojoSecret: process.env.JOJO_WEBHOOK_SECRET ?? "",
    dataDir: process.env.DATA_DIR ?? "./data",
    discord: parseDiscordConfig({
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      notifyEvents: process.env.DISCORD_NOTIFY_EVENTS,
    }),
  };

  if (process.env.FEED_SOURCES_PATH) {
    startFeedPolling({
      dataDir: config.dataDir,
      sourcesPath: process.env.FEED_SOURCES_PATH,
      discord: config.discord,
      flowDispatch: {
        env: process.env,
      },
    }).catch((error) => {
      console.error(JSON.stringify({ type: "feed.start_failed", error: error instanceof Error ? error.message : String(error) }));
    });
  }

  Bun.serve({
    hostname,
    port,
    fetch: createHandler(config),
  });

  console.log(JSON.stringify({ type: "server.started", hostname, port }));
}
