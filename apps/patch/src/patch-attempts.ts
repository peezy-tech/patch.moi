import {
  getWorkspaceRun,
  listWorkspaceRuns,
  patchAttemptWithWorkspaceRuns,
  type WorkspaceDispatchConfig,
} from "./automation";
import { EventStore } from "./queue";
import type { CandidateRefRecord, PatchAttemptRecord, PatchWorkRecord } from "./types";

export async function syncPatchAttempt(
  store: EventStore,
  attempt: PatchAttemptRecord,
  config: WorkspaceDispatchConfig = {},
): Promise<PatchAttemptRecord> {
  const runs = attempt.workspaceRunIds.length > 0
    ? await Promise.all(attempt.workspaceRunIds.map((runId) => getWorkspaceRun(runId, config)))
    : (await listWorkspaceRuns(config, { eventId: attempt.eventId })).runs;
  const next = patchAttemptWithWorkspaceRuns(attempt, runs);
  if (patchAttemptChanged(attempt, next)) {
    await store.appendPatchAttempt(next);
  }
  await syncPatchWorkFromAttempt(store, next);
  return next;
}

export function patchAttemptChanged(
  before: PatchAttemptRecord,
  after: PatchAttemptRecord,
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

async function syncPatchWorkFromAttempt(store: EventStore, attempt: PatchAttemptRecord): Promise<void> {
  const work = await store.getPatchWork(attempt.workId);
  if (!work) {
    return;
  }
  const next: PatchWorkRecord = {
    ...work,
    status: attempt.status === "started" ? "active" : attempt.status,
    candidateRefs: uniqueCandidateRefs([...work.candidateRefs, ...attempt.candidateRefs]),
    attemptIds: uniqueStrings([...work.attemptIds, attempt.id]),
    updatedAt: attempt.updatedAt,
    ...(attempt.completedAt ? { completedAt: attempt.completedAt } : {}),
  };
  if (JSON.stringify(next) !== JSON.stringify(work)) {
    await store.appendPatchWork(next);
  }
}

function uniqueCandidateRefs(refs: CandidateRefRecord[]): CandidateRefRecord[] {
  const seen = new Set<string>();
  const result: CandidateRefRecord[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.repo ?? ""}:${ref.remote ?? ""}:${ref.ref}:${ref.sha ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
