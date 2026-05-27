import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { runCli } from "../src/cli";

const workspaceRoot = join(import.meta.dir, "../../..");

describe("patch workspace CLI", () => {
  test("captures a feature branch as patch/* and rebuilds main from upstream", async () => {
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
    const work = JSON.parse(workStart.stdout).work;
    expect(work).toMatchObject({
      kind: "feature",
      status: "active",
      workBranch: "feature",
      patchBranch: "patch/010-feature",
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
      "--work-id",
      work.id,
      "--data-dir",
      dataDir,
      "--json",
    ]);
    expect(capture.code).toBe(0);
    expect(JSON.parse(capture.stdout)).toMatchObject({
      result: {
        status: "changed",
        patchBranch: "patch/010-feature",
        from: "feature",
        base: "main",
        message: "patch: feature",
      },
      work: {
        id: work.id,
        status: "captured",
        patchBranch: "patch/010-feature",
      },
      attempt: {
        workId: work.id,
        kind: "feature",
        operation: "capture",
        status: "changed",
      },
    });
    expect((await git(repo, ["rev-list", "--count", "main..patch/010-feature"])).stdout.trim()).toBe("1");

    const attempts = await invoke([
      "attempts",
      "--work-id",
      work.id,
      "--data-dir",
      dataDir,
      "--json",
    ]);
    expect(attempts.code).toBe(0);
    expect(JSON.parse(attempts.stdout)).toMatchObject({
      attempts: [{ workId: work.id, operation: "capture" }],
    });

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
  });

  test("starts feature patch work and creates the work branch", async () => {
    const repo = await createPatchRepo();
    const dataDir = join(await mkdtemp(join(tmpdir(), "patch-work-data-")), "data");

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
      "--data-dir",
      dataDir,
      "--json",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      work: {
        kind: "feature",
        status: "active",
        workBranch: "created-feature",
      },
      branchResult: {
        status: "created",
        branch: "created-feature",
        base: "main",
      },
    });
    expect((await git(repo, ["branch", "--show-current"])).stdout.trim()).toBe("created-feature");
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
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    cwd: workspaceRoot,
    env: {},
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
