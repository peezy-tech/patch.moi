import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type FlowContext = {
  flow: {
    config?: Record<string, unknown>;
    event: {
      id: string;
      payload?: Record<string, unknown>;
    };
  };
};

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

const context = JSON.parse(await Bun.stdin.text()) as FlowContext;
const config = context.flow.config ?? {};
const payload = context.flow.event.payload ?? {};

function finish(value: Record<string, unknown>): never {
  process.stdout.write(`FLOW_RESULT ${JSON.stringify(value)}\n`);
  process.exit(0);
}

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

  const workspaceRoot = process.cwd();
  const forkRepo = path.resolve(workspaceRoot, stringConfig("fork_repo", "harness/fork"));
  const forkRepoFullName = stringConfig("fork_repo_full_name", "matamune-peezy/patch-moi-harness");
  const sourceBranch = stringConfig("source_branch", "main");
  const worktreeDir = path.resolve(workspaceRoot, stringConfig("worktree_dir", ".codex/flow-artifacts/patch-moi-harness-flows-fork-worktree"));
  const artifactDir = path.resolve(workspaceRoot, stringConfig("artifact_dir", ".codex/flow-artifacts/patch-moi-harness-flows-fork-release"));

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
      eventId: context.flow.event.id,
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
  finish({
    status: "failed",
    message: error instanceof Error ? error.message : String(error),
  });
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
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (stdout) process.stderr.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return { code, stdout, stderr };
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
