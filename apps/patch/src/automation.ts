import {
  createTurnAutomationHost,
  resolveTurnAutomationTarget,
  runTurnAutomationScript,
  type TurnAutomationRun,
} from "@peezy.tech/codex-flows";
import type {
  AutomationDispatchRecord,
  AutomationEvent,
  AutomationRunView,
  CandidateRefRecord,
  FeedSignal,
  FeedWorkspaceAutomationTarget,
  MaintenanceAttemptRecord,
  MaintenanceAttemptStatus,
  WorkspaceThreadRefRecord,
} from "./types";
import {
  createAutomationHostBackend,
  selectWorkspaceExecution,
  type WorkspaceBackendConfig,
} from "./workspace-backend";

const serviceSource = "patch";

export type AutomationDispatchConfig = WorkspaceBackendConfig;
export type WorkspaceDispatchConfig = WorkspaceBackendConfig;

export type AutomationDispatchResult = {
  eventId: string;
  runIds: string[];
  matched: number;
  runs: AutomationRunView[];
};

export type WorkspaceDispatchOutcome = {
  record: AutomationDispatchRecord;
  result?: AutomationDispatchResult;
};

export type WorkspaceReplayOutcome = WorkspaceDispatchOutcome;

function isWorkspaceAutomationTarget(value: unknown): value is FeedWorkspaceAutomationTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { mode?: unknown }).mode === "workspace_automation"
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

function automationPayloadFromSignal(signal: FeedSignal): Record<string, unknown> {
  const tag = tagFromSignal(signal);
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
    tag,
    ...(signal.provider === "npm" && tag ? { packageName: signal.repo.fullName, version: tag } : {}),
    raw: signal.raw,
  };
}

export function automationEventForFeedSignal(
  signal: FeedSignal,
  receivedAt = new Date().toISOString(),
): AutomationEvent<Record<string, unknown>> | undefined {
  if (!isWorkspaceAutomationTarget(signal.target)) {
    return undefined;
  }

  return {
    id: `${serviceSource}:${signal.sourceId}:${signal.entryId}:${signal.target.eventType}`,
    type: signal.target.eventType,
    source: serviceSource,
    occurredAt: signal.publishedAt,
    receivedAt,
    automations: signal.target.automations,
    payload: {
      ...automationPayloadFromSignal(signal),
      ...(signal.target.payload ?? {}),
    },
  };
}

export function patchUpstreamReleaseEvent(input: {
  repo: string;
  tag: string;
  automations?: string[];
  receivedAt?: string;
}): AutomationEvent<Record<string, unknown>> {
  return {
    id: `${serviceSource}:upstream.release:${input.repo}:${input.tag}`,
    type: "upstream.release",
    source: serviceSource,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    automations: input.automations,
    payload: {
      repo: input.repo,
      tag: input.tag,
    },
  };
}

export function patchUpstreamBranchUpdateEvent(input: {
  repo: string;
  ref: string;
  sha?: string;
  automations?: string[];
  receivedAt?: string;
}): AutomationEvent<Record<string, unknown>> {
  return {
    id: `${serviceSource}:upstream.branch_update:${input.repo}:${input.ref}${input.sha ? `:${input.sha}` : ""}`,
    type: "upstream.branch_update",
    source: serviceSource,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    automations: input.automations,
    payload: {
      repo: input.repo,
      ref: input.ref,
      ...(input.sha ? { sha: input.sha } : {}),
    },
  };
}

export function patchDownstreamReleaseEvent(input: {
  packageName: string;
  version: string;
  repo?: string;
  automations?: string[];
  receivedAt?: string;
}): AutomationEvent<Record<string, unknown>> {
  return {
    id: `${serviceSource}:downstream.release:${input.packageName}:${input.version}`,
    type: "downstream.release",
    source: serviceSource,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    automations: input.automations,
    payload: {
      packageName: input.packageName,
      version: input.version,
      tag: input.version,
      ...(input.repo ? { repo: input.repo } : {}),
    },
  };
}

