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

  test("lists, test-applies, applies, and explains independent patch refs without metadata files", async () => {
    const repo = await createPatchRepo();
    await createPatchBranch(repo, "patch/010-one", "one.txt", "one\n", "patch: one");
    await createPatchBranch(repo, "patch/020-two", "two.txt", "two\n", "patch: two");

    const list = await invoke([
      "patch",
      "list",
      "--repo",
      repo,
      "--json",
    ]);
    expect(list.code).toBe(0);
    expect(JSON.parse(list.stdout).patchBranches).toMatchObject([
      { name: "patch/010-one", status: "independent", dependencies: [] },
      { name: "patch/020-two", status: "independent", dependencies: [] },
    ]);

    for (const patchRef of ["patch/010-one", "patch/020-two"]) {
      const testApply = await invoke([
        "patch",
        "test-apply",
        patchRef,
        "--repo",
        repo,
        "--to",
        "main",
        "--json",
      ]);
      expect(testApply.code).toBe(0);
      expect(JSON.parse(testApply.stdout)).toMatchObject({
        patch: { name: patchRef, status: "independent" },
        target: "main",
        status: "applies",
        missingDependencies: [],
      });
    }

    const gated = await invoke([
      "patch",
      "apply",
      "patch/010-one",
      "--repo",
      repo,
      "--to",
      "shared",
      "--create-branch",
      "--json",
    ]);
    expect(gated.code).toBe(2);
    expect(gated.stderr).toContain("patch apply is gated");

    const firstApply = await invoke([
      "patch",
      "apply",
      "patch/010-one",
      "--repo",
      repo,
      "--to",
      "shared",
      "--create-branch",
      "--json",
    ], { PATCH_MOI_ALLOW_APPLY: "1" });
    expect(firstApply.code).toBe(0);
    expect(JSON.parse(firstApply.stdout)).toMatchObject({
      patch: { name: "patch/010-one" },
      targetBranch: "shared",
      status: "changed",
      missingDependencies: [],
    });

    const secondApply = await invoke([
      "patch",
      "apply",
      "patch/020-two",
      "--repo",
      repo,
      "--to",
      "shared",
      "--json",
    ], { PATCH_MOI_ALLOW_APPLY: "1" });
    expect(secondApply.code).toBe(0);
    expect(JSON.parse(secondApply.stdout)).toMatchObject({
      patch: { name: "patch/020-two" },
      targetBranch: "shared",
      status: "changed",
      missingDependencies: [],
    });
    expect(await readFile(join(repo, "one.txt"), "utf8")).toBe("one\n");
    expect(await readFile(join(repo, "two.txt"), "utf8")).toBe("two\n");
    expect(await exists(join(repo, ".patchmoi"))).toBe(false);

    const explain = await invoke([
      "patch",
      "explain",
      "--repo",
      repo,
      "--branch",
      "shared",
      "--upstream",
      "refs/remotes/upstream/main",
      "--json",
    ]);
    expect(explain.code).toBe(0);
    const explained = JSON.parse(explain.stdout);
    expect(explained.matchedPatches.map((patch: { name: string }) => patch.name)).toEqual(["patch/010-one", "patch/020-two"]);
    expect(explained.unmatchedCommits).toEqual([]);
  });

  test("detects stacked patch refs and blocks applying them until dependencies are present", async () => {
    const repo = await createPatchRepo();
    await createPatchBranch(repo, "patch/010-base", "base-patch.txt", "base patch\n", "patch: base");
    await createPatchBranch(repo, "patch/020-stacked", "stacked.txt", "stacked\n", "patch: stacked", "patch/010-base");

    const inspect = await invoke([
      "patch",
      "inspect",
      "patch/020-stacked",
      "--repo",
      repo,
      "--json",
    ]);
    expect(inspect.code).toBe(0);
    expect(JSON.parse(inspect.stdout)).toMatchObject({
      patch: {
        name: "patch/020-stacked",
        status: "stacked",
        dependencies: [{ name: "patch/010-base" }],
      },
      warnings: ["patch/020-stacked depends on patch/010-base"],
    });

    const blockedTest = await invoke([
      "patch",
      "test-apply",
      "patch/020-stacked",
      "--repo",
      repo,
      "--to",
      "main",
      "--json",
    ]);
    expect(blockedTest.code).toBe(1);
    expect(JSON.parse(blockedTest.stdout)).toMatchObject({
      status: "blocked",
      missingDependencies: [{ name: "patch/010-base" }],
    });

    const blockedApply = await invoke([
      "patch",
      "apply",
      "patch/020-stacked",
      "--repo",
      repo,
      "--to",
      "stacked-target",
      "--create-branch",
      "--json",
    ], { PATCH_MOI_ALLOW_APPLY: "1" });
    expect(blockedApply.code).toBe(1);
    expect(JSON.parse(blockedApply.stdout)).toMatchObject({
      status: "blocked",
      missingDependencies: [{ name: "patch/010-base" }],
    });

    const dependency = await invoke([
      "patch",
      "apply",
      "patch/010-base",
      "--repo",
      repo,
      "--to",
      "stacked-target",
      "--create-branch",
      "--json",
    ], { PATCH_MOI_ALLOW_APPLY: "1" });
    expect(dependency.code).toBe(0);

    const stacked = await invoke([
      "patch",
      "apply",
      "patch/020-stacked",
      "--repo",
      repo,
      "--to",
      "stacked-target",
      "--json",
    ], { PATCH_MOI_ALLOW_APPLY: "1" });
    expect(stacked.code).toBe(0);
    expect(JSON.parse(stacked.stdout)).toMatchObject({
      status: "changed",
      skipped: [{ subject: "patch: base" }],
      applied: [{ subject: "patch: stacked" }],
      missingDependencies: [],
    });
    expect(await readFile(join(repo, "base-patch.txt"), "utf8")).toBe("base patch\n");
    expect(await readFile(join(repo, "stacked.txt"), "utf8")).toBe("stacked\n");
    expect(await exists(join(repo, ".patchmoi"))).toBe(false);
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

async function createPatchBranch(
  repo: string,
  branch: string,
  fileName: string,
  content: string,
  message: string,
  base = "main",
): Promise<void> {
  await git(repo, ["switch", "-c", branch, base]);
  await writeFile(join(repo, fileName), content, "utf8");
  await git(repo, ["add", fileName]);
  await git(repo, ["commit", "-m", message]);
  await git(repo, ["switch", "main"]);
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
