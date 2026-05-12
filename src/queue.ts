import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FeedJob, FeedSignal, GitWebhookEvent, QueuedJob } from "./types";

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

export class EventStore {
  readonly eventsPath: string;
  readonly jobsPath: string;
  readonly feedEventsPath: string;
  readonly feedJobsPath: string;

  constructor(dataDir: string) {
    this.eventsPath = join(dataDir, "events.jsonl");
    this.jobsPath = join(dataDir, "jobs.jsonl");
    this.feedEventsPath = join(dataDir, "feed-events.jsonl");
    this.feedJobsPath = join(dataDir, "feed-jobs.jsonl");
  }

  async appendEvent(event: GitWebhookEvent): Promise<void> {
    await appendJsonLine(this.eventsPath, event);
  }

  async appendJob(job: QueuedJob): Promise<void> {
    await appendJsonLine(this.jobsPath, job);
  }

  async appendFeedSignal(signal: FeedSignal): Promise<void> {
    await appendJsonLine(this.feedEventsPath, signal);
  }

  async appendFeedJob(job: FeedJob): Promise<void> {
    await appendJsonLine(this.feedJobsPath, job);
  }
}

export function jobForEvent(event: GitWebhookEvent): QueuedJob | null {
  if (event.event !== "push" || event.ref !== "refs/heads/main" || !event.repo || !event.after) {
    return null;
  }

  return {
    id: `${event.provider}:${event.deliveryId}:main_push`,
    kind: "main_push",
    provider: event.provider,
    repoFullName: event.repo.fullName,
    ref: event.ref,
    sha: event.after,
    deliveryId: event.deliveryId,
    createdAt: event.receivedAt,
  };
}

export function jobForFeedSignal(signal: FeedSignal): FeedJob | null {
  if (signal.event !== "release" || signal.target?.mode !== "fork_sync") {
    return null;
  }

  return {
    id: `${signal.provider}:${signal.sourceId}:${signal.entryId}:fork_sync`,
    kind: "fork_sync",
    sourceId: signal.sourceId,
    provider: signal.provider,
    upstreamRepoFullName: signal.repo.fullName,
    targetRepoFullName: signal.target.repoFullName,
    branch: signal.target.branch,
    upstreamRef: signal.ref,
    upstreamSha: signal.sha,
    entryId: signal.entryId,
    url: signal.url,
    createdAt: new Date().toISOString(),
  };
}
