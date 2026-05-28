import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { callPatchMoiTool, patchMoiTools } from "../src/mcp";

describe("patch.moi MCP tools", () => {
  test("ships only local Git-first tools", () => {
    const names = patchMoiTools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "fetch_upstream",
      "git_discover",
      "patch_candidates",
      "patch_capture",
      "patch_doctor",
      "patch_list",
      "patch_pull",
      "patch_rebuild",
      "work_start_feature",
    ]);
    for (const removed of ["status", "events", "attempts", "dispatches", "retry", "replay", "sync"]) {
      expect(names).not.toContain(removed);
    }
  });

  test("read tools return structured local Git JSON", async () => {
    const repo = await createRepo();
    const result = await callPatchMoiTool("git_discover", { repo }, {});

    expect(result).toMatchObject({
      upstreamRef: "refs/remotes/upstream/main",
      upstreamExists: true,
      patchBranches: [{ name: "patch/001-feature" }],
    });
  });

  test("gated mutation tools fail closed without policy", async () => {
    const repo = await createRepo();

    await expect(callPatchMoiTool("patch_rebuild", { repo }, {})).rejects.toThrow("allowRebuild is gated");
    await expect(callPatchMoiTool("patch_pull", { repo, remote: "origin", branch: "candidate/test" }, {})).rejects.toThrow("allowPull is gated");
    await expect(callPatchMoiTool("fetch_upstream", { repo }, {})).rejects.toThrow("fetch_upstream is gated");
  });

  test("removed state and remote tools are unknown", async () => {
    for (const name of ["status", "events", "attempts", "dispatches", "retry", "replay", "sync", "run_upstream_release"]) {
      await expect(callPatchMoiTool(name, {}, {})).rejects.toThrow(`unknown patch.moi tool: ${name}`);
    }
  });

  test("starts feature work through MCP without durable records", async () => {
    const repo = await createRepo();
    const started = await callPatchMoiTool("work_start_feature", {
      repo,
      title: "MCP feature",
      branch: "mcp-feature",
      base: "main",
      createBranch: true,
    }, {});

    expect(started).toMatchObject({
      kind: "feature",
      title: "MCP feature",
      repo,
      baseRef: "main",
      workBranch: "mcp-feature",
      createdBranch: true,
    });
    expect((started as { workBranchSha?: string }).workBranchSha).toMatch(/^[0-9a-f]{40}$/);
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
