#!/usr/bin/env bun

import { existsSync } from "node:fs";
import path from "node:path";
import { loadPatchMoiConfig, type PatchMoiConfig } from "./config";
import {
  capturePatchBranch,
  createPatchWorkBranch,
  inspectPatchWorkspace,
  listPatchBranches,
  listPatchCandidates,
  pullPatchCandidate,
  rebuildPatchMain,
  resolvePatchRef,
} from "./patch-workspace";

type CliOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
};

type ParsedArgs = {
  positionals: string[];
  flags: Map<string, string[]>;
};

class UsageError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

const usage = `patch.moi CLI

Usage:
  patch.moi work start feature --title TITLE --repo DIR --branch BRANCH --base REF [--patch-branch patch/NAME] [--create-branch] [--json]
  patch.moi patch doctor [--repo DIR] [--main BRANCH] [--upstream-remote REMOTE] [--upstream-branch BRANCH] [--fork-remote REMOTE] [--json]
  patch.moi patch list [--repo DIR] [--prefix patch/] [--json]
  patch.moi patch candidates [--repo DIR] [--remote REMOTE] [--pattern candidate/*] [--json]
  patch.moi patch capture patch/NAME --from BRANCH [--base BRANCH] [--repo DIR] [--message MSG] [--force] [--json]
  patch.moi patch rebuild [--base BRANCH] [--to BRANCH] [--repo DIR] [--prefix patch/] [--json]
  patch.moi patch pull --repo DIR --remote REMOTE --branch BRANCH [--ff-only] [--json]
  patch.moi setup fork --repo DIR --upstream-url URL [--upstream-remote REMOTE] [--target-branch BRANCH] [--apply] [--json]
`;

