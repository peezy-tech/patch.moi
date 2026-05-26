import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  FeedJob,
  FeedSignal,
  AutomationDispatchRecord,
  AutomationEvent,
  MaintenanceAttemptRecord,
  WorkspaceDispatchRecord,
} from "./types";

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
  readonly automationEventsPath: string;
  readonly workspaceDispatchesPath: string;
  readonly maintenanceAttemptsPath: string;

  constructor(dataDir: string) {
    this.feedEventsPath = join(dataDir, "feed-events.jsonl");
    this.feedJobsPath = join(dataDir, "feed-jobs.jsonl");
    this.automationEventsPath = join(dataDir, "automation-events.jsonl");
    this.workspaceDispatchesPath = join(dataDir, "workspace-dispatches.jsonl");
    this.maintenanceAttemptsPath = join(dataDir, "maintenance-attempts.jsonl");
  }

  async appendFeedSignal(signal: FeedSignal): Promise<void> {
    await appendJsonLine(this.feedEventsPath, signal);
  }

  async appendFeedJob(job: FeedJob): Promise<void> {
    await appendJsonLine(this.feedJobsPath, job);
  }

  async appendAutomationEvent(event: AutomationEvent): Promise<void> {
    await appendJsonLine(this.automationEventsPath, event);
  }

  async appendWorkspaceDispatch(record: WorkspaceDispatchRecord): Promise<void> {
    await appendJsonLine(this.workspaceDispatchesPath, record);
  }

  async appendMaintenanceAttempt(record: MaintenanceAttemptRecord): Promise<void> {
    await appendJsonLine(this.maintenanceAttemptsPath, record);
  }

  async listAutomationEvents(options: { limit?: number; type?: string } = {}): Promise<AutomationEvent[]> {
    const events = await readJsonLines<AutomationEvent>(this.automationEventsPath);
    return limitNewest(
      options.type ? events.filter((event) => event.type === options.type) : events,
      options.limit,
    );
  }

  async getAutomationEvent(eventId: string): Promise<AutomationEvent | undefined> {
    const events = await readJsonLines<AutomationEvent>(this.automationEventsPath);
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index]?.id === eventId) {
        return events[index];
      }
    }
    return undefined;
  }

  async listWorkspaceDispatches(options: { limit?: number; eventId?: string; status?: WorkspaceDispatchRecord["status"] } = {}): Promise<WorkspaceDispatchRecord[]> {
    const records = await readJsonLines<WorkspaceDispatchRecord>(this.workspaceDispatchesPath);
    return limitNewest(
      records.filter((record) =>
        (!options.eventId || record.eventId === options.eventId) &&
        (!options.status || record.status === options.status),
      ),
      options.limit,
    );
  }

  async listMaintenanceAttempts(options: {
    limit?: number;
    eventId?: string;
    status?: MaintenanceAttemptRecord["status"];
  } = {}): Promise<MaintenanceAttemptRecord[]> {
    const records = latestRecordsById(await readJsonLines<MaintenanceAttemptRecord>(this.maintenanceAttemptsPath));
    return limitNewest(
      records.filter((record) =>
        (!options.eventId || record.eventId === options.eventId) &&
        (!options.status || record.status === options.status),
      ),
      options.limit,
    );
  }

  async getMaintenanceAttempt(id: string): Promise<MaintenanceAttemptRecord | undefined> {
    const records = await readJsonLines<MaintenanceAttemptRecord>(this.maintenanceAttemptsPath);
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (records[index]?.id === id) {
        return records[index];
      }
    }
    return undefined;
  }
}

function latestRecordsById<T extends { id: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  const latest: T[] = [];
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || seen.has(record.id)) {
      continue;
    }
    seen.add(record.id);
    latest.push(record);
  }
  return latest.reverse();
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
