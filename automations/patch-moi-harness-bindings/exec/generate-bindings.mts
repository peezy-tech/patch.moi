import { mkdir, readFile, writeFile } from "node:fs/promises";
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

export default async function generateBindings(context: AutomationContext) {
  config = context.automation.config ?? {};
  payload = context.event?.payload ?? {};

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

  const workspaceRoot = context.cwd ?? process.cwd();
  const upstreamRepo = path.resolve(workspaceRoot, stringConfig("upstream_repo", "harness/upstream"));
  const artifactDir = path.resolve(workspaceRoot, stringConfig("artifact_dir", ".codex/automation-artifacts/patch-moi-harness-bindings"));
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
    eventId: context.event?.id,
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

  return {
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
  };
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

async function runChecked(command: string[], cwd: string): Promise<CommandResult> {
  const proc = spawn(command[0] ?? "", command.slice(1), {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [stdout, stderr, code] = await Promise.all([
    collectText(proc.stdout),
    collectText(proc.stderr),
    exitCode(proc),
  ]);
  if (code !== 0) {
    throw new Error(`${command.join(" ")} failed with exit ${code}:\n${stderr || stdout}`);
  }
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
