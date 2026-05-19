import type { PatchMoiConfig } from "./config";
import { canonicalUpstreamRef, defaultPatchMoiConfig } from "./config";
import { discoverPatchGitProject, type PatchBranchSummary } from "./git-discovery";

export type { PatchBranchSummary };

export type PatchWorkspaceReport = {
  path: string;
  currentBranch?: string;
  mainBranch: string;
  upstreamBranch: string;
  patchPrefix: string;
  clean: boolean;
  mainExists: boolean;
  upstreamExists: boolean;
  patchBranches: PatchBranchSummary[];
  ready: boolean;
  issues: string[];
};

export type PatchCaptureResult = {
  status: "changed" | "skipped";
  repo: string;
  patchBranch: string;
  from: string;
  base: string;
  sha?: string;
  message?: string;
};

export type PatchRebuildResult = {
  status: "changed" | "needs_intervention";
  repo: string;
  base: string;
  targetBranch: string;
  beforeSha?: string;
  afterSha?: string;
  applied: PatchBranchSummary[];
  failedPatch?: PatchBranchSummary;
  statusOutput?: string;
  error?: string;
};

export async function inspectPatchWorkspace(repoPath: string, options: {
  mainBranch?: string;
  upstreamBranch?: string;
  patchPrefix?: string;
  upstreamRemote?: string;
  forkRemote?: string;
  config?: PatchMoiConfig;
} = {}): Promise<PatchWorkspaceReport> {
  const config = patchWorkspaceConfig(options);
  const report = await discoverPatchGitProject(repoPath, config);

  return {
    path: repoPath,
    currentBranch: report.currentBranch,
    mainBranch: report.targetBranch,
    upstreamBranch: report.upstreamRef,
    patchPrefix: report.patchPrefix,
    clean: report.clean,
    mainExists: report.targetExists,
    upstreamExists: report.upstreamExists,
    patchBranches: report.patchBranches,
    ready: report.ready,
    issues: report.issues,
  };
}

export async function listPatchBranches(repoPath: string, patchPrefix = "patch/"): Promise<PatchBranchSummary[]> {
  const refsPath = `refs/heads/${patchPrefix.replace(/\/+$/, "")}`;
  const result = await git(repoPath, [
    "for-each-ref",
    "--format=%(refname:short)%09%(objectname)%09%(contents:subject)",
    refsPath,
  ], { allowFailure: true });
  if (result.code !== 0 || !result.stdout.trim()) {
    return [];
  }
  return result.stdout.trim().split(/\r?\n/).map((line) => {
    const [name = "", sha = "", subject = ""] = line.split("\t");
    return { name, sha, subject };
  }).filter((branch) => branch.name.startsWith(patchPrefix)).sort((left, right) => left.name.localeCompare(right.name));
}

export async function capturePatchBranch(repoPath: string, options: {
  patchBranch: string;
  from: string;
  base?: string;
  message?: string;
  force?: boolean;
  patchPrefix?: string;
}): Promise<PatchCaptureResult> {
  const base = options.base ?? defaultPatchMoiConfig.git.targetBranch;
  const patchPrefix = options.patchPrefix ?? defaultPatchMoiConfig.git.patchPrefix;
  validatePatchBranch(options.patchBranch, patchPrefix);
  await requireClean(repoPath);
  await resolveCommit(repoPath, base);
  await resolveCommit(repoPath, options.from);

  const previousBranch = await currentBranch(repoPath);
  const patchBranchExisted = await branchExists(repoPath, options.patchBranch);
  if (patchBranchExisted) {
    if (!options.force) {
      throw new Error(`${options.patchBranch} already exists; rerun with --force to replace it`);
    }
    await git(repoPath, ["switch", "-C", options.patchBranch, base]);
  } else {
    await git(repoPath, ["switch", "-c", options.patchBranch, base]);
  }

  await git(repoPath, ["restore", "--source", options.from, "--staged", "--worktree", "--", "."]);
  const diff = await git(repoPath, ["diff", "--cached", "--quiet"], { allowFailure: true });
  if (diff.code === 0) {
    if (previousBranch && previousBranch !== options.patchBranch) {
      await git(repoPath, ["switch", previousBranch]);
    }
    if (!patchBranchExisted) {
      await git(repoPath, ["branch", "-D", options.patchBranch]);
    }
    return {
      status: "skipped",
      repo: repoPath,
      patchBranch: options.patchBranch,
      from: options.from,
      base,
      message: "no changes to capture",
    };
  }
  if (diff.code !== 1) {
    throw new Error(`git diff --cached --quiet failed in ${repoPath}: ${diff.stderr.trim() || diff.stdout.trim()}`);
  }

  const message = options.message ?? defaultPatchMessage(options.patchBranch, patchPrefix);
  await git(repoPath, ["commit", "-m", message]);
  const sha = (await git(repoPath, ["rev-parse", "HEAD"])).stdout.trim();
  return {
    status: "changed",
    repo: repoPath,
    patchBranch: options.patchBranch,
    from: options.from,
    base,
    sha,
    message,
  };
}

