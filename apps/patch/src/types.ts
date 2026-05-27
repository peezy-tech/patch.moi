export type FeedProvider = "codeberg" | "github" | "jojo" | "npm";

export type FeedEventName = "push" | "release";

export type FeedForkSyncTarget = {
  provider: FeedProvider;
  repoFullName: string;
  branch: string;
  mode: "notify_only" | "fork_sync";
};

export type FeedWorkspaceAutomationTarget = {
  mode: "workspace_automation";
  eventType: string;
  automations: string[];
  workspaceUrl?: string;
  workspaceUrlEnv?: string;
  sshTarget?: string;
  sshTargetEnv?: string;
  remoteCwd?: string;
  remoteCwdEnv?: string;
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
  target?: FeedForkSyncTarget | FeedWorkspaceAutomationTarget;
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

export type AutomationEvent<T = unknown> = {
  id: string;
  type: string;
  source?: string;
  occurredAt?: string;
  receivedAt: string;
  automations?: string[];
  payload: T;
};

export type AutomationDispatchRecord = {
  eventId: string;
  eventType: string;
  operation?: "dispatch" | "replay";
  target?: "local" | "workspace-backend" | "ssh";
  transport?: "app-server" | "workspace-ws" | "ssh-remote-agent";
  workspaceBackendUrl?: string;
  sshTarget?: string;
  remoteCwd?: string;
  status: "dispatched" | "failed" | "skipped";
  runIds?: string[];
  matched?: number;
  error?: string;
  createdAt: string;
};

export type WorkspaceDispatchRecord = AutomationDispatchRecord;

export type CandidateRefRecord = {
  kind: string;
  ref: string;
  repo?: string;
  remote?: string;
  sha?: string;
  url?: string;
  pushed?: boolean;
};

export type WorkspaceThreadRefRecord = {
  threadId: string;
  turnId?: string;
  turnStatus?: string;
  label?: string;
  runId?: string;
  automationName?: string;
};

export type AutomationRunView = {
  id: string;
  eventId: string;
  automationName: string;
  status: string;
  effectiveStatus?: string;
  resultPayload?: unknown;
  error?: string;
  startedAt: string;
  completedAt?: string;
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
  workspaceThreadRefs?: WorkspaceThreadRefRecord[];
  message?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};
