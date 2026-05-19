import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { loadPatchMoiConfig } from "../src/config";
import { discoverPatchGitProject } from "../src/git-discovery";

describe("patch.moi Git discovery", () => {
  test("uses upstream remote-tracking ref without a local upstream branch", async () => {
    const repo = await createRepo({ patchPrefix: "patch/" });
    const discovery = await discoverPatchGitProject(repo);

    expect(discovery).toMatchObject({
      upstreamRemote: "upstream",
      upstreamBranch: "main",
      upstreamRef: "refs/remotes/upstream/main",
      upstreamExists: true,
      forkRemote: "origin",
      forkExists: true,
      targetBranch: "main",
      targetExists: true,
      ready: true,
      patchBranches: [{ name: "patch/001-feature" }],
    });
    expect((await git(repo, ["show-ref", "--verify", "--quiet", "refs/heads/upstream"], true)).code).not.toBe(0);
  });

  test("honors custom names from .patchmoi.toml", async () => {
    const repo = await createRepo({
      targetBranch: "stable",
      upstreamRemote: "source",
      upstreamBranch: "trunk",
      forkRemote: "fork",
      patchPrefix: "topic/",
    });
    await writeFile(join(repo, ".patchmoi.toml"), [
      "[git]",
      'upstreamRemote = "source"',
      'upstreamBranch = "trunk"',
      'forkRemote = "fork"',
      'targetBranch = "stable"',
      'patchPrefix = "topic/"',
      "",
      "[fetch]",
      "allowFetch = true",
      "fetchTags = true",
      "prune = true",
      "pruneTags = false",
      "",
    ].join("\n"), "utf8");
    await git(repo, ["add", ".patchmoi.toml"]);
    await git(repo, ["commit", "-m", "configure patchmoi"]);

    const config = await loadPatchMoiConfig(repo);
    const discovery = await discoverPatchGitProject(repo, config);

    expect(discovery).toMatchObject({
      upstreamRemote: "source",
      upstreamBranch: "trunk",
      upstreamRef: "refs/remotes/source/trunk",
      forkRemote: "fork",
      targetBranch: "stable",
      patchPrefix: "topic/",
      ready: true,
      patchBranches: [{ name: "topic/001-feature" }],
    });
    expect(config.fetch.allowFetch).toBe(true);
  });

  test("fails readiness when upstream remote is missing", async () => {
    const repo = await createRepo({ addUpstreamRemote: false, patchPrefix: "patch/" });
    const discovery = await discoverPatchGitProject(repo);

    expect(discovery.ready).toBe(false);
    expect(discovery.issues).toContain("missing upstream remote");
    expect(discovery.issues).toContain("missing refs/remotes/upstream/main; run git fetch upstream main");
  });

  test("reports dirty worktrees and absent patch branches", async () => {
    const repo = await createRepo({ createPatchBranch: false, patchPrefix: "patch/" });
    await writeFile(join(repo, "dirty.txt"), "dirty\n", "utf8");

    const discovery = await discoverPatchGitProject(repo);

    expect(discovery.ready).toBe(false);
    expect(discovery.patchBranches).toEqual([]);
    expect(discovery.issues).toContain("no patch/ branches found");
    expect(discovery.issues).toContain("working tree has local changes or untracked files");
  });
});

async function createRepo(options: {
  targetBranch?: string;
  upstreamRemote?: string;
  upstreamBranch?: string;
  forkRemote?: string;
  patchPrefix: string;
  addUpstreamRemote?: boolean;
  createPatchBranch?: boolean;
}): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "patch-git-discovery-"));
  const targetBranch = options.targetBranch ?? "main";
  const upstreamRemote = options.upstreamRemote ?? "upstream";
  const upstreamBranch = options.upstreamBranch ?? "main";
  const forkRemote = options.forkRemote ?? "origin";
  await mkdir(repo, { recursive: true });
  await git(repo, ["init", "-b", targetBranch]);
  await git(repo, ["config", "user.name", "Patch Moi Test"]);
  await git(repo, ["config", "user.email", "patch@example.test"]);
  await writeFile(join(repo, "README.md"), "base\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "base"]);
  await git(repo, ["remote", "add", forkRemote, "https://example.test/fork.git"]);
  if (options.addUpstreamRemote !== false) {
    await git(repo, ["remote", "add", upstreamRemote, "https://example.test/upstream.git"]);
    await git(repo, ["update-ref", `refs/remotes/${upstreamRemote}/${upstreamBranch}`, "HEAD"]);
  }
  if (options.createPatchBranch !== false) {
    await git(repo, ["switch", "-c", `${options.patchPrefix}001-feature`]);
    await writeFile(join(repo, "feature.txt"), "feature\n", "utf8");
    await git(repo, ["add", "feature.txt"]);
    await git(repo, ["commit", "-m", "patch: feature"]);
    await git(repo, ["switch", targetBranch]);
  }
  return repo;
}

async function git(cwd: string, args: string[], allowFailure = false): Promise<{ code: number; stdout: string; stderr: string }> {
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
  if (code !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
  }
  return { code, stdout, stderr };
}
