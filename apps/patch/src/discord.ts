import type { FeedJob, FeedSignal } from "./types";

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
  enabled: boolean;
  webhookUrl?: string;
  notifyEvents: Set<string>;
};

export type DiscordNotification = {
  signal: FeedSignal;
  job?: FeedJob | null;
};

const defaultNotifyEvents = ["push", "release"];
const serviceName = "patch";

function parseEnabled(value?: string): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

export function parseDiscordConfig(input: {
  enabled?: string;
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
    enabled: parseEnabled(input.enabled),
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

function feedTitle(signal: FeedSignal): string {
  const branch = signal.ref?.startsWith("refs/heads/") ? signal.ref.slice("refs/heads/".length) : undefined;
  if (signal.event === "push") {
    return `[${signal.provider}] ${signal.repo.fullName} upstream update${branch ? ` on ${branch}` : ""}`;
  }
  return `[${signal.provider}] ${signal.repo.fullName} release ${signal.title}`;
}

function field(name: string, value?: string, inline = true): DiscordEmbedField | null {
  if (!value) return null;
  return { name, value: value.slice(0, 1024), inline };
}

export function buildDiscordPayload(input: DiscordNotification): DiscordPayload {
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
    username: serviceName,
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

export async function notifyDiscord(
  config: DiscordConfig,
  notification: DiscordNotification,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const eventName = notification.signal.event;
  if (!config.enabled || !config.webhookUrl || !config.notifyEvents.has(eventName)) {
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
