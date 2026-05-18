import path from "node:path";
import { defineBunFlow } from "@peezy.tech/codex-flows/flow-runtime/bun";
import type { FlowResult, FlowResultStatus, FlowRunContext } from "@peezy.tech/codex-flows/flow-runtime";

type HarnessFlowContext = FlowRunContext & {
  flow: FlowRunContext["flow"] & {
    event: FlowRunContext["flow"]["event"] & {
      payload: Record<string, unknown>;
    };
  };
};

type CommandResult = {
  label: string;
  cmd: string[];
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

const expectedRepo = "peezy-tech/patch-moi-harness";
let context: HarnessFlowContext;
let config: Record<string, unknown>;
let commands: CommandResult[];
let releaseTag: string;
let repo: string;
let forkRepo: string;
let forkRepoFullName: string;
let targetBranch: string;
let upstreamRemote: string;
let upstreamRepoUrl: string;
let verifyCommands: string[];
let pushRemotes: string[];

class FlowFinished extends Error {
  constructor(readonly result: FlowResult) {
    super(result.message ?? result.status);
  }
}

export default defineBunFlow(async (flowContext: FlowRunContext): Promise<FlowResult> => {
  context = flowContext as HarnessFlowContext;
  config = context.flow.config ?? {};
  commands = [];

  const workspaceRoot = process.cwd();
  const payload = context.flow.event.payload ?? {};
  releaseTag = tagFromPayload(payload);
  repo = stringValue(payload.repo, "payload.repo");
  forkRepo = path.resolve(workspaceRoot, stringConfig("fork_repo", "harness/fork"));
  forkRepoFullName = stringConfig("fork_repo_full_name", "matamune-peezy/patch-moi-harness");
  targetBranch = stringConfig("target_branch", "main");
  upstreamRemote = stringConfig("upstream_remote", "upstream");
  upstreamRepoUrl = stringConfig("upstream_repo_url", "https://github.com/peezy-tech/patch-moi-harness.git");
  verifyCommands = stringArrayConfig("verify_commands", ["npm test", "npm run pack:dry-run"]);
  pushRemotes = stringArrayConfig("push_remotes", ["origin", "jojo"]);

  try {
    if (repo !== expectedRepo) {
      finish("skipped", `Harness flow ignores ${repo}.`, { repo, expectedRepo });
    }
    if (!releaseTag) {
      finish("failed", "Release payload is missing tag or refs/tags ref.");
    }

    const repoCheck = await run("verify harness fork checkout", ["git", "rev-parse", "--show-toplevel"]);
    if (repoCheck.exitCode !== 0) {
      finish("blocked", `Harness fork checkout is not available at ${forkRepo}.`, { forkRepo });
    }

    await ensureUpstreamRemote();

    if (enabled("fetch", true)) {
      await run("fetch upstream release refs", ["git", "fetch", upstreamRemote, "--tags", "--prune"]);
    }

    await requireNoRebaseInProgress();
    await requireCleanWorktree("before harness fork rebase");

    const branch = (await run("read current branch", ["git", "branch", "--show-current"])).stdout.trim();
    if (branch !== targetBranch) {
      await run("switch maintained fork branch", ["git", "switch", targetBranch]);
    }

    const beforeSha = (await run("read fork head before rebase", ["git", "rev-parse", "HEAD"])).stdout.trim();
    const releaseSha = await resolveReleaseCommit(releaseTag);
    const alreadyContainsRelease = (await run(
      "check release ancestor",
      ["git", "merge-base", "--is-ancestor", releaseSha, "HEAD"],
      { allowFailure: true },
    )).exitCode === 0;

    if (!alreadyContainsRelease) {
      const rebase = await run(
        "rebase harness fork onto upstream release",
        ["git", "rebase", releaseSha],
        { allowFailure: true },
      );
      if (rebase.exitCode !== 0) {
        const context = await collectRebaseContext(rebase, beforeSha);
        finish("needs_intervention", `Harness fork rebase stopped on ${releaseTag}.`, context);
      }
    }

    for (const command of verifyCommands) {
      const result = await run(`verify: ${command}`, ["bash", "-lc", command], { allowFailure: true });
      if (result.exitCode !== 0) {
        finish("needs_intervention", `Harness verification failed: ${command}.`, {
          failedCommand: command,
        });
      }
    }

    await requireCleanWorktree("after harness fork verification");

    const afterSha = (await run("read fork head after rebase", ["git", "rev-parse", "HEAD"])).stdout.trim();

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

    finish(beforeSha === afterSha ? "completed" : "changed", harnessMessage(beforeSha, afterSha), {
      eventId: context.flow.event.id,
      repo,
      forkRepo,
      forkRepoFullName,
      targetBranch,
      releaseTag,
      releaseSha,
      beforeSha,
      afterSha,
      pushed: enabled("push", false),
      checks: verifyCommands.map((command) => ({ name: command, status: "passed" })),
      candidateRefs: candidateRefsFor(afterSha),
    });
  } catch (error) {
    if (error instanceof FlowFinished) {
      return error.result;
    }
    return buildResult("failed", error instanceof Error ? error.message : String(error));
  }
});

async function ensureUpstreamRemote(): Promise<void> {
  const current = await run("read upstream remote", ["git", "remote", "get-url", upstreamRemote], {
    allowFailure: true,
  });
  if (current.exitCode === 0) {
    return;
  }
  if (!upstreamRepoUrl) {
    finish("blocked", `Missing ${upstreamRemote} remote and no upstream_repo_url is configured.`);
  }
  await run("add upstream remote", ["git", "remote", "add", upstreamRemote, upstreamRepoUrl]);
}

async function requireNoRebaseInProgress(): Promise<void> {
  const state = await run(
    "check existing rebase state",
    ["bash", "-lc", 'test -d "$(git rev-parse --git-path rebase-merge)" -o -d "$(git rev-parse --git-path rebase-apply)"'],
    { allowFailure: true },
  );
  if (state.exitCode === 0) {
    finish("blocked", "A rebase is already in progress in the harness fork checkout.", {
      forkRepo,
    });
  }
}

async function requireCleanWorktree(stage: string): Promise<void> {
  const status = await run(`dirty worktree check ${stage}`, ["git", "status", "--porcelain=v1"]);
  if (status.stdout.trim()) {
    finish("blocked", `Harness fork checkout has local changes ${stage}.`, {
      dirtyStatus: status.stdout,
      forkRepo,
    });
  }
}

async function resolveReleaseCommit(tag: string): Promise<string> {
  const candidates = tag.startsWith("refs/")
    ? [`${tag}^{commit}`, `${shortTag(tag)}^{commit}`]
    : [`refs/tags/${tag}^{commit}`, `${tag}^{commit}`];
  for (const candidate of candidates) {
    const result = await run(`resolve release ref ${candidate}`, ["git", "rev-parse", "--verify", candidate], {
      allowFailure: true,
    });
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }
  finish("blocked", `Could not resolve upstream release tag ${tag}.`, {
    tag,
    forkRepo,
  });
}

async function collectRebaseContext(rebase: CommandResult, beforeSha: string): Promise<Record<string, unknown>> {
  const status = await run("rebase conflict status", ["git", "status", "--short", "--branch"], {
    allowFailure: true,
  });
  const unmerged = await run("unmerged files", ["git", "diff", "--name-only", "--diff-filter=U"], {
    allowFailure: true,
  });
  const currentPatch = await run("current rebase patch", ["git", "rebase", "--show-current-patch"], {
    allowFailure: true,
  });
  return {
    beforeSha,
    rebaseOutput: truncate(rebase.stderr || rebase.stdout, 8000),
    statusOutput: status.stdout,
    unmergedFiles: unmerged.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    currentPatch: truncate(currentPatch.stdout || currentPatch.stderr, 12000),
  };
}

async function run(
  label: string,
  cmd: string[],
  options: { allowFailure?: boolean } = {},
): Promise<CommandResult> {
  const child = Bun.spawn(cmd, {
    cwd: forkRepo,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const result = { label, cmd, cwd: forkRepo, exitCode, stdout, stderr };
  commands.push(result);
  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(`${label} failed with exit ${exitCode}:\n${stderr || stdout}`);
  }
  return result;
}

function finish(status: FlowResultStatus, message: string, artifacts: Record<string, unknown> = {}): never {
  throw new FlowFinished(buildResult(status, message, artifacts));
}

function buildResult(status: FlowResultStatus, message: string, artifacts: Record<string, unknown> = {}): FlowResult {
  const commandArtifacts = commands.map((command) => ({
    ...command,
    stdout: truncate(command.stdout),
    stderr: truncate(command.stderr),
  }));
  return {
    status,
    message,
    artifacts: {
      ...artifacts,
      commands: commandArtifacts,
    },
  };
}

function harnessMessage(beforeSha: string, afterSha: string): string {
  if (beforeSha === afterSha) {
    return `Harness fork already contains ${releaseTag}; package checks passed.`;
  }
  return `Harness fork rebased onto ${releaseTag}; package checks passed.`;
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

function enabled(name: string, fallback: boolean): boolean {
  const envValue = process.env[`CODEX_FLOW_${name.toUpperCase()}`];
  if (envValue !== undefined) {
    return ["1", "true", "yes", "on"].includes(envValue.trim().toLowerCase());
  }
  const value = config[name];
  return typeof value === "boolean" ? value : fallback;
}

function stringConfig(name: string, fallback: string): string {
  const value = config[name];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function stringArrayConfig(name: string, fallback: string[]): string[] {
  const value = config[name];
  if (!Array.isArray(value)) {
    return fallback;
  }
  const entries = value.filter((entry): entry is string => typeof entry === "string" && entry.trim());
  return entries.length > 0 ? entries : fallback;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function tagFromPayload(value: Record<string, unknown>): string {
  if (typeof value.tag === "string" && value.tag.trim()) {
    return value.tag.trim();
  }
  if (typeof value.ref === "string" && value.ref.startsWith("refs/tags/")) {
    return value.ref.trim();
  }
  return "";
}

function shortTag(value: string): string {
  return value.replace(/^refs\/tags\//, "");
}

function truncate(value: string, max = 4000): string {
  return value.length <= max ? value : `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`;
}
