import {
  getWorkspaceRun,
  listWorkspaceRuns,
  maintenanceAttemptWithWorkspaceRuns,
  type WorkspaceDispatchConfig,
} from "./flow";
import { EventStore } from "./queue";
import type { MaintenanceAttemptRecord } from "./types";

export async function syncMaintenanceAttempt(
  store: EventStore,
  attempt: MaintenanceAttemptRecord,
  config: WorkspaceDispatchConfig = {},
): Promise<MaintenanceAttemptRecord> {
  const runs = attempt.workspaceRunIds.length > 0
    ? await Promise.all(attempt.workspaceRunIds.map((runId) => getWorkspaceRun(runId, config)))
    : (await listWorkspaceRuns(config, { eventId: attempt.eventId })).runs;
  const next = maintenanceAttemptWithWorkspaceRuns(attempt, runs);
  if (maintenanceAttemptChanged(attempt, next)) {
    await store.appendMaintenanceAttempt(next);
  }
  return next;
}

export function maintenanceAttemptChanged(
  before: MaintenanceAttemptRecord,
  after: MaintenanceAttemptRecord,
): boolean {
  return JSON.stringify({
    status: before.status,
    workspaceRunIds: before.workspaceRunIds,
    workspaceRunStatuses: before.workspaceRunStatuses,
    candidateRefs: before.candidateRefs,
    message: before.message,
    error: before.error,
    completedAt: before.completedAt,
  }) !== JSON.stringify({
    status: after.status,
    workspaceRunIds: after.workspaceRunIds,
    workspaceRunStatuses: after.workspaceRunStatuses,
    candidateRefs: after.candidateRefs,
    message: after.message,
    error: after.error,
    completedAt: after.completedAt,
  });
}
