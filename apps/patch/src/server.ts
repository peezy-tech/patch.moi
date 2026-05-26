import { parseDiscordConfig, type DiscordConfig } from "./discord";
import { startFeedPolling } from "./feed";
import {
  dispatchWorkspaceEventDetailed,
  getWorkspaceEvent,
  getWorkspaceRun,
  listWorkspaceEvents,
  listWorkspaceRuns,
  maintenanceAttemptForWorkspaceDispatch,
  replayWorkspaceEventDetailed,
} from "./automation";
import { jsonResponse, methodNotAllowed, textResponse } from "./http";
import { syncMaintenanceAttempt } from "./maintenance";
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
  throw new Error("workspace dispatch status must be dispatched, failed, or skipped");
}

function maintenanceStatus(value: string | null) {
  if (!value) return undefined;
  if (
    value === "started" ||
    value === "completed" ||
    value === "changed" ||
    value === "needs_intervention" ||
    value === "blocked" ||
    value === "failed" ||
    value === "skipped"
  ) return value;
  throw new Error("maintenance attempt status is invalid");
}

async function handleAutomationEvents(request: Request, config: ServerConfig, store: EventStore): Promise<Response> {
  const unauthorized = requireAdmin(request, config);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/automation-events") {
    return jsonResponse({
      events: await store.listAutomationEvents({
        type: url.searchParams.get("type") ?? undefined,
        limit: numberParam(url.searchParams.get("limit")),
      }),
    });
  }

  const eventMatch = url.pathname.match(/^\/automation-events\/([^/]+)(?:\/(retry|replay))?$/);
  if (!eventMatch?.[1]) return jsonResponse({ error: "not_found" }, { status: 404 });

  const eventId = decodeURIComponent(eventMatch[1]);
  const event = await store.getAutomationEvent(eventId);
  if (!event) {
    return jsonResponse({ error: "automation_event_not_found" }, { status: 404 });
  }
  if (request.method === "GET" && !eventMatch[2]) {
    return jsonResponse({
      event,
      dispatches: await store.listWorkspaceDispatches({ eventId, limit: numberParam(url.searchParams.get("limit")) }),
    });
  }
  if (request.method === "POST" && eventMatch[2] === "retry") {
    const { record, result } = await dispatchWorkspaceEventDetailed(event, {}, { env: process.env });
    await store.appendWorkspaceDispatch(record);
    await store.appendMaintenanceAttempt(maintenanceAttemptForWorkspaceDispatch(event, record, result?.runs));
    return jsonResponse({ event, record }, { status: record.status === "failed" ? 502 : 202 });
  }
  if (request.method === "POST" && eventMatch[2] === "replay") {
    const { record, result } = await replayWorkspaceEventDetailed(event, {}, { env: process.env });
    await store.appendWorkspaceDispatch(record);
    await store.appendMaintenanceAttempt(maintenanceAttemptForWorkspaceDispatch(event, record, result?.runs));
    return jsonResponse({ event, record }, { status: record.status === "failed" ? 502 : 202 });
  }
  return methodNotAllowed();
}

async function handleAutomationDispatches(request: Request, config: ServerConfig, store: EventStore): Promise<Response> {
  const unauthorized = requireAdmin(request, config);
  if (unauthorized) return unauthorized;
  if (request.method !== "GET") return methodNotAllowed();
  const url = new URL(request.url);
  return jsonResponse({
    dispatches: await store.listWorkspaceDispatches({
      eventId: url.searchParams.get("eventId") ?? undefined,
      status: dispatchStatus(url.searchParams.get("status")),
      limit: numberParam(url.searchParams.get("limit")),
    }),
  });
}

async function handleMaintenanceAttempts(request: Request, config: ServerConfig, store: EventStore): Promise<Response> {
  const unauthorized = requireAdmin(request, config);
  if (unauthorized) return unauthorized;
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/maintenance-attempts") {
    return jsonResponse({
      attempts: await store.listMaintenanceAttempts({
        eventId: url.searchParams.get("eventId") ?? undefined,
        status: maintenanceStatus(url.searchParams.get("status")),
        limit: numberParam(url.searchParams.get("limit")),
      }),
    });
  }

  const attemptMatch = url.pathname.match(/^\/maintenance-attempts\/([^/]+)(?:\/(sync))?$/);
  if (!attemptMatch?.[1]) return jsonResponse({ error: "not_found" }, { status: 404 });
  const attemptId = decodeURIComponent(attemptMatch[1]);
  const attempt = await store.getMaintenanceAttempt(attemptId);
  if (!attempt) {
    return jsonResponse({ error: "maintenance_attempt_not_found" }, { status: 404 });
  }
  if (request.method === "GET" && !attemptMatch[2]) {
    return jsonResponse({ attempt });
  }
  if (request.method === "POST" && attemptMatch[2] === "sync") {
    const next = await syncMaintenanceAttempt(store, attempt);
    return jsonResponse({ attempt: next }, { status: 202 });
  }
  return methodNotAllowed();
}

async function handleWorkspaceRuns(request: Request, config: ServerConfig): Promise<Response> {
  const unauthorized = requireAdmin(request, config);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/workspace-runs") {
    return jsonResponse(await listWorkspaceRuns({ env: process.env }, {
      eventId: url.searchParams.get("eventId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: numberParam(url.searchParams.get("limit")),
    }));
  }

  const runMatch = url.pathname.match(/^\/workspace-runs\/([^/]+)$/);
  if (request.method === "GET" && runMatch?.[1]) {
    return jsonResponse({ run: await getWorkspaceRun(decodeURIComponent(runMatch[1]), { env: process.env }) });
  }

  return methodNotAllowed();
}

async function handleWorkspaceEvents(request: Request, config: ServerConfig): Promise<Response> {
  const unauthorized = requireAdmin(request, config);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/workspace-events") {
    return jsonResponse(await listWorkspaceEvents({ env: process.env }, {
      type: url.searchParams.get("type") ?? undefined,
      limit: numberParam(url.searchParams.get("limit")),
    }));
  }

  const eventMatch = url.pathname.match(/^\/workspace-events\/([^/]+)$/);
  if (request.method === "GET" && eventMatch?.[1]) {
    return jsonResponse({ event: await getWorkspaceEvent(decodeURIComponent(eventMatch[1]), { env: process.env }) });
  }

  return methodNotAllowed();
}

export function createHandler(config: ServerConfig): (request: Request) => Promise<Response> | Response {
  const store = new EventStore(config.dataDir);

  return async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return textResponse("ok\n");
    }
    if (url.pathname === "/automation-events" || url.pathname.startsWith("/automation-events/")) {
      return handleAutomationEvents(request, config, store);
    }
    if (url.pathname === "/workspace-dispatches" || url.pathname === "/automation-dispatches") {
      return handleAutomationDispatches(request, config, store);
    }
    if (url.pathname === "/maintenance-attempts" || url.pathname.startsWith("/maintenance-attempts/")) {
      return handleMaintenanceAttempts(request, config, store);
    }
    if (url.pathname === "/workspace-runs" || url.pathname.startsWith("/workspace-runs/")) {
      return handleWorkspaceRuns(request, config);
    }
    if (url.pathname === "/workspace-events" || url.pathname.startsWith("/workspace-events/")) {
      return handleWorkspaceEvents(request, config);
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
      workspaceBackend: {
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
