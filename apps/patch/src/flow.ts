import { createFlowClient, type FlowClient } from "@peezy.tech/flow-runtime/client";
import type {
  FeedFlowDispatchTarget,
  FeedSignal,
  FlowDispatchRecord,
  FlowEvent,
} from "./types";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const serviceSource = "patch";

export type FlowDispatchConfig = {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  cwd?: string;
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
    id: `${serviceSource}:${signal.sourceId}:${signal.entryId}:${signal.target.eventType}`,
    type: signal.target.eventType,
    source: serviceSource,
    occurredAt: signal.publishedAt,
    receivedAt,
    payload: {
      ...flowPayloadFromSignal(signal),
      ...(signal.target.payload ?? {}),
    },
  };
}

function targetFlowUrl(
  target: FeedFlowDispatchTarget,
  env: Record<string, string | undefined>,
): string | undefined {
  const explicit = target.dispatchUrl?.trim();
  if (explicit) {
    return explicit;
  }
  const envName = target.dispatchUrlEnv?.trim();
  if (envName) {
    return env[envName]?.trim() || undefined;
  }
  const backendUrl = env.PATCH_FLOW_BACKEND_URL?.trim();
  if (backendUrl) {
    return backendUrl;
  }
  return env.PATCH_FLOW_DISPATCH_URL?.trim() || undefined;
}

function targetDispatchSecret(
  target: FeedFlowDispatchTarget,
  env: Record<string, string | undefined>,
): string | undefined {
  const envName = target.dispatchSecretEnv?.trim();
  if (envName) {
    return env[envName]?.trim() || undefined;
  }
  return env.PATCH_FLOW_DISPATCH_SECRET?.trim() || undefined;
}

export function createFlowClientFromPatchConfig(
  target: Partial<FeedFlowDispatchTarget> = {},
  config: FlowDispatchConfig = {},
): FlowClient {
  const env = config.env ?? process.env;
  const flowTarget = { mode: "flow_dispatch" as const, eventType: target.eventType ?? "flow.event", ...target };
  const url = targetFlowUrl(flowTarget, env);
  if (url) {
    return createFlowClient({
      mode: "http",
      baseUrl: flowBackendBaseUrl(url),
      hmacSecret: targetDispatchSecret(flowTarget, env),
      ...(config.fetchImpl ? { fetch: patchFetch(config.fetchImpl) } : {}),
    });
  }
  return createFlowClient({
    mode: "local",
    cwd: config.cwd ?? process.cwd(),
    env,
    codex: {
      command: env.CODEX_APP_SERVER_CODEX_COMMAND,
      codexHome: env.CODEX_HOME,
      stream: true,
    },
  });
}

export function patchUpstreamReleaseEvent(input: {
  repo: string;
  tag: string;
  receivedAt?: string;
}): FlowEvent<Record<string, unknown>> {
  return {
    id: `${serviceSource}:upstream.release:${input.repo}:${input.tag}`,
    type: "upstream.release",
    source: serviceSource,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    payload: {
      repo: input.repo,
      tag: input.tag,
    },
  };
}

export async function dispatchFlowEvent(
  event: FlowEvent,
  target: Partial<FeedFlowDispatchTarget> = {},
  config: FlowDispatchConfig = {},
): Promise<FlowDispatchRecord> {
  const env = config.env ?? process.env;
  const flowTarget = { mode: "flow_dispatch" as const, eventType: event.type, ...target };
  const url = targetFlowUrl(flowTarget, env);
  const client = createFlowClientFromPatchConfig(flowTarget, config);

  try {
    await client.dispatchEvent(event);
    return {
      eventId: event.id,
      eventType: event.type,
      url: url ? flowEventsUrl(url) : undefined,
      status: "dispatched",
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    const httpStatus = httpStatusFromError(error);
    return {
      eventId: event.id,
      eventType: event.type,
      url,
      status: "failed",
      ...(httpStatus ? { httpStatus } : {}),
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
  const flowTarget = { mode: "flow_dispatch" as const, eventType: event.type, ...target };
  const url = targetFlowUrl(flowTarget, env);
  const client = createFlowClientFromPatchConfig(flowTarget, config);

  try {
    if (url) {
      await client.replayEvent(event.id, { wait: false });
    } else {
      await client.dispatchEvent(event);
    }
    return {
      eventId: event.id,
      eventType: event.type,
      url: url ? `${flowBackendBaseUrl(url)}/events/${encodeURIComponent(event.id)}/replay` : undefined,
      status: "dispatched",
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    const httpStatus = httpStatusFromError(error);
    return {
      eventId: event.id,
      eventType: event.type,
      url,
      status: "failed",
      ...(httpStatus ? { httpStatus } : {}),
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

function flowBackendBaseUrl(url: string): string {
  return url.replace(/\/(?:events|flow-events)\/?$/, "").replace(/\/+$/, "");
}

function flowEventsUrl(url: string): string {
  return `${flowBackendBaseUrl(url)}/events`;
}

function patchFetch(fetchImpl: FetchLike) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    return fetchImpl(String(input), init ?? {});
  };
}

function httpStatusFromError(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\bfailed with (\d{3})\b/);
  return match?.[1] ? Number(match[1]) : undefined;
}
