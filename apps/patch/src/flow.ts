import type {
  FeedWorkspaceFlowTarget,
  FeedSignal,
  FlowDispatchRecord,
  FlowEvent,
  MaintenanceAttemptRecord,
} from "./types";
import {
  createPatchWorkspaceBackend,
  targetWorkspaceBackendUrl,
  type WorkspaceBackendConfig,
} from "./workspace-backend";

const serviceSource = "patch";

export type FlowDispatchConfig = WorkspaceBackendConfig;
export type WorkspaceDispatchConfig = WorkspaceBackendConfig;

function isWorkspaceFlowTarget(value: unknown): value is FeedWorkspaceFlowTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    ((value as { mode?: unknown }).mode === "workspace_flow" ||
      (value as { mode?: unknown }).mode === "flow_dispatch")
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
  if (!isWorkspaceFlowTarget(signal.target)) {
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
  target: Partial<FeedWorkspaceFlowTarget> = {},
  config: FlowDispatchConfig = {},
): Promise<FlowDispatchRecord> {
  return dispatchWorkspaceEvent(event, target, config);
}

export async function dispatchWorkspaceEvent(
  event: FlowEvent,
  target: Partial<FeedWorkspaceFlowTarget> = {},
  config: WorkspaceDispatchConfig = {},
): Promise<FlowDispatchRecord> {
  const workspaceTarget = { mode: "workspace_flow" as const, eventType: event.type, ...target };
  const backend = createPatchWorkspaceBackend(workspaceTarget, config);

  try {
    const result = await backend.client.dispatchEvent(event);
    return {
      eventId: event.id,
      eventType: event.type,
      operation: "dispatch",
      target: backend.mode === "local" ? "local" : "workspace-backend",
      transport: backend.mode,
      workspaceBackendUrl: backend.url,
      url: backend.eventsUrl,
      status: "dispatched",
      runIds: result.runIds,
      matched: result.matched,
      idempotent: result.idempotent,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    const httpStatus = httpStatusFromError(error);
    return {
      eventId: event.id,
      eventType: event.type,
      operation: "dispatch",
      target: backend.mode === "local" ? "local" : "workspace-backend",
      transport: backend.mode,
      workspaceBackendUrl: backend.url,
      url: backend.eventsUrl,
      status: "failed",
      ...(httpStatus ? { httpStatus } : {}),
      error: error instanceof Error ? error.message : String(error),
      createdAt: new Date().toISOString(),
    };
  }
}

export async function replayFlowEvent(
  event: FlowEvent,
  target: Partial<FeedWorkspaceFlowTarget> = {},
  config: FlowDispatchConfig = {},
): Promise<FlowDispatchRecord> {
  return replayWorkspaceEvent(event, target, config);
}

export async function replayWorkspaceEvent(
  event: FlowEvent,
  target: Partial<FeedWorkspaceFlowTarget> = {},
  config: WorkspaceDispatchConfig = {},
): Promise<FlowDispatchRecord> {
  const env = config.env ?? process.env;
  const workspaceTarget = { mode: "workspace_flow" as const, eventType: event.type, ...target };
  const backend = createPatchWorkspaceBackend(workspaceTarget, config);
  const configuredUrl = targetWorkspaceBackendUrl(workspaceTarget, env);

  try {
    const result = configuredUrl
      ? await backend.client.replayEvent(event.id, { wait: false })
      : await backend.client.dispatchEvent(event);
    return {
      eventId: event.id,
      eventType: event.type,
      operation: "replay",
      target: backend.mode === "local" ? "local" : "workspace-backend",
      transport: backend.mode,
      workspaceBackendUrl: backend.url,
      url: backend.eventsUrl ? `${backend.eventsUrl}/${encodeURIComponent(event.id)}/replay` : undefined,
      status: "dispatched",
      runIds: result.runIds,
      matched: result.matched,
      idempotent: result.idempotent,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    const httpStatus = httpStatusFromError(error);
    return {
      eventId: event.id,
      eventType: event.type,
      operation: "replay",
      target: backend.mode === "local" ? "local" : "workspace-backend",
      transport: backend.mode,
      workspaceBackendUrl: backend.url,
      url: backend.eventsUrl,
      status: "failed",
      ...(httpStatus ? { httpStatus } : {}),
      error: error instanceof Error ? error.message : String(error),
      createdAt: new Date().toISOString(),
    };
  }
}

export async function listWorkspaceRuns(config: WorkspaceDispatchConfig = {}, options: {
  eventId?: string;
  status?: string;
  limit?: number;
} = {}) {
  return await createPatchWorkspaceBackend({}, config).client.listRuns(options);
}

export async function getWorkspaceRun(runId: string, config: WorkspaceDispatchConfig = {}) {
  return await createPatchWorkspaceBackend({}, config).client.getRun(runId);
}

export async function getWorkspaceEvent(eventId: string, config: WorkspaceDispatchConfig = {}) {
  return await createPatchWorkspaceBackend({}, config).client.getEvent(eventId);
}

export async function listWorkspaceEvents(config: WorkspaceDispatchConfig = {}, options: {
  type?: string;
  limit?: number;
} = {}) {
  return await createPatchWorkspaceBackend({}, config).client.listEvents(options);
}

export async function dispatchWorkspaceEventForFeedSignal(
  signal: FeedSignal,
  config: WorkspaceDispatchConfig = {},
): Promise<{ event?: FlowEvent<Record<string, unknown>>; record?: FlowDispatchRecord }> {
  if (!isWorkspaceFlowTarget(signal.target)) {
    return {};
  }

  const event = flowEventForFeedSignal(signal);
  if (!event) {
    return {};
  }

  return {
    event,
    record: await dispatchWorkspaceEvent(event, signal.target, config),
  };
}

export async function dispatchFlowEventForFeedSignal(
  signal: FeedSignal,
  config: FlowDispatchConfig = {},
): Promise<{ event?: FlowEvent<Record<string, unknown>>; record?: FlowDispatchRecord }> {
  return dispatchWorkspaceEventForFeedSignal(signal, config);
}

export function maintenanceAttemptForWorkspaceDispatch(
  event: FlowEvent,
  record: FlowDispatchRecord,
): MaintenanceAttemptRecord {
  const payload = typeof event.payload === "object" && event.payload !== null
    ? event.payload as Record<string, unknown>
    : {};
  const operation = record.operation ?? "dispatch";

  return {
    id: `${event.id}:${operation}:${record.createdAt}`,
    eventId: event.id,
    eventType: event.type,
    operation,
    status: record.status === "dispatched" ? "started" : record.status,
    upstreamRepo: stringValue(payload.repo),
    upstreamRef: stringValue(payload.ref),
    upstreamSha: stringValue(payload.sha),
    upstreamTag: stringValue(payload.tag),
    workspaceBackendUrl: record.workspaceBackendUrl,
    workspaceRunIds: record.runIds ?? [],
    candidateRefs: [],
    error: record.error,
    createdAt: record.createdAt,
  };
}

function httpStatusFromError(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\bfailed with (\d{3})\b/);
  return match?.[1] ? Number(match[1]) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
