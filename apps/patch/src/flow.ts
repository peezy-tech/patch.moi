import type {
  FlowDispatchResult,
  FlowReplayResult,
  FlowRunView,
} from "@peezy.tech/codex-flows/flow-runtime/client";
import type {
  CandidateRefRecord,
  FeedWorkspaceFlowTarget,
  FeedSignal,
  FlowDispatchRecord,
  FlowEvent,
  MaintenanceAttemptRecord,
  MaintenanceAttemptStatus,
} from "./types";
import {
  createPatchWorkspaceBackend,
  targetWorkspaceBackendUrl,
  type WorkspaceBackendConfig,
} from "./workspace-backend";

const serviceSource = "patch";

export type FlowDispatchConfig = WorkspaceBackendConfig;
export type WorkspaceDispatchConfig = WorkspaceBackendConfig;

export type WorkspaceDispatchOutcome = {
  record: FlowDispatchRecord;
  result?: FlowDispatchResult;
};

export type WorkspaceReplayOutcome = {
  record: FlowDispatchRecord;
  result?: FlowReplayResult;
};

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
  return (await dispatchWorkspaceEventDetailed(event, target, config)).record;
}

export async function dispatchWorkspaceEventDetailed(
  event: FlowEvent,
  target: Partial<FeedWorkspaceFlowTarget> = {},
  config: WorkspaceDispatchConfig = {},
): Promise<WorkspaceDispatchOutcome> {
  const workspaceTarget = { mode: "workspace_flow" as const, eventType: event.type, ...target };
  const backend = createPatchWorkspaceBackend(workspaceTarget, config);

  try {
    const result = await backend.client.dispatchEvent(event);
    return {
      result,
      record: {
        eventId: event.id,
        eventType: event.type,
        operation: "dispatch",
        target: localTransport(backend.mode) ? "local" : "workspace-backend",
        transport: backend.mode,
        workspaceBackendUrl: backend.url,
        url: backend.eventsUrl,
        status: "dispatched",
        runIds: result.runIds,
        matched: result.matched,
        idempotent: result.idempotent,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    const httpStatus = httpStatusFromError(error);
    return {
      record: {
        eventId: event.id,
        eventType: event.type,
        operation: "dispatch",
        target: localTransport(backend.mode) ? "local" : "workspace-backend",
        transport: backend.mode,
        workspaceBackendUrl: backend.url,
        url: backend.eventsUrl,
        status: "failed",
        ...(httpStatus ? { httpStatus } : {}),
        error: error instanceof Error ? error.message : String(error),
        createdAt: new Date().toISOString(),
      },
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
  return (await replayWorkspaceEventDetailed(event, target, config)).record;
}

export async function replayWorkspaceEventDetailed(
  event: FlowEvent,
  target: Partial<FeedWorkspaceFlowTarget> = {},
  config: WorkspaceDispatchConfig = {},
): Promise<WorkspaceReplayOutcome> {
  const env = config.env ?? process.env;
  const workspaceTarget = { mode: "workspace_flow" as const, eventType: event.type, ...target };
  const backend = createPatchWorkspaceBackend(workspaceTarget, config);
  const configuredUrl = targetWorkspaceBackendUrl(workspaceTarget, env);

  try {
    const result = configuredUrl
      ? await backend.client.replayEvent(event.id, { wait: false })
      : await backend.client.dispatchEvent(event);
    return {
      result,
      record: {
        eventId: event.id,
        eventType: event.type,
        operation: "replay",
        target: localTransport(backend.mode) ? "local" : "workspace-backend",
        transport: backend.mode,
        workspaceBackendUrl: backend.url,
        url: backend.eventsUrl ? `${backend.eventsUrl}/${encodeURIComponent(event.id)}/replay` : undefined,
        status: "dispatched",
        runIds: result.runIds,
        matched: result.matched,
        idempotent: result.idempotent,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    const httpStatus = httpStatusFromError(error);
    return {
      record: {
        eventId: event.id,
        eventType: event.type,
        operation: "replay",
        target: localTransport(backend.mode) ? "local" : "workspace-backend",
        transport: backend.mode,
        workspaceBackendUrl: backend.url,
        url: backend.eventsUrl,
        status: "failed",
        ...(httpStatus ? { httpStatus } : {}),
        error: error instanceof Error ? error.message : String(error),
        createdAt: new Date().toISOString(),
      },
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
): Promise<{ event?: FlowEvent<Record<string, unknown>>; record?: FlowDispatchRecord; result?: FlowDispatchResult }> {
  if (!isWorkspaceFlowTarget(signal.target)) {
    return {};
  }

  const event = flowEventForFeedSignal(signal);
  if (!event) {
    return {};
  }

  const outcome = await dispatchWorkspaceEventDetailed(event, signal.target, config);
  return { event, ...outcome };
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
  runs: FlowRunView[] = [],
): MaintenanceAttemptRecord {
  const payload = typeof event.payload === "object" && event.payload !== null
    ? event.payload as Record<string, unknown>
    : {};
  const operation = record.operation ?? "dispatch";
  const createdAt = record.createdAt;

  return maintenanceAttemptWithWorkspaceRuns({
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
    createdAt,
    updatedAt: createdAt,
  }, runs, createdAt);
}

export function maintenanceAttemptWithWorkspaceRuns(
  attempt: MaintenanceAttemptRecord,
  runs: FlowRunView[],
  updatedAt = new Date().toISOString(),
): MaintenanceAttemptRecord {
  if (runs.length === 0) {
    return attempt;
  }

  const statuses = Object.fromEntries(
    runs.map((run) => [run.id, String(run.effectiveStatus ?? run.status ?? "unknown")]),
  );
  const resultPayloads = runs
    .map((run) => flowResultPayload(run.resultPayload))
    .filter((payload): payload is Record<string, unknown> => payload !== undefined);
  const status = statusFromRuns(runs);
  const message = newestString(resultPayloads.map((payload) => payload.message)) ?? attempt.message;
  const candidateRefs = uniqueCandidateRefs([
    ...attempt.candidateRefs,
    ...resultPayloads.flatMap(candidateRefsFromFlowResult),
  ]);
  const error = newestString([
    ...runs.map((run) => run.error),
    ...resultPayloads.map((payload) => payload.message).filter((_value, index) => {
      const status = resultPayloads[index]?.status;
      return status === "failed" || status === "blocked" || status === "needs_intervention";
    }),
  ]) ?? attempt.error;
  const completedAt = status === "started"
    ? attempt.completedAt
    : newestString(runs.map((run) => run.completedAt)) ?? updatedAt;

  return {
    ...attempt,
    status,
    workspaceRunIds: uniqueStrings([
      ...attempt.workspaceRunIds,
      ...runs.map((run) => run.id).filter(Boolean),
    ]),
    workspaceRunStatuses: statuses,
    candidateRefs,
    ...(message ? { message } : {}),
    ...(error ? { error } : {}),
    updatedAt,
    ...(completedAt ? { completedAt } : {}),
  };
}

function httpStatusFromError(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\bfailed with (\d{3})\b/);
  return match?.[1] ? Number(match[1]) : undefined;
}

function localTransport(value: string): boolean {
  return value === "local" || value === "actions-local";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function flowResultPayload(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const payload = value as Record<string, unknown>;
  if (typeof payload.status === "string") {
    return payload;
  }
  const nested = recordValue(payload.result);
  return typeof nested.status === "string" ? nested : undefined;
}

function statusFromRuns(runs: FlowRunView[]): MaintenanceAttemptStatus {
  const statuses = runs.map((run) => resultStatus(run));
  if (statuses.some((status) => status === "needs_intervention")) return "needs_intervention";
  if (statuses.some((status) => status === "blocked")) return "blocked";
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "changed")) return "changed";
  if (statuses.length > 0 && statuses.every((status) => status === "skipped")) return "skipped";
  if (statuses.length > 0 && statuses.every((status) => status === "completed" || status === "skipped")) return "completed";
  return "started";
}

function resultStatus(run: FlowRunView): string {
  const payload = flowResultPayload(run.resultPayload);
  return stringValue(payload?.status) ?? String(run.effectiveStatus ?? run.status ?? "started");
}

function candidateRefsFromFlowResult(result: Record<string, unknown>): CandidateRefRecord[] {
  const artifacts = recordValue(result.artifacts);
  const candidates = [
    ...arrayValue(artifacts.candidateRefs),
    ...arrayValue(artifacts.candidates),
    artifacts.candidateRef,
  ];
  return candidates.flatMap(candidateRefValue);
}

function candidateRefValue(value: unknown): CandidateRefRecord[] {
  if (typeof value === "string" && value.trim()) {
    return [{ kind: "ref", ref: value.trim() }];
  }
  const record = recordValue(value);
  const ref = stringValue(record.ref);
  if (!ref) {
    return [];
  }
  return [{
    kind: stringValue(record.kind) ?? "ref",
    ref,
    ...(stringValue(record.repo) ? { repo: stringValue(record.repo) } : {}),
    ...(stringValue(record.remote) ? { remote: stringValue(record.remote) } : {}),
    ...(stringValue(record.sha) ? { sha: stringValue(record.sha) } : {}),
    ...(stringValue(record.url) ? { url: stringValue(record.url) } : {}),
    ...(typeof record.pushed === "boolean" ? { pushed: record.pushed } : {}),
  }];
}

function uniqueCandidateRefs(refs: CandidateRefRecord[]): CandidateRefRecord[] {
  const seen = new Set<string>();
  const result: CandidateRefRecord[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.repo ?? ""}:${ref.remote ?? ""}:${ref.ref}:${ref.sha ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function newestString(values: unknown[]): string | undefined {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = stringValue(values[index]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
