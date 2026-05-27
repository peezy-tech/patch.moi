import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

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
  code: number;
  stdout: string;
  stderr: string;
};

let config: Record<string, unknown> = {};
let payload: Record<string, unknown> = {};

class Finished extends Error {
  constructor(readonly value: Record<string, unknown>) {
    super("automation finished");
  }
}

function finish(value: Record<string, unknown>): never {
  throw new Finished(value);
}

export default async function releaseFork(context: AutomationContext) {
  config = context.automation.config ?? {};
  payload = context.event?.payload ?? {};

  try {
  const packageName = stringValue(payload.packageName);
  const version = stringValue(payload.version);
  if (!packageName || !version) {
    finish({ status: "failed", message: "downstream.release requires packageName and version." });
  }
  const acceptedPackages = stringArrayConfig("accepted_packages", [
    "@peezy.tech/patch-moi-harness",
    "@peezy.tech/patch-moi-harness-fork",
  ]);
  if (!acceptedPackages.includes(packageName)) {
    finish({ status: "skipped", message: `Harness fork release ignores ${packageName}.` });
  }

  const workspaceRoot = context.cwd ?? process.cwd();
  const forkRepo = path.resolve(workspaceRoot, stringConfig("fork_repo", "harness/fork"));
  const forkRepoFullName = stringConfig("fork_repo_full_name", "matamune-peezy/patch-moi-harness");
  const sourceBranch = stringConfig("source_branch", "main");
  const worktreeDir = path.resolve(workspaceRoot, stringConfig("worktree_dir", ".codex/automation-artifacts/patch-moi-harness-flows-fork-worktree"));
  const artifactDir = path.resolve(workspaceRoot, stringConfig("artifact_dir", ".codex/automation-artifacts/patch-moi-harness-flows-fork-release"));

  await requireCleanRepo(forkRepo);
  const sourceSha = (await runChecked("resolve harness fork branch", ["git", "rev-parse", "--verify", `${sourceBranch}^{commit}`], forkRepo)).stdout.trim();
  await prepareWorktree(forkRepo, worktreeDir, sourceBranch);

  const packageJsonPath = path.join(worktreeDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as Record<string, unknown>;
  const baseVersion = typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
  const forkVersion = forkPackageVersion(baseVersion, version);
  packageJson.version = forkVersion;
  packageJson.description = `Fork release artifact prepared from ${packageName}@${version}.`;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  await runChecked("install harness fork package", ["npm", "install", "--package-lock-only"], worktreeDir);
  await runChecked("test harness fork package", ["npm", "test"], worktreeDir);

  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });
  const pack = await runChecked("pack harness fork package", ["npm", "pack", "--pack-destination", artifactDir], worktreeDir);
  const tarball = pack.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  const tarballPath = tarball ? path.join(artifactDir, tarball) : undefined;

  const candidateSha = (await runChecked("read harness fork release candidate", ["git", "rev-parse", "HEAD"], worktreeDir)).stdout.trim();
  finish({
    status: "changed",
    message: `Prepared harness fork package ${forkVersion} from ${packageName}@${version}.`,
    artifacts: {
      eventId: context.event?.id,
      sourcePackage: packageName,
      sourceVersion: version,
      forkRepo,
      forkRepoFullName,
      sourceBranch,
      sourceSha,
      baseVersion,
      forkVersion,
      worktreeDir,
      tarballPath,
      pushed: false,
      published: false,
      candidateRefs: [{
        kind: "artifact",
        repo: forkRepoFullName,
        ref: tarballPath ?? artifactDir,
        sha: candidateSha,
        pushed: false,
      }],
    },
  });
} catch (error) {
  if (error instanceof Finished) {
    return error.value;
  }
  return {
    status: "failed",
    message: error instanceof Error ? error.message : String(error),
  };
}
}

async function requireCleanRepo(repoRoot: string): Promise<void> {
  const status = await runChecked("read harness fork status", ["git", "status", "--porcelain=v1"], repoRoot);
  if (status.stdout.trim()) {
    finish({
      status: "blocked",
      message: "Harness fork checkout has local changes before release artifact preparation.",
      artifacts: { status: status.stdout },
    });
  }
}

async function prepareWorktree(repoRoot: string, worktreeDir: string, sourceBranch: string): Promise<void> {
  if (existsSync(worktreeDir)) {
    await run("remove old harness fork release worktree", ["git", "worktree", "remove", "--force", worktreeDir], repoRoot);
    await rm(worktreeDir, { recursive: true, force: true });
  }
  await run("prune harness fork worktrees", ["git", "worktree", "prune"], repoRoot);
  await runChecked("create harness fork release worktree", ["git", "worktree", "add", "--detach", worktreeDir, sourceBranch], repoRoot);
}

async function runChecked(label: string, command: string[], cwd: string): Promise<CommandResult> {
  const result = await run(label, command, cwd);
  if (result.code !== 0) {
    throw new Error(`${label} failed with exit ${result.code}:\n${result.stderr || result.stdout}`);
  }
  return result;
}

async function run(label: string, command: string[], cwd: string): Promise<CommandResult> {
  process.stderr.write(`+ ${label}: ${command.join(" ")}\n`);
  const proc = spawn(command[0] ?? "", command.slice(1), {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [stdout, stderr, code] = await Promise.all([
    collectText(proc.stdout),
    collectText(proc.stderr),
    exitCode(proc),
  ]);
  if (stdout) process.stderr.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return { code, stdout, stderr };
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

function forkPackageVersion(baseVersion: string, sourceVersion: string): string {
  return `${baseVersion}-harness.${sanitizePrerelease(sourceVersion)}`;
}

function sanitizePrerelease(value: string): string {
  return value
    .replace(/^v/, "")
    .replace(/[^0-9A-Za-z]+/g, ".")
    .split(".")
    .filter(Boolean)
    .join(".") || "0";
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
