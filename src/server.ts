import { parseDiscordConfig, type DiscordConfig } from "./discord";
import { startFeedPolling } from "./feed";
import { dispatchFlowEvent, replayFlowEvent } from "./flow";
import { jsonResponse, methodNotAllowed, textResponse } from "./http";
import { EventStore } from "./queue";

export type ServerConfig = {
  dataDir: string;
  discord?: DiscordConfig;
  adminToken?: string;
};

function adminAuthorized(request: Request, config: ServerConfig): boolean {
  if (!config.adminToken) {
    return true;
  }
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const header = request.headers.get("x-patch-admin-token");
  return bearer === config.adminToken || header === config.adminToken;
}

function requireAdmin(request: Request, config: ServerConfig): Response | undefined {
  return adminAuthorized(request, config) ? undefined : jsonResponse({ error: "unauthorized" }, { status: 401 });
}

function numberParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dispatchStatus(value: string | null) {
  if (!value) return undefined;
  if (value === "dispatched" || value === "failed" || value === "skipped") return value;
  throw new Error("flow dispatch status must be dispatched, failed, or skipped");
}

async function handleFlowEvents(request: Request, config: ServerConfig, store: EventStore): Promise<Response> {
  const unauthorized = requireAdmin(request, config);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/flow-events") {
    return jsonResponse({
      events: await store.listFlowEvents({
        type: url.searchParams.get("type") ?? undefined,
        limit: numberParam(url.searchParams.get("limit")),
      }),
    });
  }

  const eventMatch = url.pathname.match(/^\/flow-events\/([^/]+)(?:\/(retry|replay))?$/);
  if (!eventMatch?.[1]) return jsonResponse({ error: "not_found" }, { status: 404 });

  const eventId = decodeURIComponent(eventMatch[1]);
  const event = await store.getFlowEvent(eventId);
  if (!event) {
    return jsonResponse({ error: "flow_event_not_found" }, { status: 404 });
  }
  if (request.method === "GET" && !eventMatch[2]) {
    return jsonResponse({
      event,
      dispatches: await store.listFlowDispatches({ eventId, limit: numberParam(url.searchParams.get("limit")) }),
    });
  }
  if (request.method === "POST" && eventMatch[2] === "retry") {
    const record = await dispatchFlowEvent(event, {}, { env: process.env });
    await store.appendFlowDispatch(record);
    return jsonResponse({ event, record }, { status: record.status === "failed" ? 502 : 202 });
  }
  if (request.method === "POST" && eventMatch[2] === "replay") {
    const record = await replayFlowEvent(event, {}, { env: process.env });
    await store.appendFlowDispatch(record);
    return jsonResponse({ event, record }, { status: record.status === "failed" ? 502 : 202 });
  }
  return methodNotAllowed();
}

async function handleFlowDispatches(request: Request, config: ServerConfig, store: EventStore): Promise<Response> {
  const unauthorized = requireAdmin(request, config);
  if (unauthorized) return unauthorized;
  if (request.method !== "GET") return methodNotAllowed();
  const url = new URL(request.url);
  return jsonResponse({
    dispatches: await store.listFlowDispatches({
      eventId: url.searchParams.get("eventId") ?? undefined,
      status: dispatchStatus(url.searchParams.get("status")),
      limit: numberParam(url.searchParams.get("limit")),
    }),
  });
}

export function createHandler(config: ServerConfig): (request: Request) => Promise<Response> | Response {
  const store = new EventStore(config.dataDir);

  return async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return textResponse("ok\n");
    }
    if (url.pathname === "/flow-events" || url.pathname.startsWith("/flow-events/")) {
      return handleFlowEvents(request, config, store);
    }
    if (url.pathname === "/flow-dispatches") {
      return handleFlowDispatches(request, config, store);
    }
    return jsonResponse({ error: "not_found" }, { status: 404 });
  };
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? "3000");
  const hostname = process.env.HOST ?? "0.0.0.0";
  const config: ServerConfig = {
    dataDir: process.env.DATA_DIR ?? "./data",
    adminToken: process.env.PATCH_ADMIN_TOKEN,
    discord: parseDiscordConfig({
      enabled: process.env.DISCORD_OUTPUT_ENABLED,
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
