import type { FeedJob, FeedSignal, GitWebhookEvent, QueuedJob } from "./types";

type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

type DiscordEmbed = {
  title: string;
  description?: string;
  url?: string;
  color: number;
  fields: DiscordEmbedField[];
  timestamp: string;
  footer: {
    text: string;
  };
};

type DiscordPayload = {
  username: string;
  embeds: DiscordEmbed[];
};

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type DiscordConfig = {
  webhookUrl?: string;
  notifyEvents: Set<string>;
};

export type DiscordNotification = {
  event?: GitWebhookEvent;
  job?: QueuedJob | FeedJob | null;
  signal?: FeedSignal;
};

const defaultNotifyEvents = ["push", "pull_request", "release"];

export function parseDiscordConfig(input: {
  webhookUrl?: string;
  notifyEvents?: string;
}): DiscordConfig {
  const notifyEvents = new Set(
    (input.notifyEvents?.trim() ? input.notifyEvents : defaultNotifyEvents.join(","))
      .split(",")
      .map((event) => event.trim())
      .filter(Boolean),
  );

  return {
    webhookUrl: input.webhookUrl?.trim() || undefined,
    notifyEvents,
  };
}

function branchName(ref?: string): string | undefined {
  return ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}

function shortSha(sha?: string): string | undefined {
  return sha ? sha.slice(0, 12) : undefined;
}

function eventTitle(event: GitWebhookEvent): string {
  const repo = event.repo?.fullName ?? "unknown repo";
  if (event.event === "push") {
    return `[${event.provider}] ${repo} push${branchName(event.ref) ? ` to ${branchName(event.ref)}` : ""}`;
  }
  if (event.event === "pull_request") {
    return `[${event.provider}] ${repo} pull_request${event.action ? ` ${event.action}` : ""}`;
  }
  if (event.event === "release") {
    return `[${event.provider}] ${repo} release${event.action ? ` ${event.action}` : ""}`;
  }
  return `[${event.provider}] ${repo} ${event.event}`;
}

function feedTitle(signal: FeedSignal): string {
  const branch = signal.ref?.startsWith("refs/heads/") ? signal.ref.slice("refs/heads/".length) : undefined;
  if (signal.event === "push") {
    return `[${signal.provider}] ${signal.repo.fullName} upstream update${branch ? ` on ${branch}` : ""}`;
  }
  return `[${signal.provider}] ${signal.repo.fullName} release ${signal.title}`;
}

function rawRecord(event: GitWebhookEvent): Record<string, unknown> {
  return typeof event.raw === "object" && event.raw !== null ? event.raw as Record<string, unknown> : {};
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function eventUrl(event: GitWebhookEvent): string | undefined {
  const raw = rawRecord(event);
  if (event.event === "push") {
    const headCommit = objectRecord(raw.head_commit);
    return stringValue(headCommit?.url) ?? stringValue(raw.compare_url);
  }
  if (event.event === "pull_request") {
    return stringValue(objectRecord(raw.pull_request)?.html_url);
  }
  if (event.event === "release") {
    return stringValue(objectRecord(raw.release)?.html_url);
  }
  return undefined;
}

function field(name: string, value?: string, inline = true): DiscordEmbedField | null {
  if (!value) return null;
  return { name, value: value.slice(0, 1024), inline };
}

export function buildDiscordPayload(input: DiscordNotification): DiscordPayload {
  if (input.signal) {
    const { signal, job } = input;
    const fields = [
      field("Provider", signal.provider),
      field("Repo", signal.repo.fullName),
      field("Event", signal.event),
      field("Branch", branchName(signal.ref)),
      field("Author", signal.author),
      field("SHA", shortSha(signal.sha)),
      field("Queued", job ? job.kind : undefined),
      field("Source", signal.sourceId, false),
    ].filter((item): item is DiscordEmbedField => item !== null);

    return {
      username: "patchbay",
      embeds: [
        {
          title: feedTitle(signal).slice(0, 256),
          description: signal.title.slice(0, 2048),
          url: signal.url,
          color: signal.provider === "github" ? 0x24292f : 0x2185d0,
          fields,
          timestamp: signal.publishedAt,
          footer: {
            text: "feed watcher",
          },
        },
      ],
    };
  }

  if (!input.event) {
    throw new Error("Discord notification missing event or signal");
  }

  const { event, job } = input;
  const fields = [
    field("Provider", event.provider),
    field("Repo", event.repo?.fullName),
    field("Event", event.action ? `${event.event}:${event.action}` : event.event),
    field("Branch", branchName(event.ref)),
    field("Sender", event.sender?.username),
    field("SHA", shortSha(event.after)),
    field("Queued", job ? job.kind : undefined),
    field("Delivery", event.deliveryId, false),
  ].filter((item): item is DiscordEmbedField => item !== null);

  return {
    username: "patchbay",
    embeds: [
      {
        title: eventTitle(event).slice(0, 256),
        url: eventUrl(event),
        color: event.provider === "github" ? 0x24292f : 0xf97316,
        fields,
        timestamp: event.receivedAt,
        footer: {
          text: "patchbay",
        },
      },
    ],
  };
}

export async function notifyDiscord(
  config: DiscordConfig,
  notification: DiscordNotification,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const eventName = notification.signal?.event ?? notification.event?.event;
  if (!config.webhookUrl || !eventName || !config.notifyEvents.has(eventName)) {
    return;
  }

  const response = await fetchImpl(config.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildDiscordPayload(notification)),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook returned ${response.status}`);
  }
}
