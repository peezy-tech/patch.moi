import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type FlowContext = {
  flow: {
    config?: Record<string, unknown>;
    event: {
      id: string;
      type: string;
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
  const expectedRepo = stringConfig("expected_repo", "peezy-tech/patch-moi-harness");
  const repo = stringValue(payload.repo);
  const tag = stringValue(payload.tag) || shortTag(stringValue(payload.ref) ?? "");
  if (repo !== expectedRepo) {
    finish({ status: "skipped", message: `Harness bindings ignore ${repo}.` });
  }
  if (!tag) {
    finish({ status: "failed", message: "upstream.release requires payload.tag." });
  }

  const workspaceRoot = process.cwd();
  const upstreamRepo = path.resolve(workspaceRoot, stringConfig("upstream_repo", "harness/upstream"));
  const artifactDir = path.resolve(workspaceRoot, stringConfig("artifact_dir", ".codex/flow-artifacts/patch-moi-harness-bindings"));
  const packageJsonPath = path.join(upstreamRepo, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    name?: string;
    version?: string;
    exports?: unknown;
    bin?: unknown;
  };
  const releaseSha = (await runChecked(["git", "rev-parse", "--verify", `${tag}^{commit}`], upstreamRepo)).stdout.trim();
  const bindings = {
    generatedBy: "patch-moi-harness-bindings",
    eventId: context.flow.event.id,
    repo,
    tag,
    releaseSha,
    packageName: packageJson.name,
    version: packageJson.version,
    exports: packageJson.exports ?? null,
    bin: packageJson.bin ?? null,
  };
  const artifactJson = `${JSON.stringify(bindings, null, 2)}\n`;
  const artifactPath = path.join(artifactDir, "bindings.json");
  await mkdir(artifactDir, { recursive: true });
  const previous = await readFile(artifactPath, "utf8").catch(() => "");
  await writeFile(artifactPath, artifactJson, "utf8");
  const changed = previous !== artifactJson;

  finish({
    status: changed ? "changed" : "completed",
    message: changed
      ? `Regenerated harness bindings for ${repo}@${tag}.`
      : `Harness bindings already current for ${repo}@${tag}.`,
    artifacts: {
      repo,
      tag,
      releaseSha,
      artifactPath,
      candidateRefs: [{
        kind: "artifact",
        repo: expectedRepo,
        ref: artifactPath,
        sha: releaseSha,
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

async function runChecked(command: string[], cwd: string): Promise<CommandResult> {
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
  if (code !== 0) {
    throw new Error(`${command.join(" ")} failed with exit ${code}:\n${stderr || stdout}`);
  }
  return { code, stdout, stderr };
}

function stringConfig(name: string, fallback: string): string {
  const value = config[name];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function shortTag(value: string): string {
  return value.replace(/^refs\/tags\//, "");
}
