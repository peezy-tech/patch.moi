import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { callPatchMoiTool } from "../src/mcp";

const workspaceRoot = join(import.meta.dir, "../../..");

describe("patch.moi MCP tools", () => {
  test("read tools return structured local JSON", async () => {
    const repo = await createRepo();
    const result = await callPatchMoiTool("git_discover", { repo }, {});

    expect(result).toMatchObject({
      upstreamRef: "refs/remotes/upstream/main",
      upstreamExists: true,
      patchBranches: [{ name: "patch/001-feature" }],
    });
  });

  test("dry-run tools do not write DATA_DIR", async () => {
    const dataDir = join(await mkdtemp(join(tmpdir(), "patch-mcp-dry-run-")), "data");
    const result = await callPatchMoiTool("run_upstream_release_dry_run", {
      workspaceRoot,
      dataDir,
      upstreamRepo: "peezy-tech/patch-moi-harness",
      tag: "v0.1.3",
      automation: "patch-moi-harness-fork",
    }, {});

    expect(result).toMatchObject({
      dryRun: true,
      event: { type: "upstream.release" },
      automations: ["patch-moi-harness-fork"],
    });
    expect(existsSync(dataDir)).toBe(false);
  });

  test("gated mutation tools fail closed without policy", async () => {
    const repo = await createRepo();

    await expect(callPatchMoiTool("patch_rebuild", { repo }, {})).rejects.toThrow("allowRebuild is gated");
    await expect(callPatchMoiTool("fetch_upstream", { repo }, {})).rejects.toThrow("fetch_upstream is gated");
  });

  test("remote mode reports missing PATCH_MOI_URL cleanly", async () => {
    await expect(callPatchMoiTool("status", { mode: "remote" }, {})).rejects.toThrow("remote mode requires PATCH_MOI_URL");
  });
});

async function createRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "patch-mcp-"));
  await mkdir(repo, { recursive: true });
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "Patch Moi Test"]);
  await git(repo, ["config", "user.email", "patch@example.test"]);
  await writeFile(join(repo, "README.md"), "base\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "base"]);
  await git(repo, ["remote", "add", "origin", "https://example.test/fork.git"]);
  await git(repo, ["remote", "add", "upstream", "https://example.test/upstream.git"]);
  await git(repo, ["update-ref", "refs/remotes/upstream/main", "HEAD"]);
  await git(repo, ["switch", "-c", "patch/001-feature"]);
  await writeFile(join(repo, "feature.txt"), "feature\n", "utf8");
  await git(repo, ["add", "feature.txt"]);
  await git(repo, ["commit", "-m", "patch: feature"]);
  await git(repo, ["switch", "main"]);
  return repo;
}

async function git(cwd: string, args: string[]): Promise<void> {
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
}
