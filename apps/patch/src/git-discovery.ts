import type { PatchMoiConfig } from "./config";
import { canonicalUpstreamRef, defaultPatchMoiConfig } from "./config";

export type PatchBranchSummary = {
  name: string;
  sha: string;
  subject: string;
};

export type PatchGitDiscovery = {
  path: string;
  currentBranch?: string;
  clean: boolean;
  remotes: Record<string, string>;
  upstreamRemote: string;
  upstreamRemoteUrl?: string;
  upstreamBranch: string;
  upstreamRef: string;
  upstreamExists: boolean;
  forkRemote: string;
  forkRemoteUrl?: string;
  forkExists: boolean;
  targetBranch: string;
  targetRef: string;
  targetExists: boolean;
  patchPrefix: string;
  patchBranches: PatchBranchSummary[];
  latestTags: string[];
  ready: boolean;
  issues: string[];
};

export async function discoverPatchGitProject(
  repoPath: string,
  config: PatchMoiConfig = defaultPatchMoiConfig,
): Promise<PatchGitDiscovery> {
  await git(repoPath, ["rev-parse", "--is-inside-work-tree"]);
  const upstreamRef = canonicalUpstreamRef(config);
  const targetRef = `refs/heads/${config.git.targetBranch}`;
  const remoteNames = await remoteList(repoPath);
  const remotes = await remoteUrls(repoPath, remoteNames);
  const [current, status, upstreamExists, targetExists, patchBranches, latestTags] = await Promise.all([
    currentBranch(repoPath),
    git(repoPath, ["status", "--porcelain=v1"]),
    refExists(repoPath, upstreamRef),
    refExists(repoPath, targetRef),
    listPatchBranches(repoPath, config.git.patchPrefix),
    listLatestTags(repoPath),
  ]);
  const clean = status.stdout.trim().length === 0;
  const forkExists = Object.prototype.hasOwnProperty.call(remotes, config.git.forkRemote);
  const upstreamRemoteUrl = remotes[config.git.upstreamRemote];
  const forkRemoteUrl = remotes[config.git.forkRemote];
  const issues = [
    ...(forkExists ? [] : [`missing ${config.git.forkRemote} remote`]),
    ...(upstreamRemoteUrl ? [] : [`missing ${config.git.upstreamRemote} remote`]),
    ...(upstreamExists ? [] : [`missing ${upstreamRef}; run git fetch ${config.git.upstreamRemote} ${config.git.upstreamBranch}`]),
    ...(targetExists ? [] : [`missing ${config.git.targetBranch} branch`]),
    ...(patchBranches.length > 0 ? [] : [`no ${config.git.patchPrefix} branches found`]),
    ...(clean ? [] : ["working tree has local changes or untracked files"]),
  ];

  return {
    path: repoPath,
    currentBranch: current,
    clean,
    remotes,
    upstreamRemote: config.git.upstreamRemote,
    ...(upstreamRemoteUrl ? { upstreamRemoteUrl } : {}),
    upstreamBranch: config.git.upstreamBranch,
    upstreamRef,
    upstreamExists,
    forkRemote: config.git.forkRemote,
    ...(forkRemoteUrl ? { forkRemoteUrl } : {}),
    forkExists,
    targetBranch: config.git.targetBranch,
    targetRef,
    targetExists,
    patchPrefix: config.git.patchPrefix,
    patchBranches,
    latestTags,
    ready: issues.length === 0,
    issues,
  };
}

export async function fetchUpstream(repoPath: string, config: PatchMoiConfig): Promise<{
  repo: string;
  remote: string;
  branch: string;
  args: string[];
  stdout: string;
  stderr: string;
}> {
  const args = [
    "fetch",
    ...(config.fetch.prune ? ["--prune"] : []),
    ...(config.fetch.fetchTags ? ["--tags"] : []),
    ...(config.fetch.pruneTags ? ["--prune-tags"] : []),
    config.git.upstreamRemote,
    config.git.upstreamBranch,
  ];
  const result = await git(repoPath, args);
  return {
    repo: repoPath,
    remote: config.git.upstreamRemote,
    branch: config.git.upstreamBranch,
    args,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function remoteList(repoPath: string): Promise<string[]> {
  const result = await git(repoPath, ["remote"], { allowFailure: true });
  if (result.code !== 0 || !result.stdout.trim()) {
    return [];
  }
  return result.stdout.split(/\r?\n/).map((remote) => remote.trim()).filter(Boolean);
}

async function remoteUrls(repoPath: string, remotes: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(remotes.map(async (remote) => {
    const result = await git(repoPath, ["remote", "get-url", remote], { allowFailure: true });
    return result.code === 0 ? [remote, result.stdout.trim()] as const : undefined;
  }));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== undefined));
}

async function currentBranch(repoPath: string): Promise<string | undefined> {
  const result = await git(repoPath, ["symbolic-ref", "--short", "HEAD"], { allowFailure: true });
  return result.code === 0 ? result.stdout.trim() : undefined;
}

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  return (await git(repoPath, ["show-ref", "--verify", "--quiet", ref], { allowFailure: true })).code === 0;
}

async function listLatestTags(repoPath: string): Promise<string[]> {
  const result = await git(repoPath, ["tag", "--list", "--sort=-creatordate"], { allowFailure: true });
  if (result.code !== 0 || !result.stdout.trim()) {
    return [];
  }
  return result.stdout.split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
}

async function listPatchBranches(repoPath: string, patchPrefix = "patch/"): Promise<PatchBranchSummary[]> {
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
