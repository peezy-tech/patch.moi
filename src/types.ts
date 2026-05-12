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