export async function rebuildPatchMain(repoPath: string, options: {
  base?: string;
  targetBranch?: string;
  patchPrefix?: string;
  config?: PatchMoiConfig;
} = {}): Promise<PatchRebuildResult> {
  const config = patchWorkspaceConfig(options);
  const base = options.base ?? canonicalUpstreamRef(config);
  const targetBranch = options.targetBranch ?? config.git.targetBranch;
  const patchPrefix = options.patchPrefix ?? config.git.patchPrefix;
  await requireClean(repoPath);
  await resolveCommit(repoPath, base);
  const beforeSha = await resolveCommit(repoPath, targetBranch).catch(() => undefined);
  const patchBranches = await listPatchBranches(repoPath, patchPrefix);

  await git(repoPath, ["switch", "--detach", base]);
  const applied: PatchBranchSummary[] = [];
  for (const patchBranch of patchBranches) {
    const pick = await git(repoPath, ["cherry-pick", patchBranch.sha], { allowFailure: true });
    if (pick.code !== 0) {
      const status = await git(repoPath, ["status", "--short", "--branch"], { allowFailure: true });
      return {
        status: "needs_intervention",
        repo: repoPath,
        base,
        targetBranch,
        beforeSha,
        applied,
        failedPatch: patchBranch,
        statusOutput: status.stdout,
        error: pick.stderr.trim() || pick.stdout.trim(),
      };
    }
    applied.push(patchBranch);
  }

  const afterSha = (await git(repoPath, ["rev-parse", "HEAD"])).stdout.trim();
  await git(repoPath, ["branch", "-f", targetBranch, afterSha]);
  await git(repoPath, ["switch", targetBranch]);
  return {
    status: "changed",
    repo: repoPath,
    base,
    targetBranch,
    beforeSha,
    afterSha,
    applied,
  };
}

function validatePatchBranch(branch: string, patchPrefix: string): void {
  if (!branch.startsWith(patchPrefix) || branch === patchPrefix) {
    throw new Error(`patch branch names must start with ${patchPrefix}`);
  }
}

function defaultPatchMessage(branch: string, patchPrefix: string): string {
  return `patch: ${branch.slice(patchPrefix.length).replaceAll("-", " ")}`;
}

function patchWorkspaceConfig(options: {
  mainBranch?: string;
  upstreamBranch?: string;
  patchPrefix?: string;
  upstreamRemote?: string;
  forkRemote?: string;
  config?: PatchMoiConfig;
}): PatchMoiConfig {
  const base = options.config ?? defaultPatchMoiConfig;
  return {
    git: {
      ...base.git,
      ...(options.mainBranch ? { targetBranch: options.mainBranch } : {}),
      ...(options.upstreamBranch ? { upstreamBranch: options.upstreamBranch } : {}),
      ...(options.patchPrefix ? { patchPrefix: options.patchPrefix } : {}),
      ...(options.upstreamRemote ? { upstreamRemote: options.upstreamRemote } : {}),
      ...(options.forkRemote ? { forkRemote: options.forkRemote } : {}),
    },
    fetch: { ...base.fetch },
    safety: { ...base.safety },
  };
}

async function requireClean(repoPath: string): Promise<void> {
  const status = await git(repoPath, ["status", "--porcelain=v1"]);
  if (status.stdout.trim()) {
    throw new Error(`working tree has local changes or untracked files:\n${status.stdout}`);
  }
}

async function currentBranch(repoPath: string): Promise<string | undefined> {
  const result = await git(repoPath, ["symbolic-ref", "--short", "HEAD"], { allowFailure: true });
  return result.code === 0 ? result.stdout.trim() : undefined;
}

async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  return (await git(repoPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { allowFailure: true })).code === 0;
}

async function resolveCommit(repoPath: string, ref: string): Promise<string> {
  const result = await git(repoPath, ["rev-parse", "--verify", `${ref}^{commit}`]);
  return result.stdout.trim();
}

async function git(
  cwd: string,
  args: string[],
  options: { allowFailure?: boolean } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
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
  if (code !== 0 && !options.allowFailure) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${stderr.trim() || stdout.trim() || `exit ${code}`}`);
  }
  return { code, stdout, stderr };
}
