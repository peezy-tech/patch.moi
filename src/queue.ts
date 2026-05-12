import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GitWebhookEvent, QueuedJob } from "./types";

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

export class EventStore {
  readonly eventsPath: string;
  readonly jobsPath: string;

  constructor(dataDir: string) {
    this.eventsPath = join(dataDir, "events.jsonl");
    this.jobsPath = join(dataDir, "jobs.jsonl");
  }

  async appendEvent(event: GitWebhookEvent): Promise<void> {
    await appendJsonLine(this.eventsPath, event);
  }

  async appendJob(job: QueuedJob): Promise<void> {
    await appendJsonLine(this.jobsPath, job);
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
