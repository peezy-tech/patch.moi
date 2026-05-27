import path from "node:path";
import { spawn } from "node:child_process";

type AutomationContext = {
  automation: {
    config?: Record<string, unknown>;
  };
  event?: {
    id?: string;
    type?: string;
    payload?: Record<string, unknown>;
  };
  cwd?: string;
};

type CommandResult = {
  label: string;
  cmd: string[];
  cwd: string;
  code: number;
  stdout: string;
  stderr: string;
};

type PatchBranch = {
  name: string;
  sha: string;
  subject: string;
};

let context: AutomationContext;
let config: Record<string, unknown> = {};
let payload: Record<string, unknown> = {};
let commands: CommandResult[] = [];

let workspaceRoot = "";
let forkRepo = "";
let forkRepoFullName = "";
let targetBranch = "";
let upstreamBranch = "";
let patchPrefix = "";
let upstreamRemote = "";
let upstreamRepoUrl = "";
let verifyCommands: string[] = [];
let pushRemotes: string[] = [];

class Finished extends Error {
  constructor(readonly value: Record<string, unknown>) {
    super("automation finished");
  }
}

function finish(value: Record<string, unknown>): never {
  throw new Finished(value);
}

export default async function updateFork(input: AutomationContext) {
  context = input;
  config = context.automation.config ?? {};
  payload = context.event?.payload ?? {};
  commands = [];
  workspaceRoot = context.cwd ?? process.cwd();
  forkRepo = path.resolve(workspaceRoot, stringConfig("fork_repo", "harness/fork"));
  forkRepoFullName = stringConfig("fork_repo_full_name", "matamune-peezy/patch-moi-harness");
  targetBranch = stringConfig("target_branch", "main");
  upstreamBranch = stringConfig("upstream_branch", "upstream");
  patchPrefix = stringConfig("patch_prefix", "patch/");
  upstreamRemote = stringConfig("upstream_remote", "upstream");
  upstreamRepoUrl = stringConfig("upstream_repo_url", "https://github.com/peezy-tech/patch-moi-harness.git");
  verifyCommands = stringArrayConfig("verify_commands", ["npm test", "npm run pack:dry-run"]);
  pushRemotes = stringArrayConfig("push_remotes", ["origin", "jojo"]);

  try {
  const expectedRepo = stringConfig("expected_repo", "peezy-tech/patch-moi-harness");
  const repo = stringValue(payload.repo);
  if (repo !== expectedRepo) {
    finish({ status: "skipped", message: `Harness fork automation ignores ${repo}.` });
  }

  await requireGitRepo();
  await ensureUpstreamRemote();
  if (enabled("fetch", true)) {
    await run("fetch upstream refs", ["git", "fetch", upstreamRemote, "--tags", "--prune"]);
  }
  await requireNoRebaseOrCherryPickInProgress();
  await requireCleanWorktree("before harness patch rebuild");

  const base = await resolveBase();
  await run("update local upstream branch", ["git", "branch", "-f", upstreamBranch, base.sha]);
  await ensureSeedPatchBranches();

  const currentSha = (await runChecked("read harness checkout head", ["git", "rev-parse", "HEAD"])).stdout.trim();
  const targetExists = await branchExists(targetBranch);
  const beforeSha = targetExists ? await resolveCommit(targetBranch) : currentSha;
  const beforeTree = beforeSha ? await resolveTree(beforeSha) : "";
  const patchBranches = await listPatchBranches();
  if (patchBranches.length === 0) {
    finish({
      status: "blocked",
      message: `Harness fork has no ${patchPrefix} branches.`,
      artifacts: baseArtifacts(base),
    });
  }

  await run("switch to upstream rebuild base", ["git", "switch", "--detach", base.sha]);
  const applied: PatchBranch[] = [];
  for (const patchBranch of patchBranches) {
    const pick = await run(`apply ${patchBranch.name}`, ["git", "cherry-pick", patchBranch.sha], { allowFailure: true });
    if (pick.code !== 0) {
      const status = await run("patch rebuild conflict status", ["git", "status", "--short", "--branch"], { allowFailure: true });
      const unmerged = await run("unmerged files", ["git", "diff", "--name-only", "--diff-filter=U"], { allowFailure: true });
      finish({
        status: "needs_intervention",
        message: `Harness patch rebuild stopped while applying ${patchBranch.name}.`,
        artifacts: {
          ...baseArtifacts(base),
          beforeSha,
          applied,
          failedPatch: patchBranch,
          statusOutput: status.stdout,
          unmergedFiles: lines(unmerged.stdout),
          commands: commandArtifacts(),
        },
      });
    }
    applied.push(patchBranch);
  }

  const candidateSha = (await runChecked("read rebuilt harness head", ["git", "rev-parse", "HEAD"])).stdout.trim();
  const candidateTree = await resolveTree(candidateSha);
  const changed = !beforeSha || candidateTree !== beforeTree;
  if (changed) {
    await run("update maintained harness branch", ["git", "branch", "-f", targetBranch, candidateSha]);
  } else if (!targetExists) {
    await run("seed maintained harness branch", ["git", "branch", "-f", targetBranch, beforeSha]);
  }
  await run("switch maintained harness branch", ["git", "switch", targetBranch]);

  for (const command of verifyCommands) {
    const result = await run(`verify: ${command}`, ["bash", "-lc", command], { allowFailure: true });
    if (result.code !== 0) {
      finish({
        status: "needs_intervention",
        message: `Harness verification failed: ${command}.`,
        artifacts: {
          ...baseArtifacts(base),
          beforeSha,
          candidateSha,
          applied,
          failedCommand: command,
          commands: commandArtifacts(),
        },
      });
    }
  }
  await requireCleanWorktree("after harness verification");

  const afterSha = (await runChecked("read maintained harness head", ["git", "rev-parse", "HEAD"])).stdout.trim();
  if (enabled("push", false)) {
    for (const remote of pushRemotes) {
      await run(`push ${remote}/${targetBranch}`, [
        "git",
        "push",
        "--force-with-lease",
        remote,
        `HEAD:${targetBranch}`,
      ]);
    }
  }

  finish({
    status: changed ? "changed" : "completed",
    message: changed
      ? `Harness fork rebuilt ${targetBranch} from ${base.label} plus ${patchBranches.length} patches.`
      : `Harness fork already matches ${base.label} plus ${patchBranches.length} patches.`,
    artifacts: {
      ...baseArtifacts(base),
      eventId: context.event?.id,
      forkRepo,
      forkRepoFullName,
      targetBranch,
      upstreamBranch,
      patchPrefix,
      beforeSha,
      afterSha,
      applied,
      checks: verifyCommands.map((name) => ({ name, status: "passed" })),
      candidateRefs: candidateRefsFor(afterSha),
      commands: commandArtifacts(),
    },
  });
} catch (error) {
  if (error instanceof Finished) {
    return error.value;
  }
  return {
    status: "failed",
    message: error instanceof Error ? error.message : String(error),
    artifacts: { commands: commandArtifacts() },
  };
}
}

