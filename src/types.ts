export type Provider = "jojo" | "github";

export type NormalizedEventName =
  | "ping"
  | "push"
  | "pull_request"
  | "workflow_run"
  | "release"
  | "unknown";

export type GitWebhookEvent = {
  provider: Provider;
  event: NormalizedEventName;
  providerEvent: string;
  deliveryId: string;
  receivedAt: string;
  repo?: {
    owner: string;
    name: string;
    fullName: string;
    cloneUrl?: string;
    sshUrl?: string;
    defaultBranch?: string;
  };
  sender?: {
    username: string;
    htmlUrl?: string;
  };
  ref?: string;
  before?: string;
  after?: string;
  action?: string;
  raw: unknown;
};

export type QueuedJob = {
  id: string;
  kind: "main_push";
  provider: Provider;
  repoFullName: string;
  ref: string;
  sha: string;
  deliveryId: string;
  createdAt: string;
};

export type FeedProvider = "codeberg" | "github" | "jojo";

export type FeedEventName = "push" | "release";

export type FeedForkSyncTarget = {
  provider: FeedProvider;
  repoFullName: string;
  branch: string;
  mode: "notify_only" | "fork_sync";
};

export type FeedFlowDispatchTarget = {
  mode: "flow_dispatch";
  eventType: string;
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
  target?: FeedForkSyncTarget | FeedFlowDispatchTarget;
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
  url?: string;
  status: "dispatched" | "failed" | "skipped";
  httpStatus?: number;
  error?: string;
  createdAt: string;
};
