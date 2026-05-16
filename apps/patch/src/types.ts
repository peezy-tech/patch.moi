export type FeedProvider = "codeberg" | "github" | "jojo";

export type FeedEventName = "push" | "release";

export type FeedForkSyncTarget = {
  provider: FeedProvider;
  repoFullName: string;
  branch: string;
  mode: "notify_only" | "fork_sync";
};

export type FeedWorkspaceFlowTarget = {
  mode: "workspace_flow" | "flow_dispatch";
  eventType: string;
  workspaceUrl?: string;
  workspaceUrlEnv?: string;
  workspaceSecretEnv?: string;
  dispatchUrl?: string;
  dispatchUrlEnv?: string;
  dispatchSecretEnv?: string;
  payload?: Record<string, unknown>;
};

export type FeedSourceConfig = {
  id: string;
  provider: FeedProvider;
  url: string;
  event: FeedEventName;
  repo: {
    owner: string;
    name: string;
    fullName: string;
    webUrl: string;
    defaultBranch?: string;
  };
  target?: FeedForkSyncTarget | FeedWorkspaceFlowTarget;
  pollIntervalSeconds?: number;
  primeOnly?: boolean;
};

export type FeedSignal = {
  sourceId: string;
  provider: FeedProvider;
  event: FeedEventName;
  entryId: string;
  title: string;
  url?: string;
  author?: string;
  publishedAt: string;
  repo: FeedSourceConfig["repo"];
  ref?: string;
  sha?: string;
  target?: FeedSourceConfig["target"];
  raw: unknown;
};

export type FeedJob = {
  id: string;
  kind: "fork_sync";
  sourceId: string;
  provider: FeedProvider;
  upstreamRepoFullName: string;
  targetRepoFullName: string;
  branch: string;
  upstreamRef?: string;
  upstreamSha?: string;
  entryId: string;
  url?: string;
  createdAt: string;
};

export type FlowEvent<T = unknown> = {
  id: string;
  type: string;
  source?: string;
  occurredAt?: string;
  receivedAt: string;
  payload: T;
};

export type FlowDispatchRecord = {
  eventId: string;
  eventType: string;
  operation?: "dispatch" | "replay";
  target?: "local" | "workspace-backend";
  transport?: "local" | "workspace-http" | "workspace-ws";
  workspaceBackendUrl?: string;
  url?: string;
  status: "dispatched" | "failed" | "skipped";
  runIds?: string[];
  matched?: number;
  idempotent?: boolean;
  httpStatus?: number;
  error?: string;
  createdAt: string;
};

export type WorkspaceDispatchRecord = FlowDispatchRecord;

export type CandidateRefRecord = {
  kind: string;
  ref: string;
  repo?: string;
  remote?: string;
  sha?: string;
  url?: string;
  pushed?: boolean;
};

export type MaintenanceAttemptStatus =
  | "started"
  | "completed"
  | "changed"
  | "needs_intervention"
  | "blocked"
  | "failed"
  | "skipped";

export type MaintenanceAttemptRecord = {
  id: string;
  eventId: string;
  eventType: string;
  operation: "dispatch" | "replay";
  status: MaintenanceAttemptStatus;
  upstreamRepo?: string;
  upstreamRef?: string;
  upstreamSha?: string;
  upstreamTag?: string;
  workspaceBackendUrl?: string;
  workspaceRunIds: string[];
  workspaceRunStatuses?: Record<string, string>;
  candidateRefs: CandidateRefRecord[];
  message?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};
