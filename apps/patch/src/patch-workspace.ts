import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

export type PatchWorkBranchResult = {
  status: "created";
  repo: string;
  branch: string;
  base: string;
  sha: string;
};

export type PatchCandidateSummary = {
  ref: string;
  sha: string;
  subject: string;
  remote?: string;
};

export type PatchPullResult = {
  repo: string;
  remote: string;
  branch: string;
  beforeSha?: string;
  afterSha: string;
  status: "changed" | "up_to_date";
};

export type PatchRefDependency = {
  name: string;
  fullRef: string;
  sha: string;
};

export type PatchRefSummary = PatchBranchSummary & {
  fullRef: string;
  source: "local" | "remote";
  remote?: string;
  patchPrefix: string;
  upstreamBase: string;
  upstreamBaseSha: string;
  inferredBaseSha: string;
  status: "independent" | "stacked";
  dependencies: PatchRefDependency[];
  commitCount: number;
};

export type PatchCommitSummary = {
  sha: string;
  subject: string;
  patchId?: string;
};

export type PatchInspectResult = {
  repo: string;
  patch: PatchRefSummary;
  commits: PatchCommitSummary[];
  files: string[];
  warnings: string[];
};

export type PatchApplyResult = {
  repo: string;
  patch: PatchRefSummary;
  targetBranch: string;
  targetSha: string;
  base: string;
  baseSha: string;
  status: "changed" | "blocked" | "needs_intervention" | "up_to_date";
  applied: PatchCommitSummary[];
  skipped: PatchCommitSummary[];
  dependencies: PatchRefDependency[];
  missingDependencies: PatchRefDependency[];
  beforeSha?: string;
  afterSha?: string;
  failedCommit?: PatchCommitSummary;
  statusOutput?: string;
  error?: string;
};

export type PatchTestApplyResult = {
  repo: string;
  patch: PatchRefSummary;
  target: string;
  targetSha: string;
  base: string;
  baseSha: string;
  status: "applies" | "blocked" | "conflict" | "up_to_date";
  applied: PatchCommitSummary[];
  skipped: PatchCommitSummary[];
  dependencies: PatchRefDependency[];
  missingDependencies: PatchRefDependency[];
  failedCommit?: PatchCommitSummary;
  statusOutput?: string;
  error?: string;
};