async function requireGitRepo(): Promise<void> {
  await runChecked("verify harness fork checkout", ["git", "rev-parse", "--show-toplevel"]);
}

async function ensureUpstreamRemote(): Promise<void> {
  const current = await run("read upstream remote", ["git", "remote", "get-url", upstreamRemote], { allowFailure: true });
  if (current.code === 0) return;
  if (!upstreamRepoUrl) {
    finish({ status: "blocked", message: `Missing ${upstreamRemote} remote and no upstream_repo_url is configured.` });
  }
  await run("add upstream remote", ["git", "remote", "add", upstreamRemote, upstreamRepoUrl]);
}

async function requireNoRebaseOrCherryPickInProgress(): Promise<void> {
  const state = await run(
    "check existing replay state",
    ["bash", "-lc", 'test -d "$(git rev-parse --git-path rebase-merge)" -o -d "$(git rev-parse --git-path rebase-apply)" -o -f "$(git rev-parse --git-path CHERRY_PICK_HEAD)"'],
    { allowFailure: true },
  );
  if (state.code === 0) {
    finish({
      status: "blocked",
      message: "A rebase or cherry-pick is already in progress in the harness fork checkout.",
      artifacts: { forkRepo, commands: commandArtifacts() },
    });
  }
}

async function requireCleanWorktree(stage: string): Promise<void> {
  const status = await run(`dirty worktree check ${stage}`, ["git", "status", "--porcelain=v1"]);
  if (status.stdout.trim()) {
    finish({
      status: "blocked",
      message: `Harness fork checkout has local changes ${stage}.`,
      artifacts: {
        dirtyStatus: status.stdout,
        forkRepo,
        commands: commandArtifacts(),
      },
    });
  }
}

async function resolveBase(): Promise<{ kind: "release" | "branch"; label: string; sha: string }> {
  if (context.event?.type === "upstream.release") {
    const tag = stringValue(payload.tag) || shortTag(stringValue(payload.ref) ?? "");
    if (!tag) {
      finish({ status: "failed", message: "upstream.release requires payload.tag." });
    }
    return { kind: "release", label: tag, sha: await resolveCommit(`refs/tags/${tag}`).catch(() => resolveCommit(tag)) };
  }
  if (context.event?.type === "upstream.branch_update") {
    const ref = stringValue(payload.ref) ?? "refs/heads/main";
    const sha = stringValue(payload.sha);
    if (!sha) {
      finish({ status: "failed", message: "upstream.branch_update requires payload.sha." });
    }
    return { kind: "branch", label: `${ref}@${sha}`, sha: await resolveCommit(sha) };
  }
  finish({ status: "skipped", message: `Unsupported harness fork event ${context.event?.type ?? "(missing)"}.` });
}