export async function dispatchWorkspaceEvent(
  event: AutomationEvent,
  target: Partial<FeedWorkspaceAutomationTarget> = {},
  config: WorkspaceDispatchConfig = {},
): Promise<AutomationDispatchRecord> {
  return (await dispatchWorkspaceEventDetailed(event, target, config)).record;
}

export async function dispatchWorkspaceEventDetailed(
  event: AutomationEvent,
  target: Partial<FeedWorkspaceAutomationTarget> = {},
  config: WorkspaceDispatchConfig = {},
): Promise<WorkspaceDispatchOutcome> {
  return await runAutomationDispatch("dispatch", event, target, config);
}

export async function replayWorkspaceEvent(
  event: AutomationEvent,
  target: Partial<FeedWorkspaceAutomationTarget> = {},
  config: WorkspaceDispatchConfig = {},
): Promise<AutomationDispatchRecord> {
  return (await replayWorkspaceEventDetailed(event, target, config)).record;
}

export async function replayWorkspaceEventDetailed(
  event: AutomationEvent,
  target: Partial<FeedWorkspaceAutomationTarget> = {},
  config: WorkspaceDispatchConfig = {},
): Promise<WorkspaceReplayOutcome> {
  return await runAutomationDispatch("replay", event, target, config);
}

export async function listWorkspaceRuns(_config: WorkspaceDispatchConfig = {}, _options: {
  eventId?: string;
  status?: string;
  limit?: number;
} = {}): Promise<{ runs: AutomationRunView[] }> {
  return { runs: [] };
}

export async function getWorkspaceRun(runId: string, _config: WorkspaceDispatchConfig = {}): Promise<AutomationRunView> {
  throw new Error(`workspace automation run lookup is not available for ${runId}`);
}

export async function getWorkspaceEvent(eventId: string, _config: WorkspaceDispatchConfig = {}) {
  throw new Error(`workspace automation event lookup is not available for ${eventId}`);
}

export async function listWorkspaceEvents(_config: WorkspaceDispatchConfig = {}, _options: {
  type?: string;
  limit?: number;
} = {}) {
  return { events: [] };
}

export async function dispatchWorkspaceEventForFeedSignal(
  signal: FeedSignal,
  config: WorkspaceDispatchConfig = {},
): Promise<{ event?: AutomationEvent<Record<string, unknown>>; record?: AutomationDispatchRecord; result?: AutomationDispatchResult }> {
  if (!isWorkspaceAutomationTarget(signal.target)) {
    return {};
  }

  const event = automationEventForFeedSignal(signal);
  if (!event) {
    return {};
  }

  const outcome = await dispatchWorkspaceEventDetailed(event, signal.target, config);
  return { event, ...outcome };
}

