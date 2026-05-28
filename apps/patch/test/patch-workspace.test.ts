import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { runCli } from "../src/cli";

const workspaceRoot = join(import.meta.dir, "../../..");

describe("patch workspace CLI", () => {
  test("captures a feature branch as patch/* and rebuilds main from upstream without state files", async () => {
    const repo = await createPatchRepo();
    const dataDir = join(await mkdtemp(join(tmpdir(), "patch-work-data-")), "data");

    const beforeDoctor = await invoke([
      "patch",
      "doctor",
      "--repo",
      repo,
      "--json",
    ]);
    expect(beforeDoctor.code).toBe(1);
    expect(JSON.parse(beforeDoctor.stdout)).toMatchObject({
      mainExists: true,
      upstreamExists: true,
      patchBranches: [],
      ready: false,
    });

    const workStart = await invoke([
      "work",
      "start",
      "feature",
      "--title",
      "Feature branch promotion",
      "--repo",
      repo,
      "--branch",
      "feature",
      "--base",
      "main",
      "--patch-branch",
      "patch/010-feature",
      "--data-dir",
      dataDir,
      "--json",
    ]);
    expect(workStart.code).toBe(0);
    expect(JSON.parse(workStart.stdout)).toMatchObject({
      kind: "feature",
      title: "Feature branch promotion",
      repo,
      baseRef: "main",
      workBranch: "feature",
      patchBranch: "patch/010-feature",
      createdBranch: false,
    });

    const capture = await invoke([
      "patch",
      "capture",
      "patch/010-feature",
      "--repo",
      repo,
      "--from",
      "feature",
      "--base",
      "main",
      "--message",
      "patch: feature",
      "--json",
    ]);
    expect(capture.code).toBe(0);
    expect(JSON.parse(capture.stdout)).toMatchObject({
      status: "changed",
      patchBranch: "patch/010-feature",
      from: "feature",
      base: "main",
      message: "patch: feature",
    });
    expect((await git(repo, ["rev-list", "--count", "main..patch/010-feature"])).stdout.trim()).toBe("1");

    const list = await invoke([
      "patch",
      "list",
      "--repo",
      repo,
      "--json",
    ]);
    expect(list.code).toBe(0);
    expect(JSON.parse(list.stdout).patchBranches).toMatchObject([
      { name: "patch/010-feature", subject: "patch: feature" },
    ]);

    const upstream = `${repo}-upstream`;
    await writeFile(join(upstream, "upstream.txt"), "base\nupstream movement\n", "utf8");
    await git(upstream, ["add", "upstream.txt"]);
    await git(upstream, ["commit", "-m", "upstream movement"]);
    await git(repo, ["fetch", "upstream", "main"]);

    const rebuild = await invoke([
      "patch",
      "rebuild",
      "--repo",
      repo,
      "--to",
      "main",
      "--json",
    ]);
    expect(rebuild.code).toBe(0);
    expect(JSON.parse(rebuild.stdout)).toMatchObject({
      status: "changed",
      targetBranch: "main",
      applied: [{ name: "patch/010-feature" }],
    });
    expect((await git(repo, ["branch", "--show-current"])).stdout.trim()).toBe("main");
    expect(await readFile(join(repo, "upstream.txt"), "utf8")).toBe("base\nupstream movement\n");
    expect(await readFile(join(repo, "feature.txt"), "utf8")).toBe("feature\n");

    const afterDoctor = await invoke([
      "patch",
      "doctor",
      "--repo",
      repo,
      "--json",
    ]);
    expect(afterDoctor.code).toBe(0);
    expect(JSON.parse(afterDoctor.stdout)).toMatchObject({
      clean: true,
      ready: true,
      patchBranches: [{ name: "patch/010-feature" }],
    });
    expect(await exists(dataDir)).toBe(false);
  });

  test("starts feature patch work and creates the work branch", async () => {
    const repo = await createPatchRepo();

    const result = await invoke([
      "work",
      "start",
      "feature",
      "--title",
      "Created feature branch",
      "--repo",
      repo,
      "--branch",
      "created-feature",
      "--base",
      "main",
      "--create-branch",
      "--json",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: "feature",
      title: "Created feature branch",
      workBranch: "created-feature",
      createdBranch: true,
    });
    expect((await git(repo, ["branch", "--show-current"])).stdout.trim()).toBe("created-feature");
  });

  test("lists and pulls runner candidate refs through Git only", async () => {
    const repo = await createPatchRepo();
    const root = join(repo, "..");
    const origin = join(root, "origin.git");
    await git(root, ["init", "--bare", origin]);
    await git(repo, ["remote", "set-url", "origin", origin]);
    await git(repo, ["switch", "-c", "candidate/runner"]);
    await writeFile(join(repo, "candidate.txt"), "runner\n", "utf8");
    await git(repo, ["add", "candidate.txt"]);
    await git(repo, ["commit", "-m", "runner candidate"]);
    const remoteSha = (await git(repo, ["rev-parse", "HEAD"])).stdout.trim();
    await git(repo, ["push", "origin", "candidate/runner"]);
    await git(repo, ["switch", "main"]);
    await git(repo, ["branch", "-D", "candidate/runner"]);
    await git(repo, ["update-ref", "-d", "refs/remotes/origin/candidate/runner"]);

    const beforeFetch = await invoke([
      "patch",
      "candidates",
      "--repo",
      repo,
      "--remote",
      "origin",
      "--json",
    ]);
    expect(beforeFetch.code).toBe(0);
    expect(JSON.parse(beforeFetch.stdout)).toMatchObject({ candidates: [] });

    await git(repo, ["fetch", "origin", "candidate/runner:refs/remotes/origin/candidate/runner"]);
    const afterFetch = await invoke([
      "patch",
      "candidates",
      "--repo",
      repo,
      "--remote",
      "origin",
      "--json",
    ]);
    expect(afterFetch.code).toBe(0);
    expect(JSON.parse(afterFetch.stdout)).toMatchObject({
      remote: "origin",
      candidates: [{ ref: "candidate/runner", remote: "origin", sha: remoteSha, subject: "runner candidate" }],
    });

    const blocked = await invoke([
      "patch",
      "pull",
      "--repo",
      repo,
      "--remote",
      "origin",
      "--branch",
      "candidate/runner",
      "--json",
    ]);
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain("patch pull is gated");

    const pulled = await invoke([
      "patch",
      "pull",
      "--repo",
      repo,
      "--remote",
      "origin",
      "--branch",
      "candidate/runner",
      "--json",
    ], { PATCH_MOI_ALLOW_PULL: "1" });
    expect(pulled.code).toBe(0);
    expect(JSON.parse(pulled.stdout)).toMatchObject({
      remote: "origin",
      branch: "candidate/runner",
      afterSha: remoteSha,
      status: "changed",
    });

    const upToDate = await invoke([
      "patch",
      "pull",
      "--repo",
      repo,
      "--remote",
      "origin",
      "--branch",
      "candidate/runner",
      "--json",
    ], { PATCH_MOI_ALLOW_PULL: "1" });
    expect(upToDate.code).toBe(0);
    expect(JSON.parse(upToDate.stdout)).toMatchObject({
      branch: "candidate/runner",
      beforeSha: remoteSha,
      afterSha: remoteSha,
      status: "up_to_date",
    });

    await writeFile(join(repo, "dirty.txt"), "dirty\n", "utf8");
    const dirty = await invoke([
      "patch",
      "pull",
      "--repo",
      repo,
      "--remote",
      "origin",
      "--branch",
      "candidate/runner",
      "--json",
    ], { PATCH_MOI_ALLOW_PULL: "1" });
    expect(dirty.code).toBe(1);
    expect(dirty.stderr).toContain("working tree has local changes");
    await rm(join(repo, "dirty.txt"));

    await git(repo, ["switch", "candidate/runner"]);
    await writeFile(join(repo, "local.txt"), "local\n", "utf8");
    await git(repo, ["add", "local.txt"]);
    await git(repo, ["commit", "-m", "local divergence"]);
    await git(repo, ["switch", "main"]);
    const nonFastForward = await invoke([
      "patch",
      "pull",
      "--repo",
      repo,
      "--remote",
      "origin",
      "--branch",
      "candidate/runner",
      "--json",
    ], { PATCH_MOI_ALLOW_PULL: "1" });
    expect(nonFastForward.code).toBe(1);
    expect(nonFastForward.stderr).toContain("cannot fast-forward");
  });
});