async function ensureSeedPatchBranches(): Promise<void> {
  const seeds = stringArrayConfig("seed_patch_refs", []);
  for (const seed of seeds) {
    const [name, ref] = seed.split("=");
    if (!name?.startsWith(patchPrefix) || !ref) {
      throw new Error(`Invalid seed_patch_refs entry: ${seed}`);
    }
    const exists = await branchExists(name);
    if (exists) continue;
    await resolveCommit(ref);
    await run(`seed ${name}`, ["git", "branch", "-f", name, ref]);
  }
}

async function listPatchBranches(): Promise<PatchBranch[]> {
  const refsPath = `refs/heads/${patchPrefix.replace(/\/+$/, "")}`;
  const result = await run("list harness patch branches", [
    "git",
    "for-each-ref",
    "--format=%(refname:short)%09%(objectname)%09%(contents:subject)",
    refsPath,
  ], { allowFailure: true });
  if (result.code !== 0 || !result.stdout.trim()) return [];
  return result.stdout.trim().split(/\r?\n/).map((line) => {
    const [name = "", sha = "", subject = ""] = line.split("\t");
    return { name, sha, subject };
  }).filter((branch) => branch.name.startsWith(patchPrefix)).sort((left, right) => left.name.localeCompare(right.name));
}

async function branchExists(branch: string): Promise<boolean> {
  return (await run(`check branch ${branch}`, ["git", "show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { allowFailure: true })).code === 0;
}

async function resolveCommit(ref: string): Promise<string> {
  return (await runChecked(`resolve ${ref}`, ["git", "rev-parse", "--verify", `${ref}^{commit}`])).stdout.trim();
}

async function resolveTree(ref: string): Promise<string> {
  return (await runChecked(`resolve tree ${ref}`, ["git", "rev-parse", "--verify", `${ref}^{tree}`])).stdout.trim();
}

async function runChecked(label: string, cmd: string[]): Promise<CommandResult> {
  const result = await run(label, cmd);
  if (result.code !== 0) {
    throw new Error(`${label} failed with exit ${result.code}:\n${result.stderr || result.stdout}`);
  }
  return result;
}

async function run(label: string, cmd: string[], options: { allowFailure?: boolean } = {}): Promise<CommandResult> {
  process.stderr.write(`+ ${label}: ${cmd.join(" ")}\n`);
  const child = spawn(cmd[0] ?? "", cmd.slice(1), {
    cwd: forkRepo,
    env: {
      ...process.env,
      GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || "patch.moi harness",
      GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || "patch.moi@example.invalid",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [stdout, stderr, code] = await Promise.all([
    collectText(child.stdout),
    collectText(child.stderr),
    exitCode(child),
  ]);
  if (stdout) process.stderr.write(stdout);
  if (stderr) process.stderr.write(stderr);
  const result = { label, cmd, cwd: forkRepo, code, stdout, stderr };
  commands.push(result);
  if (code !== 0 && !options.allowFailure) {
    throw new Error(`${label} failed with exit ${code}:\n${stderr || stdout}`);
  }
  return result;
}

function collectText(stream: NodeJS.ReadableStream | null): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    stream?.setEncoding("utf8");
    stream?.on("data", (chunk) => {
      output += String(chunk);
    });
    stream?.on("error", reject);
    stream?.on("end", () => resolve(output));
    if (!stream) resolve("");
  });
}

function exitCode(proc: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve) => {
    proc.on("exit", (code) => resolve(code ?? 1));
  });
}

function baseArtifacts(base: { kind: string; label: string; sha: string }): Record<string, unknown> {
  return {
    upstreamKind: base.kind,
    upstreamLabel: base.label,
    upstreamSha: base.sha,
  };
}

function candidateRefsFor(sha: string): Array<Record<string, unknown>> {
  const pushed = enabled("push", false);
  const remotes = pushed ? pushRemotes : ["local"];
  return remotes.map((remote) => ({
    kind: "branch",
    repo: forkRepoFullName,
    remote,
    ref: `refs/heads/${targetBranch}`,
    sha,
    pushed,
  }));
}

function commandArtifacts(): Array<Record<string, unknown>> {
  return commands.map((command) => ({
    ...command,
    stdout: truncate(command.stdout),
    stderr: truncate(command.stderr),
  }));
}

function enabled(name: string, fallback: boolean): boolean {
  const value = config[name];
  return typeof value === "boolean" ? value : fallback;
}

function stringConfig(name: string, fallback: string): string {
  const value = config[name];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function stringArrayConfig(name: string, fallback: string[]): string[] {
  const value = config[name];
  if (!Array.isArray(value)) return fallback;
  const entries = value.filter((entry): entry is string => typeof entry === "string" && entry.trim());
  return entries.length > 0 ? entries : fallback;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function shortTag(value: string): string {
  return value.replace(/^refs\/tags\//, "");
}

function truncate(value: string, max = 4000): string {
  return value.length <= max ? value : `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`;
}