export function maintenanceAttemptForWorkspaceDispatch(
  event: AutomationEvent,
  record: AutomationDispatchRecord,
  runs: AutomationRunView[] = [],
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
  runs: AutomationRunView[],
  updatedAt = new Date().toISOString(),
): MaintenanceAttemptRecord {
  if (runs.length === 0) {
    return attempt;
  }

  const statuses = Object.fromEntries(
    runs.map((run) => [run.id, String(run.effectiveStatus ?? run.status ?? "unknown")]),
  );
  const resultPayloads = runs
    .map((run) => automationResultPayload(run.resultPayload))
    .filter((payload): payload is Record<string, unknown> => payload !== undefined);
  const status = statusFromRuns(runs);
  const message = newestString(resultPayloads.map((payload) => payload.message)) ?? attempt.message;
  const candidateRefs = uniqueCandidateRefs([
    ...attempt.candidateRefs,
    ...resultPayloads.flatMap(candidateRefsFromAutomationResult),
  ]);
  const workspaceThreadRefs = uniqueThreadRefs([
    ...(attempt.workspaceThreadRefs ?? []),
    ...runs.flatMap(threadRefsFromRun),
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
    ...(workspaceThreadRefs.length > 0 ? { workspaceThreadRefs } : {}),
    ...(message ? { message } : {}),
    ...(error ? { error } : {}),
    updatedAt,
    ...(completedAt ? { completedAt } : {}),
  };
}

async function runAutomationDispatch(
  operation: "dispatch" | "replay",
  event: AutomationEvent,
  target: Partial<FeedWorkspaceAutomationTarget>,
  config: WorkspaceDispatchConfig,
): Promise<WorkspaceDispatchOutcome> {
  const env = config.env ?? process.env;
  const automationNames = targetAutomations(event, target, env);
  const execution = selectWorkspaceExecution(target, config);
  if (automationNames.length === 0) {
    return {
      result: { eventId: event.id, runIds: [], matched: 0, runs: [] },
      record: {
        eventId: event.id,
        eventType: event.type,
        operation,
        target: execution.target,
        transport: execution.transport,
        ...executionRecordFields(execution),
        status: "skipped",
        matched: 0,
        runIds: [],
        error: "No workspace automations were configured for this event.",
        createdAt: new Date().toISOString(),
      },
    };
  }

  const runs: AutomationRunView[] = [];
  for (const automationName of automationNames) {
    runs.push(await runNamedAutomation(automationName, event, target, config));
  }
  const failed = runs.find((run) => run.status === "failed");
  return {
    result: {
      eventId: event.id,
      runIds: runs.map((run) => run.id),
      matched: automationNames.length,
      runs,
    },
    record: {
      eventId: event.id,
      eventType: event.type,
      operation,
      target: execution.target,
      transport: execution.transport,
      ...executionRecordFields(execution),
      status: failed ? "failed" : "dispatched",
      runIds: runs.map((run) => run.id),
      matched: automationNames.length,
      ...(failed?.error ? { error: failed.error } : {}),
      createdAt: new Date().toISOString(),
    },
  };
}

async function runNamedAutomation(
  automationName: string,
  event: AutomationEvent,
  target: Partial<FeedWorkspaceAutomationTarget>,
  config: WorkspaceDispatchConfig,
): Promise<AutomationRunView> {
  const startedAt = new Date().toISOString();
  const id = `${event.id}:${automationName}:${startedAt}`;
  let backend: Awaited<ReturnType<typeof createAutomationHostBackend>> | undefined;
  try {
    const runTarget = await resolveTurnAutomationTarget(automationName, { cwd: config.cwd ?? process.cwd() });
    const execution = selectWorkspaceExecution(target, config);
    const getBackend = async () => {
      backend ??= await createAutomationHostBackend(target, config);
      return backend;
    };
    const run = await runTurnAutomationScript({
      scriptPath: runTarget.scriptPath,
      automation: runTarget.automation,
      event,
      prompt: runTarget.prompt,
      cwd: runTarget.cwd ?? config.cwd,
      timeoutMs: 90_000,
      host: createTurnAutomationHost({
        via: execution.transport === "app-server" ? "app-server" : "workspace",
        appRequest: async (method, params) => await (await getBackend()).appRequest(method, params),
        workspaceRequest: execution.transport !== "app-server"
          ? async (method, params) => {
            const current = await getBackend();
            if (!current.workspaceRequest) {
              throw new Error("Workspace backend did not expose workspace requests");
            }
            return await current.workspaceRequest(method, params);
          }
          : undefined,
        defaults: {
          prompt: runTarget.prompt,
          cwd: runTarget.cwd ?? config.cwd,
          skills: runTarget.skills,
        },
      }),
    });
    return runViewFromAutomationRun(id, event, automationName, run, startedAt);
  } catch (error) {
    return {
      id,
      eventId: event.id,
      automationName,
      status: "failed",
      effectiveStatus: "failed",
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } finally {
    backend?.close();
  }
}

function executionRecordFields(
  execution: ReturnType<typeof selectWorkspaceExecution>,
): Pick<AutomationDispatchRecord, "workspaceBackendUrl" | "sshTarget" | "remoteCwd"> {
  if (execution.transport === "workspace-ws") {
    return { workspaceBackendUrl: execution.workspaceBackendUrl };
  }
  if (execution.transport === "ssh-remote-agent") {
    return {
      sshTarget: execution.sshTarget,
      ...(execution.remoteCwd ? { remoteCwd: execution.remoteCwd } : {}),
    };
  }
  return {};
}

function runViewFromAutomationRun(
  id: string,
  event: AutomationEvent,
  automationName: string,
  run: TurnAutomationRun,
  startedAt: string,
): AutomationRunView {
  const payload = automationResultPayload(run.result);
  const status = stringValue(payload?.status) ?? "completed";
  return {
    id,
    eventId: event.id,
    automationName,
    status,
    effectiveStatus: status,
    resultPayload: run.result,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

function targetAutomations(
  event: AutomationEvent,
  target: Partial<FeedWorkspaceAutomationTarget>,
  env: Record<string, string | undefined>,
): string[] {
  return uniqueStrings([
    ...(target.automations ?? []),
    ...(event.automations ?? []),
    ...commaList(env.PATCH_AUTOMATIONS),
  ]);
}

function commaList(value: string | undefined): string[] {
  return value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function automationResultPayload(value: unknown): Record<string, unknown> | undefined {
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

function statusFromRuns(runs: AutomationRunView[]): MaintenanceAttemptStatus {
  const statuses = runs.map((run) => resultStatus(run));
  if (statuses.some((status) => status === "needs_intervention")) return "needs_intervention";
  if (statuses.some((status) => status === "blocked")) return "blocked";
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "changed")) return "changed";
  if (statuses.length > 0 && statuses.every((status) => status === "skipped")) return "skipped";
  if (statuses.length > 0 && statuses.every((status) => status === "completed" || status === "skipped" || status === "started")) return "started";
  return "started";
}

function resultStatus(run: AutomationRunView): string {
  const payload = automationResultPayload(run.resultPayload);
  return stringValue(payload?.status) ?? String(run.effectiveStatus ?? run.status ?? "started");
}

function candidateRefsFromAutomationResult(result: Record<string, unknown>): CandidateRefRecord[] {
  const artifacts = recordValue(result.artifacts);
  const candidates = [
    ...arrayValue(artifacts.candidateRefs),
    ...arrayValue(artifacts.candidates),
    artifacts.candidateRef,
  ];
  return candidates.flatMap(candidateRefValue);
}

function threadRefsFromRun(run: AutomationRunView): WorkspaceThreadRefRecord[] {
  const payload = automationResultPayload(run.resultPayload);
  return threadRefsFromValue(payload, {
    runId: run.id,
    automationName: run.automationName,
  });
}

function threadRefsFromValue(
  value: unknown,
  source: Partial<WorkspaceThreadRefRecord>,
  label?: string,
): WorkspaceThreadRefRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => threadRefsFromValue(entry, source, label));
  }
  const record = recordValue(value);
  const refs: WorkspaceThreadRefRecord[] = [];
  const threadId = stringValue(record.threadId);
  if (threadId) {
    refs.push({
      ...source,
      threadId,
      ...(stringValue(record.turnId) ? { turnId: stringValue(record.turnId) } : {}),
      ...(stringValue(record.turnStatus) ? { turnStatus: stringValue(record.turnStatus) } : {}),
      ...(stringValue(record.label) ? { label: stringValue(record.label) } : label ? { label } : {}),
    });
  }
  for (const [key, entry] of Object.entries(record)) {
    if (key === "threadId") {
      continue;
    }
    refs.push(...threadRefsFromValue(entry, source, key));
  }
  return refs;
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

function uniqueThreadRefs(refs: WorkspaceThreadRefRecord[]): WorkspaceThreadRefRecord[] {
  const seen = new Set<string>();
  const result: WorkspaceThreadRefRecord[] = [];
  for (const ref of refs) {
    const key = [
      ref.runId ?? "",
      ref.automationName ?? "",
      ref.label ?? "",
      ref.threadId,
      ref.turnId ?? "",
    ].join("\0");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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
