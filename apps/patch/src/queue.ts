import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FeedJob, FeedSignal, FlowDispatchRecord, FlowEvent } from "./types";

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function limitNewest<T>(items: T[], limit = 50): T[] {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  return items.slice(-safeLimit).reverse();
}

export class EventStore {
  readonly feedEventsPath: string;
  readonly feedJobsPath: string;
  readonly flowEventsPath: string;
  readonly flowDispatchesPath: string;

  constructor(dataDir: string) {
    this.feedEventsPath = join(dataDir, "feed-events.jsonl");
    this.feedJobsPath = join(dataDir, "feed-jobs.jsonl");
    this.flowEventsPath = join(dataDir, "flow-events.jsonl");
    this.flowDispatchesPath = join(dataDir, "flow-dispatches.jsonl");
  }

  async appendFeedSignal(signal: FeedSignal): Promise<void> {
    await appendJsonLine(this.feedEventsPath, signal);
  }

  async appendFeedJob(job: FeedJob): Promise<void> {
    await appendJsonLine(this.feedJobsPath, job);
  }

  async appendFlowEvent(event: FlowEvent): Promise<void> {
    await appendJsonLine(this.flowEventsPath, event);
  }

  async appendFlowDispatch(record: FlowDispatchRecord): Promise<void> {
    await appendJsonLine(this.flowDispatchesPath, record);
  }

  async listFlowEvents(options: { limit?: number; type?: string } = {}): Promise<FlowEvent[]> {
    const events = await readJsonLines<FlowEvent>(this.flowEventsPath);
    return limitNewest(
      options.type ? events.filter((event) => event.type === options.type) : events,
      options.limit,
    );
  }

  async getFlowEvent(eventId: string): Promise<FlowEvent | undefined> {
    const events = await readJsonLines<FlowEvent>(this.flowEventsPath);
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index]?.id === eventId) {
        return events[index];
      }
    }
    return undefined;
  }

  async listFlowDispatches(options: { limit?: number; eventId?: string; status?: FlowDispatchRecord["status"] } = {}): Promise<FlowDispatchRecord[]> {
    const records = await readJsonLines<FlowDispatchRecord>(this.flowDispatchesPath);
    return limitNewest(
      records.filter((record) =>
        (!options.eventId || record.eventId === options.eventId) &&
        (!options.status || record.status === options.status),
      ),
      options.limit,
    );
  }
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