export async function runCli(args = Bun.argv.slice(2), options: CliOptions = {}): Promise<number> {
  const parsed = parseArgs(args);
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const out = options.stdout ?? ((text) => process.stdout.write(text));
  const err = options.stderr ?? ((text) => process.stderr.write(text));

  try {
    if (parsed.positionals.length === 0 || flagBool(parsed, "help") || flagBool(parsed, "h")) {
      out(usage);
      return 0;
    }

    const context = cliContext(parsed, cwd, env, out, err);
    switch (parsed.positionals[0]) {
      case "work":
        return await handleWork(parsed.positionals.slice(1), context);
      case "patch":
        return await handlePatch(parsed.positionals.slice(1), context);
      case "setup":
        return await handleSetup(parsed.positionals.slice(1), context);
      default:
        throw new UsageError(`unknown command: ${parsed.positionals[0]}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      err(`error: ${error.message}\n`);
      return error.exitCode;
    }
    err(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

type CliContext = {
  parsed: ParsedArgs;
  cwd: string;
  env: Record<string, string | undefined>;
  workspaceRoot: string;
  json: boolean;
  stdout: (text: string) => void;
};

function cliContext(
  parsed: ParsedArgs,
  cwd: string,
  env: Record<string, string | undefined>,
  stdout: (text: string) => void,
  _stderr: (text: string) => void,
): CliContext {
  const workspaceRoot = resolvePath(cwd, flagValue(parsed, "workspace-root") ?? findWorkspaceRoot(cwd));
  return {
    parsed,
    cwd,
    env,
    workspaceRoot,
    json: flagBool(parsed, "json"),
    stdout,
  };
}

async function handleWork(positionals: string[], context: CliContext): Promise<number> {
  if (positionals[0] !== "start" || positionals[1] !== "feature") {
    throw new UsageError("work requires start feature");
  }
  const title = flagValue(context.parsed, "title");
  const branch = flagValue(context.parsed, "branch");
  const base = flagValue(context.parsed, "base");
  if (!title) throw new UsageError("work start feature requires --title");
  if (!branch) throw new UsageError("work start feature requires --branch");
  if (!base) throw new UsageError("work start feature requires --base");

  const repo = patchRepoPath(context);
  const baseSha = await resolvePatchRef(repo, base);
  const branchResult = flagBool(context.parsed, "create-branch")
    ? await createPatchWorkBranch(repo, { branch, base })
    : undefined;
  const workBranchSha = branchResult?.sha ?? await resolvePatchRef(repo, branch);
  const result = {
    kind: "feature",
    title,
    repo,
    baseRef: base,
    baseSha,
    workBranch: branch,
    workBranchSha,
    ...(flagValue(context.parsed, "patch-branch") ? { patchBranch: flagValue(context.parsed, "patch-branch") } : {}),
    createdBranch: Boolean(branchResult),
  };
  writeOutput(context, result, (value) => {
    writeLine(context, `feature: ${value.title}`);
    writeLine(context, `branch: ${value.workBranch} ${value.workBranchSha}`);
    if (value.patchBranch) writeLine(context, `patch: ${value.patchBranch}`);
  });
  return 0;
}

async function handlePatch(positionals: string[], context: CliContext): Promise<number> {
  const action = positionals[0];
  if (!action) {
    throw new UsageError("patch requires doctor, list, candidates, capture, rebuild, or pull");
  }
  const repoPath = patchRepoPath(context);
  const config = await configForRepo(repoPath, context);
  const mainBranch = flagValue(context.parsed, "main") ?? config.git.targetBranch;
  const upstreamBranch = flagValue(context.parsed, "upstream-branch") ?? flagValue(context.parsed, "upstream") ?? config.git.upstreamBranch;
  const upstreamRemote = flagValue(context.parsed, "upstream-remote") ?? config.git.upstreamRemote;
  const forkRemote = flagValue(context.parsed, "fork-remote") ?? config.git.forkRemote;
  const patchPrefix = flagValue(context.parsed, "prefix") ?? config.git.patchPrefix;
  const effectiveConfig = {
    ...config,
    git: {
      ...config.git,
      targetBranch: mainBranch,
      upstreamBranch,
      upstreamRemote,
      forkRemote,
      patchPrefix,
    },
  };

  if (action === "doctor") {
    const report = await inspectPatchWorkspace(repoPath, {
      config: effectiveConfig,
      mainBranch,
      upstreamBranch,
      upstreamRemote,
      forkRemote,
      patchPrefix,
    });
    writeOutput(context, report, (value) => {
      writeLine(context, `repo: ${value.path}`);
      writeLine(context, `branch: ${value.currentBranch ?? "detached"}`);
      writeLine(context, `main: ${value.mainExists ? value.mainBranch : "missing"}`);
      writeLine(context, `upstream: ${value.upstreamExists ? value.upstreamBranch : "missing"}`);
      writeLine(context, `patches: ${value.patchBranches.length}`);
      writeLine(context, `worktree: ${value.clean ? "clean" : "dirty"}`);
      writeLine(context, `ready: ${value.ready ? "yes" : "no"}`);
      for (const issue of value.issues) writeLine(context, `- ${issue}`);
    });
    return report.ready ? 0 : 1;
  }

  if (action === "list") {
    const branches = await listPatchBranches(repoPath, patchPrefix);
    writeOutput(context, { repo: repoPath, patchBranches: branches }, (value) => {
      for (const branch of value.patchBranches) {
        writeLine(context, `${branch.name} ${branch.sha.slice(0, 12)} ${branch.subject}`);
      }
    });
    return 0;
  }

  if (action === "candidates") {
    const result = await listPatchCandidates(repoPath, {
      remote: flagValue(context.parsed, "remote"),
      pattern: flagValue(context.parsed, "pattern"),
    });
    writeOutput(context, result, (value) => {
      for (const candidate of value.candidates) {
        writeLine(context, `${candidate.remote ? `${candidate.remote}/` : ""}${candidate.ref} ${candidate.sha.slice(0, 12)} ${candidate.subject}`);
      }
    });
    return 0;
  }

  if (action === "capture") {
    const patchBranch = positionals[1];
    const from = flagValue(context.parsed, "from");
    if (!patchBranch) throw new UsageError("patch capture requires patch/NAME");
    if (!from) throw new UsageError("patch capture requires --from");
    const result = await capturePatchBranch(repoPath, {
      patchBranch,
      from,
      base: flagValue(context.parsed, "base") ?? mainBranch,
      message: flagValue(context.parsed, "message"),
      force: flagBool(context.parsed, "force"),
      patchPrefix,
    });
    writeOutput(context, result, (value) => {
      writeLine(context, `${value.status}: ${value.patchBranch}${value.sha ? ` ${value.sha}` : ""}`);
    });
    return 0;
  }

  if (action === "rebuild") {
    const result = await rebuildPatchMain(repoPath, {
      config: effectiveConfig,
      base: flagValue(context.parsed, "base"),
      targetBranch: flagValue(context.parsed, "to") ?? mainBranch,
      patchPrefix,
    });
    writeOutput(context, result, (value) => {
      writeLine(context, `${value.status}: ${value.targetBranch}${value.afterSha ? ` ${value.afterSha}` : ""}`);
      for (const patch of value.applied) writeLine(context, `- ${patch.name} ${patch.sha.slice(0, 12)}`);
      if (value.failedPatch) writeLine(context, `failed: ${value.failedPatch.name}`);
      if (value.error) writeLine(context, value.error);
    });
    return result.status === "needs_intervention" ? 1 : 0;
  }

  if (action === "pull") {
    const remote = flagValue(context.parsed, "remote");
    const branch = flagValue(context.parsed, "branch");
    if (!remote) throw new UsageError("patch pull requires --remote");
    if (!branch) throw new UsageError("patch pull requires --branch");
    assertPullAllowed(config, context.env);
    const result = await pullPatchCandidate(repoPath, {
      remote,
      branch,
      ffOnly: flagBool(context.parsed, "ff-only"),
    });
    writeOutput(context, result, (value) => {
      writeLine(context, `${value.status}: ${value.branch} ${value.afterSha}`);
    });
    return 0;
  }

  throw new UsageError(`unknown patch action: ${action}`);
}

async function handleSetup(positionals: string[], context: CliContext): Promise<number> {
  const target = positionals[0];
  if (target !== "fork") {
    throw new UsageError("setup requires fork");
  }
  const repoArg = flagValue(context.parsed, "repo") ?? context.env.PATCH_MOI_PATCH_REPO;
  if (!repoArg) {
    throw new UsageError("setup fork requires --repo");
  }
  const upstreamUrl = flagValue(context.parsed, "upstream-url") ?? context.env.PATCH_MOI_UPSTREAM_URL;
  if (!upstreamUrl) {
    throw new UsageError("setup fork requires --upstream-url");
  }
  const repoPath = resolvePath(context.workspaceRoot, repoArg);
  const upstreamRemote = flagValue(context.parsed, "upstream-remote") ?? "upstream";
  const targetBranch = flagValue(context.parsed, "target-branch") ?? "main";
  const apply = flagBool(context.parsed, "apply");
  const repo = await inspectGitRepo(repoPath, {
    upstreamRemote,
    upstreamUrl,
    targetBranch,
    apply,
  });

  writeOutput(context, repo, (value) => {
    writeLine(context, `repo: ${value.path}`);
    writeLine(context, `branch: ${value.branch ?? "unknown"}${value.branchMatchesTarget ? "" : ` (expected ${targetBranch})`}`);
    writeLine(context, `origin: ${value.origin ?? "missing"}`);
    writeLine(context, `${upstreamRemote}: ${value.upstream ?? "missing"}`);
    writeLine(context, `worktree: ${value.clean ? "clean" : "dirty"}`);
    if (value.addedUpstream) writeLine(context, `added ${upstreamRemote}: ${upstreamUrl}`);
    writeLine(context, `ready: ${value.ready ? "yes" : "no"}`);
    for (const issue of value.issues) writeLine(context, `- ${issue}`);
  });
  return 0;
}

type ForkSetupReport = {
  path: string;
  branch?: string;
  branchMatchesTarget: boolean;
  origin?: string;
  upstream?: string;
  upstreamRemote: string;
  upstreamUrl: string;
  addedUpstream: boolean;
  clean: boolean;
  ready: boolean;
  issues: string[];
};

async function inspectGitRepo(
  repoPath: string,
  options: {
    upstreamRemote: string;
    upstreamUrl: string;
    targetBranch: string;
    apply: boolean;
  },
): Promise<ForkSetupReport> {
  await git(repoPath, ["rev-parse", "--is-inside-work-tree"]);
  const [branchResult, originResult, upstreamResult, statusResult] = await Promise.all([
    git(repoPath, ["symbolic-ref", "--short", "HEAD"]),
    git(repoPath, ["remote", "get-url", "origin"], { allowFailure: true }),
    git(repoPath, ["remote", "get-url", options.upstreamRemote], { allowFailure: true }),
    git(repoPath, ["status", "--porcelain=v1"]),
  ]);
  let upstream = upstreamResult.code === 0 ? upstreamResult.stdout.trim() : undefined;
  let addedUpstream = false;
  if (!upstream && options.apply) {
    await git(repoPath, ["remote", "add", options.upstreamRemote, options.upstreamUrl]);
    upstream = options.upstreamUrl;
    addedUpstream = true;
  }
  const branch = branchResult.stdout.trim();
  const origin = originResult.code === 0 ? originResult.stdout.trim() : undefined;
  const clean = statusResult.stdout.trim().length === 0;
  const issues = [
    ...(origin ? [] : ["missing origin remote"]),
    ...(upstream ? [] : [`missing ${options.upstreamRemote} remote; rerun with --apply to add ${options.upstreamUrl}`]),
    ...(upstream && upstream !== options.upstreamUrl ? [`${options.upstreamRemote} points to ${upstream}, expected ${options.upstreamUrl}`] : []),
    ...(branch === options.targetBranch ? [] : [`current branch is ${branch}, expected ${options.targetBranch}`]),
    ...(clean ? [] : ["working tree has local changes or untracked files"]),
  ];
  return {
    path: repoPath,
    branch,
    branchMatchesTarget: branch === options.targetBranch,
    origin,
    upstream,
    upstreamRemote: options.upstreamRemote,
    upstreamUrl: options.upstreamUrl,
    addedUpstream,
    clean,
    ready: issues.length === 0,
    issues,
  };
}

async function configForRepo(repoPath: string, context: CliContext): Promise<PatchMoiConfig> {
  const config = await loadPatchMoiConfig(repoPath);
  return {
    git: {
      ...config.git,
      ...(flagValue(context.parsed, "upstream-remote") ? { upstreamRemote: flagValue(context.parsed, "upstream-remote")! } : {}),
      ...(flagValue(context.parsed, "upstream-branch") ? { upstreamBranch: flagValue(context.parsed, "upstream-branch")! } : {}),
      ...(flagValue(context.parsed, "fork-remote") ? { forkRemote: flagValue(context.parsed, "fork-remote")! } : {}),
      ...(flagValue(context.parsed, "main") ? { targetBranch: flagValue(context.parsed, "main")! } : {}),
      ...(flagValue(context.parsed, "prefix") ? { patchPrefix: flagValue(context.parsed, "prefix")! } : {}),
    },
    fetch: { ...config.fetch },
    safety: { ...config.safety },
  };
}

function assertPullAllowed(config: PatchMoiConfig, env: Record<string, string | undefined>): void {
  if (config.safety.allowPull || truthy(env.PATCH_MOI_ALLOW_PULL)) {
    return;
  }
  throw new UsageError("patch pull is gated; set [safety].allowPull=true in .patchmoi.toml or PATCH_MOI_ALLOW_PULL=1");
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

function patchRepoPath(context: CliContext): string {
  return resolvePath(context.workspaceRoot, flagValue(context.parsed, "repo") ?? context.env.PATCH_MOI_PATCH_REPO ?? ".");
}

function writeOutput<T>(context: CliContext, payload: T, text: (payload: T) => void): void {
  if (context.json) {
    writeJson(context, payload);
    return;
  }
  text(payload);
}

function writeJson(context: CliContext, value: unknown): void {
  writeLine(context, JSON.stringify(value, null, 2));
}

function writeLine(context: CliContext, value: string): void {
  context.stdout(`${value}\n`);
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const [rawName, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
      if (!rawName) continue;
      const values = flags.get(rawName) ?? [];
      if (inlineValue !== undefined) {
        values.push(inlineValue);
      } else if (args[index + 1] && !args[index + 1].startsWith("-")) {
        values.push(args[index + 1]);
        index += 1;
      } else {
        values.push("true");
      }
      flags.set(rawName, values);
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      flags.set(arg.slice(1), ["true"]);
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, flags };
}

function flagValue(parsed: ParsedArgs, name: string): string | undefined {
  const values = parsed.flags.get(name);
  const value = values?.at(-1);
  return value === "true" ? undefined : value;
}

function flagBool(parsed: ParsedArgs, name: string): boolean {
  const value = parsed.flags.get(name)?.at(-1);
  return value === "true" || value === "1" || value === "yes";
}

function resolvePath(cwd: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

function findWorkspaceRoot(cwd: string): string {
  let current = cwd;
  while (true) {
    if (existsSync(path.join(current, "package.json")) && existsSync(path.join(current, "apps/patch"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return cwd;
    }
    current = parent;
  }
}

function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "yes" || value === "on";
}

if (import.meta.main) {
  process.exit(await runCli());
}