async function createPatchRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "patch-workspace-"));
  const repo = join(root, "fork");
  const upstream = `${repo}-upstream`;
  await mkdir(upstream, { recursive: true });
  await git(upstream, ["init", "-b", "main"]);
  await git(upstream, ["config", "user.name", "Patch Moi Test"]);
  await git(upstream, ["config", "user.email", "patch@example.test"]);
  await writeFile(join(upstream, "upstream.txt"), "base\n", "utf8");
  await git(upstream, ["add", "upstream.txt"]);
  await git(upstream, ["commit", "-m", "upstream base"]);
  await git(root, ["clone", upstream, repo]);
  await git(repo, ["remote", "rename", "origin", "upstream"]);
  await git(repo, ["remote", "add", "origin", `${root}-origin.git`]);
  await git(repo, ["config", "user.name", "Patch Moi Test"]);
  await git(repo, ["config", "user.email", "patch@example.test"]);
  await git(repo, ["switch", "-c", "feature"]);
  await writeFile(join(repo, "feature.txt"), "feature\n", "utf8");
  await git(repo, ["add", "feature.txt"]);
  await git(repo, ["commit", "-m", "feature work"]);
  await git(repo, ["switch", "main"]);
  return repo;
}

async function invoke(
  args: string[],
  env: Record<string, string | undefined> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    cwd: workspaceRoot,
    env,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") {
      return false;
    }
    throw error;
  }
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