export type PatchExplainResult = {
  repo: string;
  branch: string;
  branchSha: string;
  upstream: string;
  upstreamSha: string;
  baseSha: string;
  matchedPatches: Array<PatchRefSummary & { firstCommitIndex: number; matchedCommitCount: number }>;
  unmatchedCommits: PatchCommitSummary[];
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
  const patchBranches = report.upstreamExists
    ? await listPatchRefs(repoPath, { patchPrefix: report.patchPrefix, base: report.upstreamRef }).catch(() => report.patchBranches)
    : report.patchBranches;
  const stackedIssues = patchBranches.flatMap((patchBranch) => {
    const enriched = patchBranch as Partial<PatchRefSummary>;
    if (enriched.status !== "stacked" || !enriched.dependencies) {
      return [];
    }
    return [`${patchBranch.name} is stacked on ${enriched.dependencies.map((dependency) => dependency.name).join(", ")}`];
  });
  const issues = [...report.issues, ...stackedIssues];

  return {
    path: repoPath,
    currentBranch: report.currentBranch,
    mainBranch: report.targetBranch,
    upstreamBranch: report.upstreamRef,
    patchPrefix: report.patchPrefix,
    clean: report.clean,
    mainExists: report.targetExists,
    upstreamExists: report.upstreamExists,
    patchBranches,
    ready: issues.length === 0,
    issues,
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

export async function listPatchRefs(repoPath: string, options: {
  patchPrefix?: string;
  base?: string;
  config?: PatchMoiConfig;
} = {}): Promise<PatchRefSummary[]> {
  const config = patchWorkspaceConfig(options);
  const patchPrefix = options.patchPrefix ?? config.git.patchPrefix;
  const upstreamBase = options.base ?? canonicalUpstreamRef(config);
  const upstreamBaseSha = await resolveCommit(repoPath, upstreamBase);
  const rawRefs = await listPatchRefRecords(repoPath, patchPrefix);
  const summaries: PatchRefSummary[] = await Promise.all(rawRefs.map(async (ref) => {
    const inferredBaseSha = (await git(repoPath, ["merge-base", upstreamBaseSha, ref.sha])).stdout.trim();
    const commitCount = Number((await git(repoPath, ["rev-list", "--count", `${inferredBaseSha}..${ref.sha}`])).stdout.trim() || "0");
    return {
      ...ref,
      patchPrefix,
      upstreamBase,
      upstreamBaseSha,
      inferredBaseSha,
      status: "independent",
      dependencies: [],
      commitCount,
    };
  }));

  for (const patch of summaries) {
    const dependencies: PatchRefDependency[] = [];
    for (const candidate of summaries) {
      if (candidate.fullRef === patch.fullRef || candidate.sha === patch.sha) {
        continue;
      }
      const ancestor = await git(repoPath, ["merge-base", "--is-ancestor", candidate.sha, patch.sha], { allowFailure: true });
      if (ancestor.code === 0) {
        dependencies.push({
          name: candidate.name,
          fullRef: candidate.fullRef,
          sha: candidate.sha,
        });
      }
    }
    dependencies.sort((left, right) => left.name.localeCompare(right.name));
    patch.dependencies = dependencies;
    patch.status = dependencies.length > 0 ? "stacked" : "independent";
  }

  return summaries.sort((left, right) => left.name.localeCompare(right.name));
}

export async function inspectPatchRef(repoPath: string, options: {
  patchRef: string;
  base?: string;
  patchPrefix?: string;
  config?: PatchMoiConfig;
}): Promise<PatchInspectResult> {
  const patch = await findPatchRef(repoPath, options.patchRef, options);
  const commits = await listCommitSummaries(repoPath, patch.inferredBaseSha, patch.sha);
  const filesResult = await git(repoPath, ["diff", "--name-only", `${patch.inferredBaseSha}..${patch.sha}`], { allowFailure: true });
  const files = filesResult.stdout.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
  return {
    repo: repoPath,
    patch,
    commits,
    files,
    warnings: patch.status === "stacked"
      ? [`${patch.name} depends on ${patch.dependencies.map((dependency) => dependency.name).join(", ")}`]
      : [],
  };
}

export async function testApplyPatchRef(repoPath: string, options: {
  patchRef: string;
  base?: string;
  to?: string;
  patchPrefix?: string;
  config?: PatchMoiConfig;
}): Promise<PatchTestApplyResult> {
  const patch = await findPatchRef(repoPath, options.patchRef, options);
  const target = options.to ?? options.base ?? patch.upstreamBase;
  const targetSha = await resolveCommit(repoPath, target);
  const plan = await planPatchReplay(repoPath, patch, targetSha);
  const base = options.base ?? patch.upstreamBase;
  const baseSha = await resolveCommit(repoPath, base);
  if (plan.missingDependencies.length > 0) {
    return {
      repo: repoPath,
      patch,
      target,
      targetSha,
      base,
      baseSha,
      status: "blocked",
      applied: [],
      skipped: plan.skipped,
      dependencies: patch.dependencies,
      missingDependencies: plan.missingDependencies,
    };
  }
  if (plan.commits.length === 0) {
    return {
      repo: repoPath,
      patch,
      target,
      targetSha,
      base,
      baseSha,
      status: "up_to_date",
      applied: [],
      skipped: plan.skipped,
      dependencies: patch.dependencies,
      missingDependencies: [],
    };
  }

  const worktreePath = await mkdtemp(join(tmpdir(), "patch-moi-test-apply-"));
  try {
    await git(repoPath, ["worktree", "add", "--detach", worktreePath, targetSha]);
    const applied: PatchCommitSummary[] = [];
    for (const commit of plan.commits) {
      const pick = await git(worktreePath, ["cherry-pick", commit.sha], { allowFailure: true });
      if (pick.code !== 0) {
        const status = await git(worktreePath, ["status", "--short", "--branch"], { allowFailure: true });
        return {
          repo: repoPath,
          patch,
          target,
          targetSha,
          base,
          baseSha,
          status: "conflict",
          applied,
          skipped: plan.skipped,
          dependencies: patch.dependencies,
          missingDependencies: [],
          failedCommit: commit,
          statusOutput: status.stdout,
          error: pick.stderr.trim() || pick.stdout.trim(),
        };
      }
      applied.push(commit);
    }
    return {
      repo: repoPath,
      patch,
      target,
      targetSha,
      base,
      baseSha,
      status: "applies",
      applied,
      skipped: plan.skipped,
      dependencies: patch.dependencies,
      missingDependencies: [],
    };
  } finally {
    await git(repoPath, ["worktree", "remove", "--force", worktreePath], { allowFailure: true });
    await rm(worktreePath, { recursive: true, force: true });
  }
}

export async function applyPatchRef(repoPath: string, options: {
  patchRef: string;
  to: string;
  base?: string;
  createBranch?: boolean;
  patchPrefix?: string;
  config?: PatchMoiConfig;
}): Promise<PatchApplyResult> {
  await requireClean(repoPath);
  const patch = await findPatchRef(repoPath, options.patchRef, options);
  const targetBranch = normalizeLocalBranchName(options.to);
  const base = options.base ?? patch.upstreamBase;
  const baseSha = await resolveCommit(repoPath, base);
  const beforeSha = await resolveCommit(repoPath, `refs/heads/${targetBranch}`).catch(() => undefined);
  if (!beforeSha && !options.createBranch) {
    throw new Error(`${targetBranch} does not exist; rerun with --create-branch to create it from ${base}`);
  }
  const targetSha = beforeSha ?? baseSha;
  const plan = await planPatchReplay(repoPath, patch, targetSha);
  if (plan.missingDependencies.length > 0) {
    return {
      repo: repoPath,
      patch,
      targetBranch,
      targetSha,
      base,
      baseSha,
      status: "blocked",
      applied: [],
      skipped: plan.skipped,
      dependencies: patch.dependencies,
      missingDependencies: plan.missingDependencies,
      ...(beforeSha ? { beforeSha } : {}),
    };
  }
  if (!beforeSha) {
    await git(repoPath, ["switch", "-c", targetBranch, baseSha]);
  } else {
    await git(repoPath, ["switch", targetBranch]);
  }
  if (plan.commits.length === 0) {
    return {
      repo: repoPath,
      patch,
      targetBranch,
      targetSha,
      base,
      baseSha,
      status: "up_to_date",
      applied: [],
      skipped: plan.skipped,
      dependencies: patch.dependencies,
      missingDependencies: [],
      ...(beforeSha ? { beforeSha } : {}),
      afterSha: targetSha,
    };
  }

  const applied: PatchCommitSummary[] = [];
  for (const commit of plan.commits) {
    const pick = await git(repoPath, ["cherry-pick", commit.sha], { allowFailure: true });
    if (pick.code !== 0) {
      const status = await git(repoPath, ["status", "--short", "--branch"], { allowFailure: true });
      return {
        repo: repoPath,
        patch,
        targetBranch,
        targetSha,
        base,
        baseSha,
        status: "needs_intervention",
        applied,
        skipped: plan.skipped,
        dependencies: patch.dependencies,
        missingDependencies: [],
        ...(beforeSha ? { beforeSha } : {}),
        failedCommit: commit,
        statusOutput: status.stdout,
        error: pick.stderr.trim() || pick.stdout.trim(),
      };
    }
    applied.push(commit);
  }
  const afterSha = await resolveCommit(repoPath, "HEAD");
  return {
    repo: repoPath,
    patch,
    targetBranch,
    targetSha,
    base,
    baseSha,
    status: "changed",
    applied,
    skipped: plan.skipped,
    dependencies: patch.dependencies,
    missingDependencies: [],
    ...(beforeSha ? { beforeSha } : {}),
    afterSha,
  };
}

export async function explainPatchBranch(repoPath: string, options: {
  branch: string;
  upstream?: string;
  patchPrefix?: string;
  config?: PatchMoiConfig;
}): Promise<PatchExplainResult> {
  const config = patchWorkspaceConfig(options);
  const upstream = options.upstream ?? canonicalUpstreamRef(config);
  const branchSha = await resolveCommit(repoPath, options.branch);
  const upstreamSha = await resolveCommit(repoPath, upstream);
  const baseSha = (await git(repoPath, ["merge-base", upstreamSha, branchSha])).stdout.trim();
  const branchCommits = await listCommitSummaries(repoPath, baseSha, branchSha);
  const branchPatchIds = new Map<string, number>();
  branchCommits.forEach((commit, index) => {
    if (commit.patchId && !branchPatchIds.has(commit.patchId)) {
      branchPatchIds.set(commit.patchId, index);
    }
  });
  const patches = await listPatchRefs(repoPath, {
    config,
    patchPrefix: options.patchPrefix ?? config.git.patchPrefix,
    base: upstream,
  });
  const matchedPatches = [];
  const consumedPatchIds = new Set<string>();
  for (const patch of patches) {
    const patchCommits = await listCommitSummaries(repoPath, patch.inferredBaseSha, patch.sha);
    const patchIds = patchCommits.map((commit) => commit.patchId).filter((patchId): patchId is string => Boolean(patchId));
    if (patchIds.length === 0 || !patchIds.every((patchId) => branchPatchIds.has(patchId))) {
      continue;
    }
    for (const patchId of patchIds) {
      consumedPatchIds.add(patchId);
    }
    matchedPatches.push({
      ...patch,
      firstCommitIndex: Math.min(...patchIds.map((patchId) => branchPatchIds.get(patchId) ?? Number.MAX_SAFE_INTEGER)),
      matchedCommitCount: patchIds.length,
    });
  }
  matchedPatches.sort((left, right) => left.firstCommitIndex - right.firstCommitIndex || left.name.localeCompare(right.name));
  const unmatchedCommits = branchCommits.filter((commit) => !commit.patchId || !consumedPatchIds.has(commit.patchId));
  return {
    repo: repoPath,
    branch: options.branch,
    branchSha,
    upstream,
    upstreamSha,
    baseSha,
    matchedPatches,
    unmatchedCommits,
  };
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

export async function createPatchWorkBranch(repoPath: string, options: {
  branch: string;
  base: string;
}): Promise<PatchWorkBranchResult> {
  await requireClean(repoPath);
  await resolveCommit(repoPath, options.base);
  await git(repoPath, ["switch", "-c", options.branch, options.base]);
  const sha = (await git(repoPath, ["rev-parse", "HEAD"])).stdout.trim();
  return {
    status: "created",
    repo: repoPath,
    branch: options.branch,
    base: options.base,
    sha,
  };
}

export async function resolvePatchRef(repoPath: string, ref: string): Promise<string> {
  return await resolveCommit(repoPath, ref);
}

export async function listPatchCandidates(repoPath: string, options: {
  remote?: string;
  pattern?: string;
} = {}): Promise<{ repo: string; remote?: string; pattern: string; candidates: PatchCandidateSummary[] }> {
  const pattern = normalizeCandidatePattern(options.pattern);
  const refs = options.remote
    ? [`refs/remotes/${options.remote}/${pattern}`]
    : [`refs/heads/${pattern}`, `refs/remotes/*/${pattern}`];
  const candidates = uniqueCandidates(
    (await Promise.all(refs.map((refPattern) => listCandidateRefPattern(repoPath, refPattern, options.remote))))
      .flat(),
  );
  return {
    repo: repoPath,
    ...(options.remote ? { remote: options.remote } : {}),
    pattern,
    candidates,
  };
}

export async function pullPatchCandidate(repoPath: string, options: {
  remote: string;
  branch: string;
  ffOnly?: boolean;
}): Promise<PatchPullResult> {
  await requireClean(repoPath);
  const branch = normalizeBranchName(options.branch, options.remote);
  const remoteRef = `refs/remotes/${options.remote}/${branch}`;
  await git(repoPath, ["fetch", options.remote, `refs/heads/${branch}:${remoteRef}`]);
  const remoteSha = await resolveCommit(repoPath, remoteRef);
  const localRef = `refs/heads/${branch}`;
  const beforeSha = await resolveCommit(repoPath, localRef).catch(() => undefined);
  if (beforeSha) {
    const ancestor = await git(repoPath, ["merge-base", "--is-ancestor", beforeSha, remoteSha], { allowFailure: true });
    if (ancestor.code !== 0) {
      throw new Error(`${branch} cannot fast-forward to ${options.remote}/${branch}`);
    }
  }

  const current = await currentBranch(repoPath);
  if (beforeSha) {
    if (current === branch) {
      await git(repoPath, ["merge", "--ff-only", remoteRef]);
    } else {
      await git(repoPath, ["branch", "-f", branch, remoteRef]);
    }
  } else {
    await git(repoPath, ["branch", branch, remoteRef]);
  }

  const afterSha = await resolveCommit(repoPath, localRef);
  return {
    repo: repoPath,
    remote: options.remote,
    branch,
    ...(beforeSha ? { beforeSha } : {}),
    afterSha,
    status: beforeSha === afterSha ? "up_to_date" : "changed",
  };
}

type PatchRefRecord = PatchBranchSummary & {
  fullRef: string;
  source: "local" | "remote";
  remote?: string;
};

type PatchReplayPlan = {
  commits: PatchCommitSummary[];
  skipped: PatchCommitSummary[];
  missingDependencies: PatchRefDependency[];
};

async function listPatchRefRecords(repoPath: string, patchPrefix: string): Promise<PatchRefRecord[]> {
  const normalizedPrefix = patchPrefix.replace(/\/+$/, "");
  const result = await git(repoPath, [
    "for-each-ref",
    "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(contents:subject)",
    `refs/heads/${normalizedPrefix}`,
    "refs/remotes",
  ], { allowFailure: true });
  if (result.code !== 0 || !result.stdout.trim()) {
    return [];
  }
  const refs: PatchRefRecord[] = [];
  for (const line of result.stdout.trim().split(/\r?\n/)) {
    const [fullRef = "", shortRef = "", sha = "", subject = ""] = line.split("\t");
    if (!fullRef || shortRef.endsWith("/HEAD")) {
      continue;
    }
    if (fullRef.startsWith("refs/heads/")) {
      if (!shortRef.startsWith(patchPrefix)) {
        continue;
      }
      refs.push({
        name: shortRef,
        fullRef,
        source: "local",
        sha,
        subject,
      });
      continue;
    }
    const remoteMatch = fullRef.match(/^refs\/remotes\/([^/]+)\/(.+)$/);
    if (!remoteMatch?.[1] || !remoteMatch[2]?.startsWith(patchPrefix)) {
      continue;
    }
    refs.push({
      name: `${remoteMatch[1]}/${remoteMatch[2]}`,
      fullRef,
      source: "remote",
      remote: remoteMatch[1],
      sha,
      subject,
    });
  }
  return refs.sort((left, right) => left.name.localeCompare(right.name));
}

async function findPatchRef(repoPath: string, patchRef: string, options: {
  patchPrefix?: string;
  base?: string;
  config?: PatchMoiConfig;
}): Promise<PatchRefSummary> {
  const refs = await listPatchRefs(repoPath, options);
  const ref = refs.find((candidate) =>
    candidate.name === patchRef ||
    candidate.fullRef === patchRef ||
    candidate.fullRef === `refs/heads/${patchRef}` ||
    candidate.fullRef === `refs/remotes/${patchRef}`
  );
  if (!ref) {
    throw new Error(`patch ref not found: ${patchRef}`);
  }
  return ref;
}

async function planPatchReplay(repoPath: string, patch: PatchRefSummary, targetSha: string): Promise<PatchReplayPlan> {
  const targetPatchIds = await patchIdsForRange(repoPath, patch.upstreamBaseSha, targetSha);
  const missingDependencies: PatchRefDependency[] = [];
  for (const dependency of patch.dependencies) {
    const dependencyPatch = await findPatchByFullRef(repoPath, dependency.fullRef, {
      patchPrefix: patch.patchPrefix,
      base: patch.upstreamBase,
    });
    const dependencyPatchIds = await patchIdsForRange(repoPath, dependencyPatch.inferredBaseSha, dependencyPatch.sha);
    const present = [...dependencyPatchIds.keys()].every((patchId) => targetPatchIds.has(patchId));
    if (!present) {
      missingDependencies.push(dependency);
    }
  }
  const patchCommits = await listCommitSummaries(repoPath, patch.inferredBaseSha, patch.sha);
  const commits: PatchCommitSummary[] = [];
  const skipped: PatchCommitSummary[] = [];
  for (const commit of patchCommits) {
    if (commit.patchId && targetPatchIds.has(commit.patchId)) {
      skipped.push(commit);
      continue;
    }
    commits.push(commit);
  }
  return { commits, skipped, missingDependencies };
}

async function findPatchByFullRef(repoPath: string, fullRef: string, options: {
  patchPrefix: string;
  base: string;
}): Promise<PatchRefSummary> {
  const refs = await listPatchRefs(repoPath, options);
  const patch = refs.find((candidate) => candidate.fullRef === fullRef);
  if (!patch) {
    throw new Error(`dependency ref disappeared: ${fullRef}`);
  }
  return patch;
}

async function listCommitSummaries(repoPath: string, baseSha: string, headSha: string): Promise<PatchCommitSummary[]> {
  const result = await git(repoPath, ["rev-list", "--reverse", `${baseSha}..${headSha}`]);
  const commits = result.stdout.split(/\r?\n/).map((sha) => sha.trim()).filter(Boolean);
  return await Promise.all(commits.map(async (sha) => {
    const [subject, patchId] = await Promise.all([
      git(repoPath, ["show", "-s", "--format=%s", sha]),
      patchIdForCommit(repoPath, sha),
    ]);
    return {
      sha,
      subject: subject.stdout.trim(),
      ...(patchId ? { patchId } : {}),
    };
  }));
}

async function patchIdsForRange(repoPath: string, baseSha: string, headSha: string): Promise<Map<string, PatchCommitSummary>> {
  const commits = await listCommitSummaries(repoPath, baseSha, headSha);
  const patchIds = new Map<string, PatchCommitSummary>();
  for (const commit of commits) {
    if (commit.patchId && !patchIds.has(commit.patchId)) {
      patchIds.set(commit.patchId, commit);
    }
  }
  return patchIds;
}

async function patchIdForCommit(repoPath: string, sha: string): Promise<string | undefined> {
  const diff = await git(repoPath, ["show", "--format=", "--patch", sha]);
  if (!diff.stdout.trim()) {
    return undefined;
  }
  const proc = Bun.spawn({
    cmd: ["git", "patch-id", "--stable"],
    cwd: repoPath,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(diff.stdout);
  proc.stdin.end();
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`git patch-id --stable failed in ${repoPath}: ${stderr.trim() || stdout.trim() || `exit ${code}`}`);
  }
  return stdout.trim().split(/\s+/)[0] || undefined;
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

async function listCandidateRefPattern(
  repoPath: string,
  refPattern: string,
  requestedRemote: string | undefined,
): Promise<PatchCandidateSummary[]> {
  const result = await git(repoPath, [
    "for-each-ref",
    "--format=%(refname:short)%09%(objectname)%09%(contents:subject)",
    refPattern,
  ], { allowFailure: true });
  if (result.code !== 0 || !result.stdout.trim()) {
    return [];
  }
  return result.stdout.trim().split(/\r?\n/).flatMap((line) => {
    const [shortRef = "", sha = "", subject = ""] = line.split("\t");
    if (!shortRef || shortRef.endsWith("/HEAD")) {
      return [];
    }
    const remote = requestedRemote ?? remoteFromShortRef(shortRef);
    const ref = remote ? shortRef.slice(remote.length + 1) : shortRef;
    return [{
      ref,
      sha,
      subject,
      ...(remote ? { remote } : {}),
    }];
  }).sort((left, right) => `${left.remote ?? ""}/${left.ref}`.localeCompare(`${right.remote ?? ""}/${right.ref}`));
}

function remoteFromShortRef(shortRef: string): string | undefined {
  return shortRef.includes("/") && !shortRef.startsWith("patch/") && !shortRef.startsWith("candidate/")
    ? shortRef.slice(0, shortRef.indexOf("/"))
    : undefined;
}

function normalizeCandidatePattern(value: string | undefined): string {
  const trimmed = value?.trim() || "candidate/*";
  return trimmed
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\/\*?\//, "")
    .replace(/^\/+/, "");
}

function normalizeBranchName(value: string, remote: string): string {
  const trimmed = value.trim()
    .replace(/^refs\/heads\//, "")
    .replace(new RegExp(`^${escapeRegExp(remote)}/`), "");
  if (!trimmed || trimmed.startsWith("refs/")) {
    throw new Error(`invalid branch name: ${value}`);
  }
  return trimmed;
}

function normalizeLocalBranchName(value: string): string {
  const trimmed = value.trim().replace(/^refs\/heads\//, "");
  if (!trimmed || trimmed.startsWith("refs/") || trimmed.includes("..")) {
    throw new Error(`invalid local branch name: ${value}`);
  }
  return trimmed;
}

function uniqueCandidates(candidates: PatchCandidateSummary[]): PatchCandidateSummary[] {
  const seen = new Set<string>();
  const result: PatchCandidateSummary[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.remote ?? ""}:${candidate.ref}:${candidate.sha}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
