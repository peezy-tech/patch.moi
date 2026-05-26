import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { runCli } from "../src/cli";

const workspaceRoot = join(import.meta.dir, "../../..");

describe("patch.moi CLI", () => {
  test("dry-runs explicit automation targets and blocks accidental local execution", async () => {
    const blocked = await invoke([
      "run",
      "upstream-release",
      "--repo",
      "openai/codex",
      "--tag",
      "rust-v1.2.3",
      "--workspace-root",
      workspaceRoot,
      "--automation",
      "peezy-codex-fork",
    ], { env: {} });
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain("requires PATCH_WORKSPACE_BACKEND_URL or --allow-local");

    const dryRun = await invoke([
      "run",
      "upstream-release",
      "--repo",
      "openai/codex",
      "--tag",
      "rust-v1.2.3",
      "--workspace-root",
      workspaceRoot,
      "--automation",
      "peezy-codex-fork",
      "--dry-run",
      "--json",
    ]);
    expect(dryRun.code).toBe(0);
    expect(JSON.parse(dryRun.stdout)).toMatchObject({
      event: {
        type: "upstream.release",
        automations: ["peezy-codex-fork"],
      },
      automations: ["peezy-codex-fork"],
    });
  });

  test("requires upstream release repo and tag explicitly", async () => {
    const dryRun = await invoke([
      "run",
      "upstream-release",
      "--workspace-root",
      workspaceRoot,
      "--dry-run",
      "--json",
    ]);

    expect(dryRun.code).toBe(2);
    expect(dryRun.stderr).toContain("run upstream-release requires --repo");
  });

  test("sets up an upstream remote when explicitly applied", async () => {
    const repo = await mkdtemp(join(tmpdir(), "patch-cli-fork-"));
    await mkdir(repo, { recursive: true });
    await git(repo, ["init", "-b", "main"]);
    await git(repo, ["remote", "add", "origin", "https://example.test/fork.git"]);

    const result = await invoke([
      "setup",
      "fork",
      "--repo",
      repo,
      "--upstream-url",
      "https://example.test/upstream.git",
      "--apply",
      "--json",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      path: repo,
      branch: "main",
      upstream: "https://example.test/upstream.git",
      addedUpstream: true,
      clean: true,
      ready: true,
    });
    expect((await git(repo, ["remote", "get-url", "upstream"])).stdout.trim()).toBe("https://example.test/upstream.git");
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
