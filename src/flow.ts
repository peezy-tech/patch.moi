import { hmacSha256Hex } from "./signatures";
import type {
  FeedFlowDispatchTarget,
  FeedSignal,
  FlowDispatchRecord,
  FlowEvent,
} from "./types";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type FlowDispatchConfig = {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
};

function isFlowDispatchTarget(value: unknown): value is FeedFlowDispatchTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { mode?: unknown }).mode === "flow_dispatch"
  );
}

function tagFromSignal(signal: FeedSignal): string | undefined {
  if (signal.event !== "release") {
    return undefined;
  }
  const ref = signal.ref?.trim();
  if (ref) {
    return ref;
  }
  return signal.title.trim() || undefined;
}

function flowPayloadFromSignal(signal: FeedSignal): Record<string, unknown> {
  return {
    provider: signal.provider,
    event: signal.event,
    sourceId: signal.sourceId,
    entryId: signal.entryId,
    title: signal.title,
    url: signal.url,
    author: signal.author,
    publishedAt: signal.publishedAt,
    repo: signal.repo.fullName,
    repoOwner: signal.repo.owner,
    repoName: signal.repo.name,
    ref: signal.ref,
    sha: signal.sha,
    tag: tagFromSignal(signal),
    raw: signal.raw,
  };
}

export function flowEventForFeedSignal(
  signal: FeedSignal,
  receivedAt = new Date().toISOString(),
): FlowEvent<Record<string, unknown>> | undefined {
  if (!isFlowDispatchTarget(signal.target)) {
    return undefined;
  }

  return {
    id: `patchbay:${signal.sourceId}:${signal.entryId}:${signal.target.eventType}`,
    type: signal.target.eventType,
    source: "patchbay",
    occurredAt: signal.publishedAt,
    receivedAt,
    payload: {
      ...flowPayloadFromSignal(signal),
      ...(signal.target.payload ?? {}),
    },
  };
}

function targetDispatchUrl(
  target: FeedFlowDispatchTarget,
  env: Record<string, string | undefined>,
): string | undefined {
  const explicit = target.dispatchUrl?.trim();
  if (explicit) {
    return explicit;
  }
  const envName = target.dispatchUrlEnv?.trim() || "PATCHBAY_FLOW_DISPATCH_URL";
  return env[envName]?.trim() || undefined;
}

function targetDispatchSecret(
  target: FeedFlowDispatchTarget,
  env: Record<string, string | undefined>,
): string | undefined {
  const envName = target.dispatchSecretEnv?.trim() || "PATCHBAY_FLOW_DISPATCH_SECRET";
  return env[envName]?.trim() || undefined;
}

export async function dispatchFlowEvent(
  event: FlowEvent,
  target: Partial<FeedFlowDispatchTarget> = {},
  config: FlowDispatchConfig = {},
): Promise<FlowDispatchRecord> {
  const env = config.env ?? process.env;
  const url = targetDispatchUrl({ mode: "flow_dispatch", eventType: event.type, ...target }, env);
  if (!url) {
    return {
      eventId: event.id,
      eventType: event.type,
      status: "skipped",
      error: "flow dispatch URL is not configured",
      createdAt: new Date().toISOString(),
    };
  }

  const body = JSON.stringify(event);
  const secret = targetDispatchSecret({ mode: "flow_dispatch", eventType: event.type, ...target }, env);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-patchbay-flow-event": event.type,
    "x-patchbay-flow-delivery": event.id,
  };
  if (secret) {
    headers["x-patchbay-flow-signature-256"] =
      `sha256=${await hmacSha256Hex(secret, body)}`;
  }

  try {
    const response = await (config.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers,
      body,
    });
    return {
      eventId: event.id,
      eventType: event.type,
      url,
      status: response.ok ? "dispatched" : "failed",
      httpStatus: response.status,
      error: response.ok ? undefined : `flow dispatch returned ${response.status}`,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      eventId: event.id,
      eventType: event.type,
      url,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      createdAt: new Date().toISOString(),
    };
  }
}

export async function replayFlowEvent(
  event: FlowEvent,
  target: Partial<FeedFlowDispatchTarget> = {},
  config: FlowDispatchConfig = {},
): Promise<FlowDispatchRecord> {
  const env = config.env ?? process.env;
  const dispatchUrl = targetDispatchUrl({ mode: "flow_dispatch", eventType: event.type, ...target }, env);
  if (!dispatchUrl) {
    return {
      eventId: event.id,
      eventType: event.type,
      status: "skipped",
      error: "flow dispatch URL is not configured",
      createdAt: new Date().toISOString(),
    };
  }
  const url = `${dispatchUrl.replace(/\/(?:events|flow-events)\/?$/, "")}/events/${encodeURIComponent(event.id)}/replay`;
  const body = JSON.stringify({ wait: false });
  const secret = targetDispatchSecret({ mode: "flow_dispatch", eventType: event.type, ...target }, env);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-patchbay-flow-event": event.type,
    "x-patchbay-flow-delivery": event.id,
  };
  if (secret) {
    headers["x-patchbay-flow-signature-256"] =
      `sha256=${await hmacSha256Hex(secret, body)}`;
  }

  try {
    const response = await (config.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers,
      body,
    });
    return {
      eventId: event.id,
      eventType: event.type,
      url,
      status: response.ok ? "dispatched" : "failed",
      httpStatus: response.status,
      error: response.ok ? undefined : `flow replay returned ${response.status}`,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      eventId: event.id,
      eventType: event.type,
      url,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      createdAt: new Date().toISOString(),
    };
  }
}

export async function dispatchFlowEventForFeedSignal(
  signal: FeedSignal,
  config: FlowDispatchConfig = {},
): Promise<{ event?: FlowEvent<Record<string, unknown>>; record?: FlowDispatchRecord }> {
  if (!isFlowDispatchTarget(signal.target)) {
    return {};
  }

  const event = flowEventForFeedSignal(signal);
  if (!event) {
    return {};
  }

  return {
    event,
    record: await dispatchFlowEvent(event, signal.target, config),
  };
}
