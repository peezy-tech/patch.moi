import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { runCli } from "../src/cli";
import { EventStore } from "../src/queue";

const workspaceRoot = join(import.meta.dir, "../../..");

describe("patch.moi CLI", () => {
  test("dispatches the harness event and records patch.moi state", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-cli-"));
    const calls: Array<{ url: string; body: string }> = [];
    const result = await invoke([
      "run",
      "harness",
      "--workspace-root",
      workspaceRoot,
      "--data-dir",
      dataDir,
      "--json",
    ], {
      env: {
        PATCH_WORKSPACE_BACKEND_URL: "https://workspace.example",
      },
      fetchImpl: async (url, init) => {
        calls.push({ url, body: String(init.body ?? "") });
        const eventId = JSON.parse(String(init.body ?? "{}")).id;
        return Response.json({
          status: "accepted",
          eventId,
          runIds: ["run-harness"],
          matched: 1,
        }, { status: 202 });
      },
    });

    expect(result.code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://workspace.example/events");
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      event: { id: "patch:harness:v0.1.3:upstream.release" },
      recorded: true,
      record: { status: "dispatched", runIds: ["run-harness"], matched: 1 },
      attempt: {
        status: "started",
        eventId: "patch:harness:v0.1.3:upstream.release",
        workspaceRunIds: ["run-harness"],
      },
    });

    const store = new EventStore(dataDir);
    expect(await store.getFlowEvent("patch:harness:v0.1.3:upstream.release")).toMatchObject({
      type: "upstream.release",
    });
    expect(await store.listMaintenanceAttempts()).toMatchObject([
      { eventId: "patch:harness:v0.1.3:upstream.release", status: "started" },
    ]);
  });

  test("dry-runs Codex release matching and blocks accidental local execution", async () => {
    const blocked = await invoke([
      "run",
      "codex-release",
      "--tag",
      "rust-v0.130.0",
      "--workspace-root",
      workspaceRoot,
    ]);
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain("requires PATCH_WORKSPACE_BACKEND_URL or --allow-local");

    const dryRun = await invoke([
      "run",
      "codex-release",
      "--tag",
      "rust-v0.130.0",
      "--workspace-root",
      workspaceRoot,
      "--dry-run",
      "--json",
    ]);
    expect(dryRun.code).toBe(0);
    expect(JSON.parse(dryRun.stdout).matches).toEqual([
      { flow: "openai-codex-bindings", step: "regenerate-bindings", runner: "bun" },
      { flow: "peezy-codex-fork", step: "rebase-patch-stack", runner: "code-mode" },
    ]);
  });

  test("syncs a maintenance attempt from workspace run state", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "patch-cli-"));
    const store = new EventStore(dataDir);
    await store.appendMaintenanceAttempt({
      id: "attempt-1",
      eventId: "event-1",
      eventType: "upstream.release",
      operation: "dispatch",
      status: "started",
      upstreamRepo: "openai/codex",
      upstreamTag: "rust-v0.130.0",
      workspaceRunIds: ["run-1"],
      candidateRefs: [],
      createdAt: "2026-05-16T00:00:00.000Z",
      updatedAt: "2026-05-16T00:00:00.000Z",
    });

    const result = await invoke([
      "sync",
      "attempt-1",
      "--data-dir",
      dataDir,
      "--json",
    ], {
      env: {
        PATCH_WORKSPACE_BACKEND_URL: "https://workspace.example",
      },
      fetchImpl: async () => Response.json({
        run: {
          id: "run-1",
          eventId: "event-1",
          status: "completed",
          completedAt: "2026-05-16T00:01:00.000Z",
          resultJson: JSON.stringify({
            status: "changed",
            message: "candidate branch ready",
            artifacts: {
              candidateRefs: [{
                kind: "branch",
                repo: "peezy-tech/codex",
                ref: "refs/heads/candidate",
                sha: "abc123",
                pushed: false,
              }],
            },
          }),
        },
      }),
    });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      attempt: {
        id: "attempt-1",
        status: "changed",
        message: "candidate branch ready",
        candidateRefs: [{ ref: "refs/heads/candidate", sha: "abc123" }],
      },
    });
    expect(await store.listMaintenanceAttempts({ status: "changed" })).toMatchObject([
      { id: "attempt-1", status: "changed" },
    ]);
  });

  test("sets up the Codex upstream remote when explicitly applied", async () => {
    const repo = await mkdtemp(join(tmpdir(), "patch-cli-codex-"));
    await mkdir(repo, { recursive: true });
    await git(repo, ["init", "-b", "code-mode-exec-hooks"]);
    await git(repo, ["remote", "add", "origin", "https://github.com/peezy-tech/codex"]);

    const result = await invoke([
      "setup",
      "codex",
      "--repo",
      repo,
      "--apply",
      "--json",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      path: repo,
      branch: "code-mode-exec-hooks",
      upstream: "https://github.com/openai/codex.git",
      addedUpstream: true,
      clean: true,
      ready: true,
    });
    expect((await git(repo, ["remote", "get-url", "upstream"])).stdout.trim()).toBe("https://github.com/openai/codex.git");
  });
});

async function invoke(
  args: string[],
  options: Parameters<typeof runCli>[1] = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    cwd: workspaceRoot,
    ...options,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

async function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const proc = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
  }
  return { stdout, stderr };
}
