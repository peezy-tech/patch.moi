import type { GitWebhookEvent, NormalizedEventName } from "../types";

type JojoPayload = {
  action?: string;
  ref?: string;
  before?: string;
  after?: string;
  repository?: {
    name?: string;
    full_name?: string;
    clone_url?: string;
    ssh_url?: string;
    default_branch?: string;
    owner?: {
      login?: string;
      username?: string;
      name?: string;
    };
  };
  sender?: {
    login?: string;
    username?: string;
    html_url?: string;
  };
};

function normalizeEventName(providerEvent: string): NormalizedEventName {
  if (providerEvent === "ping") return "ping";
  if (providerEvent === "push") return "push";
  if (providerEvent === "pull_request") return "pull_request";
  if (providerEvent === "workflow_run") return "workflow_run";
  if (providerEvent === "release") return "release";
  return "unknown";
}

export function normalizeJojoEvent(input: {
  providerEvent: string;
  deliveryId: string;
  receivedAt: string;
  payload: JojoPayload;
}): GitWebhookEvent {
  const { payload } = input;
  const repoOwner = payload.repository?.owner?.login ?? payload.repository?.owner?.username ?? payload.repository?.owner?.name;
  const repoName = payload.repository?.name;
  const fullName = payload.repository?.full_name ?? (repoOwner && repoName ? `${repoOwner}/${repoName}` : undefined);
  const senderUsername = payload.sender?.login ?? payload.sender?.username;

  return {
    provider: "jojo",
    event: normalizeEventName(input.providerEvent),
    providerEvent: input.providerEvent,
    deliveryId: input.deliveryId,
    receivedAt: input.receivedAt,
    repo: repoOwner && repoName && fullName
      ? {
          owner: repoOwner,
          name: repoName,
          fullName,
          cloneUrl: payload.repository?.clone_url,
          sshUrl: payload.repository?.ssh_url,
          defaultBranch: payload.repository?.default_branch,
        }
      : undefined,
    sender: senderUsername
      ? {
          username: senderUsername,
          htmlUrl: payload.sender?.html_url,
        }
      : undefined,
    ref: payload.ref,
    before: payload.before,
    after: payload.after,
    action: payload.action,
    raw: payload,
  };
}
