import { describe, expect, test } from "bun:test";
import type { FlowRunView } from "@peezy.tech/codex-flows/flow-runtime/client";
import {
  maintenanceAttemptForWorkspaceDispatch,
  maintenanceAttemptWithWorkspaceRuns,
  patchUpstreamReleaseEvent,
} from "../src/flow";
import type {
  CandidateRefRecord,
  FlowDispatchRecord,
  MaintenanceAttemptRecord,
} from "../src/types";

describe("maintenance attempt sync", () => {
  test("aggregates multi-run fanout statuses and candidate refs", () => {
    const attempt = baseAttempt();
    const next = maintenanceAttemptWithWorkspaceRuns(attempt, [
      flowRun("run-completed", "completed", [candidate("refs/heads/a", "aaa")]),
      flowRun("run-changed", "changed", [candidate("refs/heads/b", "bbb")]),
    ], "2026-05-16T00:10:00.000Z");

    expect(next.status).toBe("changed");
    expect(next.workspaceRunIds).toEqual(["run-completed", "run-changed"]);
    expect(next.workspaceRunStatuses).toEqual({
      "run-completed": "completed",
      "run-changed": "changed",
    });
    expect(next.candidateRefs).toMatchObject([
      { ref: "refs/heads/a", sha: "aaa" },
      { ref: "refs/heads/b", sha: "bbb" },
    ]);
    expect(next.completedAt).toBe("2026-05-16T00:10:00.000Z");
  });

  test("uses failure precedence across partial fanout", () => {
    expect(statusFor(["completed", "skipped"])).toBe("completed");
    expect(statusFor(["skipped", "skipped"])).toBe("skipped");
    expect(statusFor(["completed", "changed"])).toBe("changed");
    expect(statusFor(["changed", "failed"])).toBe("failed");
    expect(statusFor(["failed", "blocked"])).toBe("blocked");
    expect(statusFor(["blocked", "needs_intervention"])).toBe("needs_intervention");
  });

  test("preserves successful candidates when another run fails", () => {
    const next = maintenanceAttemptWithWorkspaceRuns(baseAttempt(), [
      flowRun("run-ok", "completed", [candidate("refs/heads/candidate", "abc")]),
      flowRun("run-failed", "failed", [], "release verification failed"),
    ]);

    expect(next.status).toBe("failed");
    expect(next.error).toBe("release verification failed");
    expect(next.candidateRefs).toMatchObject([
      { ref: "refs/heads/candidate", sha: "abc" },
    ]);
  });

  test("records replay attempts with workspace run results", () => {
    const event = patchUpstreamReleaseEvent({
      repo: "openai/codex",
      tag: "rust-v0.130.0",
      receivedAt: "2026-05-16T00:00:00.000Z",
    });
    const record: FlowDispatchRecord = {
      eventId: event.id,
      eventType: event.type,
      operation: "replay",
      target: "workspace-backend",
      transport: "workspace-ws",
      workspaceBackendUrl: "ws://127.0.0.1:3586",
      status: "dispatched",
      runIds: ["run-a", "run-b"],
      matched: 2,
      createdAt: "2026-05-16T00:05:00.000Z",
    };

    const attempt = maintenanceAttemptForWorkspaceDispatch(event, record, [
      flowRun("run-a", "completed"),
      flowRun("run-b", "changed", [candidate("refs/heads/codex-candidate", "def")]),
    ]);

    expect(attempt.id).toBe(`${event.id}:replay:${record.createdAt}`);
    expect(attempt.operation).toBe("replay");
    expect(attempt.status).toBe("changed");
    expect(attempt.upstreamRepo).toBe("openai/codex");
    expect(attempt.upstreamTag).toBe("rust-v0.130.0");
    expect(attempt.workspaceRunIds).toEqual(["run-a", "run-b"]);
    expect(attempt.candidateRefs).toMatchObject([
      { ref: "refs/heads/codex-candidate", sha: "def" },
    ]);
  });
});

function statusFor(statuses: string[]): string {
  return maintenanceAttemptWithWorkspaceRuns(
    baseAttempt(),
    statuses.map((status, index) => flowRun(`run-${index}`, status)),
  ).status;
}

function baseAttempt(): MaintenanceAttemptRecord {
  return {
    id: "attempt-1",
    eventId: "event-1",
    eventType: "upstream.release",
    operation: "dispatch",
    status: "started",
    upstreamRepo: "openai/codex",
    upstreamTag: "rust-v0.130.0",
    workspaceRunIds: [],
    candidateRefs: [],
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:00.000Z",
  };
}

function flowRun(
  id: string,
  status: string,
  candidateRefs: CandidateRefRecord[] = [],
  message = `${id} ${status}`,
): FlowRunView {
  return {
    id,
    eventId: "event-1",
    flowName: "test-flow",
    stepName: id,
    status,
    effectiveStatus: status,
    completedAt: "2026-05-16T00:10:00.000Z",
    resultPayload: {
      status,
      message,
      artifacts: { candidateRefs },
    },
  } as FlowRunView;
}

function candidate(ref: string, sha: string): CandidateRefRecord {
  return {
    kind: "branch",
    repo: "peezy-tech/codex",
    remote: "local",
    ref,
    sha,
    pushed: false,
  };
}
