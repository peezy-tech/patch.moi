#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { discoverFlows, matchingSteps, type FlowEvent as RuntimeFlowEvent } from "@peezy.tech/codex-flows/flow-runtime";
import {
  dispatchWorkspaceEventDetailed,
  maintenanceAttemptForWorkspaceDispatch,
  patchUpstreamBranchUpdateEvent,
  patchUpstreamReleaseEvent,
  replayWorkspaceEventDetailed,
  type WorkspaceDispatchConfig,
} from "./flow";
import { syncMaintenanceAttempt } from "./maintenance";
import {
  capturePatchBranch,
  inspectPatchWorkspace,
  listPatchBranches,
  rebuildPatchMain,
} from "./patch-workspace";
import { EventStore } from "./queue";
import type { FlowDispatchRecord, FlowEvent, MaintenanceAttemptRecord } from "./types";
import type { WorkspaceBackendFetch } from "./workspace-backend";

type CliOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  fetchImpl?: WorkspaceBackendFetch;
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
  patch.moi status [--data-dir DIR] [--json]
  patch.moi events [--type TYPE] [--limit N] [--data-dir DIR] [--json]
  patch.moi dispatches [--event-id ID] [--status STATUS] [--limit N] [--data-dir DIR] [--json]
  patch.moi attempts [--event-id ID] [--status STATUS] [--limit N] [--data-dir DIR] [--json]
  patch.moi run harness [--event FILE] [--workspace-root DIR] [--data-dir DIR] [--dry-run] [--json]
  patch.moi run codex-release --tag TAG [--repo openai/codex] [--workspace-root DIR] [--data-dir DIR] [--dry-run] [--record-only] [--allow-local] [--json]
  patch.moi run codex-main [--sha SHA] [--repo openai/codex] [--ref refs/heads/main] [--workspace-root DIR] [--data-dir DIR] [--dry-run] [--record-only] [--allow-local] [--json]
  patch.moi run event --file FILE [--workspace-root DIR] [--data-dir DIR] [--dry-run] [--record-only] [--json]
  patch.moi patch doctor [--repo DIR] [--main BRANCH] [--upstream BRANCH] [--json]
  patch.moi patch list [--repo DIR] [--prefix patch/] [--json]
  patch.moi patch capture patch/NAME --from BRANCH [--base BRANCH] [--repo DIR] [--message MSG] [--force] [--json]
  patch.moi patch rebuild [--base BRANCH] [--to BRANCH] [--repo DIR] [--prefix patch/] [--json]
  patch.moi retry EVENT_ID [--workspace-root DIR] [--data-dir DIR] [--json]
  patch.moi replay EVENT_ID [--workspace-root DIR] [--data-dir DIR] [--json]
  patch.moi sync ATTEMPT_ID [--workspace-root DIR] [--data-dir DIR] [--json]
  patch.moi setup codex [--repo DIR] [--upstream-url URL] [--target-branch BRANCH] [--apply] [--json]
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

    const command = parsed.positionals[0];
    const context = cliContext(parsed, cwd, env, out, options.fetchImpl);
    switch (command) {
      case "status":
        return await handleStatus(context);
      case "events":
        return await handleEvents(context);
      case "dispatches":
        return await handleDispatches(context);
      case "attempts":
        return await handleAttempts(context);
      case "run":
        return await handleRun(parsed.positionals.slice(1), context);
      case "patch":
        return await handlePatch(parsed.positionals.slice(1), context);
      case "retry":
        return await handleDispatchOperation("retry", parsed.positionals[1], context);
      case "replay":
        return await handleDispatchOperation("replay", parsed.positionals[1], context);
      case "sync":
        return await handleSync(parsed.positionals[1], context);
      case "setup":
        return await handleSetup(parsed.positionals.slice(1), context);
      default:
        throw new UsageError(`unknown command: ${command}`);
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
  dataDir: string;
  workspaceRoot: string;
  store: EventStore;
  json: boolean;
  stdout: (text: string) => void;
  fetchImpl?: WorkspaceBackendFetch;
};

function cliContext(
  parsed: ParsedArgs,
  cwd: string,
  env: Record<string, string | undefined>,
  stdout: (text: string) => void,
  fetchImpl?: WorkspaceBackendFetch,
): CliContext {
  const workspaceRoot = resolvePath(cwd, flagValue(parsed, "workspace-root") ?? findWorkspaceRoot(cwd));
  const dataDir = resolvePath(workspaceRoot, flagValue(parsed, "data-dir") ?? env.DATA_DIR ?? "./data");
  return {
    parsed,
    cwd,
    env,
    dataDir,
    workspaceRoot,
    store: new EventStore(dataDir),
    json: flagBool(parsed, "json"),
    stdout,
    fetchImpl,
  };
}

async function handleStatus(context: CliContext): Promise<number> {
  const limit = numberFlag(context.parsed, "limit", 20);
  const [events, dispatches, attempts] = await Promise.all([
    context.store.listFlowEvents({ limit }),
    context.store.listWorkspaceDispatches({ limit }),
    context.store.listMaintenanceAttempts({ limit }),
  ]);
  const payload = {
    dataDir: context.dataDir,
    latest: {
      events,
      dispatches,
      attempts,
    },
    attemptStatusCounts: countBy(attempts, (attempt) => attempt.status),
    dispatchStatusCounts: countBy(dispatches, (record) => record.status),
  };

  if (context.json) {
    writeJson(context, payload);
    return 0;
  }

  writeLine(context, `data dir: ${context.dataDir}`);
  writeLine(context, `events shown: ${events.length}`);
  writeLine(context, `dispatches shown: ${dispatches.length}`);
  writeLine(context, `attempts shown: ${attempts.length}`);
  writeLine(context, `attempt statuses: ${formatCounts(payload.attemptStatusCounts)}`);
  const latestAttempt = attempts[0];
  if (latestAttempt) {
    writeLine(context, `latest attempt: ${latestAttempt.status} ${latestAttempt.id}`);
  }
  return 0;
}

async function handleEvents(context: CliContext): Promise<number> {
  const events = await context.store.listFlowEvents({
    type: flagValue(context.parsed, "type"),
    limit: numberFlag(context.parsed, "limit", 50),
  });
  if (context.json) {
    writeJson(context, { events });
  } else {
    for (const event of events) {
      writeLine(context, `${event.receivedAt} ${event.type} ${event.id}`);
    }
  }
  return 0;
}

async function handleDispatches(context: CliContext): Promise<number> {
  const dispatches = await context.store.listWorkspaceDispatches({
    eventId: flagValue(context.parsed, "event-id"),
    status: dispatchStatus(flagValue(context.parsed, "status")),
    limit: numberFlag(context.parsed, "limit", 50),
  });
  if (context.json) {
    writeJson(context, { dispatches });
  } else {
    for (const record of dispatches) {
      writeLine(context, `${record.createdAt} ${record.status} ${record.operation ?? "dispatch"} ${record.eventId}`);
    }
  }
  return 0;
}

async function handleAttempts(context: CliContext): Promise<number> {
  const attempts = await context.store.listMaintenanceAttempts({
    eventId: flagValue(context.parsed, "event-id"),
    status: maintenanceStatus(flagValue(context.parsed, "status")),
    limit: numberFlag(context.parsed, "limit", 50),
  });
  if (context.json) {
    writeJson(context, { attempts });
  } else {
    for (const attempt of attempts) {
      writeLine(context, `${attempt.updatedAt} ${attempt.status} ${attempt.operation} ${attempt.id}`);
    }
  }
  return 0;
}

async function handleRun(positionals: string[], context: CliContext): Promise<number> {
  const target = positionals[0];
  if (!target) {
    throw new UsageError("run requires harness, codex-release, or event");
  }
  if (target === "harness") {
    const eventFile = flagValue(context.parsed, "event") ??
      path.join(context.workspaceRoot, "flows/patch-moi-harness/fixtures/upstream-release-v0.1.3.json");
    const event = await readFlowEvent(eventFile, context.workspaceRoot);
    return await runEvent(event, context);
  }
  if (target === "codex-release") {
    const tag = flagValue(context.parsed, "tag");
    if (!tag) {
      throw new UsageError("run codex-release requires --tag");
    }
    const repo = flagValue(context.parsed, "repo") ?? "openai/codex";
    const event = patchUpstreamReleaseEvent({ repo, tag });
    if (!flagBool(context.parsed, "dry-run") && !flagBool(context.parsed, "record-only")) {
      assertCodexDispatchAllowed(context);
    }
    return await runEvent(event, context);
  }
  if (target === "codex-main") {
    const repo = flagValue(context.parsed, "repo") ?? "openai/codex";
    const ref = flagValue(context.parsed, "ref") ?? "refs/heads/main";
    const event = patchUpstreamBranchUpdateEvent({
      repo,
      ref,
      sha: flagValue(context.parsed, "sha"),
    });
    if (!flagBool(context.parsed, "dry-run") && !flagBool(context.parsed, "record-only")) {
      assertCodexDispatchAllowed(context, "codex-main");
    }
    return await runEvent(event, context);
  }
  if (target === "event") {
    const eventFile = flagValue(context.parsed, "file");
    if (!eventFile) {
      throw new UsageError("run event requires --file");
    }
    return await runEvent(await readFlowEvent(eventFile, context.workspaceRoot), context);
  }
  throw new UsageError(`unknown run target: ${target}`);
}

async function handlePatch(positionals: string[], context: CliContext): Promise<number> {
  const action = positionals[0];
  if (!action) {
    throw new UsageError("patch requires doctor, list, capture, or rebuild");
  }
  const repoPath = patchRepoPath(context);
  if (action === "doctor") {
    const report = await inspectPatchWorkspace(repoPath, {
      mainBranch: flagValue(context.parsed, "main") ?? "main",
      upstreamBranch: flagValue(context.parsed, "upstream") ?? "upstream",
      patchPrefix: flagValue(context.parsed, "prefix") ?? "patch/",
    });
    if (context.json) {
      writeJson(context, report);
    } else {
      writeLine(context, `repo: ${report.path}`);
      writeLine(context, `branch: ${report.currentBranch ?? "detached"}`);
      writeLine(context, `main: ${report.mainExists ? report.mainBranch : "missing"}`);
      writeLine(context, `upstream: ${report.upstreamExists ? report.upstreamBranch : "missing"}`);
      writeLine(context, `patches: ${report.patchBranches.length}`);
      writeLine(context, `worktree: ${report.clean ? "clean" : "dirty"}`);
      writeLine(context, `ready: ${report.ready ? "yes" : "no"}`);
      for (const issue of report.issues) {
        writeLine(context, `- ${issue}`);
      }
    }
    return report.ready ? 0 : 1;
  }
  if (action === "list") {
    const branches = await listPatchBranches(repoPath, flagValue(context.parsed, "prefix") ?? "patch/");
    if (context.json) {
      writeJson(context, { repo: repoPath, patchBranches: branches });
    } else {
      for (const branch of branches) {
        writeLine(context, `${branch.name} ${branch.sha.slice(0, 12)} ${branch.subject}`);
      }
    }
    return 0;
  }
  if (action === "capture") {
    const patchBranch = positionals[1];
    const from = flagValue(context.parsed, "from");
    if (!patchBranch) {
      throw new UsageError("patch capture requires patch/NAME");
    }
    if (!from) {
      throw new UsageError("patch capture requires --from");
    }
    const result = await capturePatchBranch(repoPath, {
      patchBranch,
      from,
      base: flagValue(context.parsed, "base") ?? "main",
      message: flagValue(context.parsed, "message"),
      force: flagBool(context.parsed, "force"),
    });
    if (context.json) {
      writeJson(context, result);
    } else {
      writeLine(context, `${result.status}: ${result.patchBranch}${result.sha ? ` ${result.sha}` : ""}`);
    }
    return 0;
  }
  if (action === "rebuild") {
    const result = await rebuildPatchMain(repoPath, {
      base: flagValue(context.parsed, "base") ?? "upstream",
      targetBranch: flagValue(context.parsed, "to") ?? "main",
      patchPrefix: flagValue(context.parsed, "prefix") ?? "patch/",
    });
    if (context.json) {
      writeJson(context, result);
    } else {
      writeLine(context, `${result.status}: ${result.targetBranch}${result.afterSha ? ` ${result.afterSha}` : ""}`);
      for (const patch of result.applied) {
        writeLine(context, `- ${patch.name} ${patch.sha.slice(0, 12)}`);
      }
      if (result.failedPatch) {
        writeLine(context, `failed: ${result.failedPatch.name}`);
        if (result.error) {
          writeLine(context, result.error);
        }
      }
    }
    return result.status === "needs_intervention" ? 1 : 0;
  }
  throw new UsageError(`unknown patch action: ${action}`);
}

async function runEvent(event: FlowEvent, context: CliContext): Promise<number> {
  if (flagBool(context.parsed, "dry-run")) {
    const matches = await matchingSteps(
      await discoverFlows({ cwd: context.workspaceRoot }),
      event as RuntimeFlowEvent<Record<string, unknown>>,
    );
    const payload = {
      event,
      matches: matches.map(({ flow, step }) => ({
        flow: flow.manifest.name,
        step: step.name,
        runner: step.runner,
      })),
    };
    if (context.json) {
      writeJson(context, payload);
    } else {
      writeLine(context, `${event.id} matches ${payload.matches.length} step(s)`);
      for (const match of payload.matches) {
        writeLine(context, `- ${match.flow}/${match.step} (${match.runner})`);
      }
    }
    return 0;
  }

  const recorded = await appendFlowEventIfMissing(context.store, event);
  if (flagBool(context.parsed, "record-only")) {
    writeOutput(context, { event, recorded });
    return 0;
  }

  const { record, result } = await dispatchWorkspaceEventDetailed(event, {}, workspaceConfig(context));
  await context.store.appendWorkspaceDispatch(record);
  const attempt = maintenanceAttemptForWorkspaceDispatch(event, record, result?.runs);
  await context.store.appendMaintenanceAttempt(attempt);
  writeOutput(context, { event, recorded, record, attempt });
  return record.status === "failed" ? 1 : 0;
}

async function handleDispatchOperation(
  operation: "retry" | "replay",
  eventId: string | undefined,
  context: CliContext,
): Promise<number> {
  if (!eventId) {
    throw new UsageError(`${operation} requires EVENT_ID`);
  }
  const event = await context.store.getFlowEvent(eventId);
  if (!event) {
    throw new UsageError(`flow event not found: ${eventId}`, 1);
  }
  const outcome = operation === "retry"
    ? await dispatchWorkspaceEventDetailed(event, {}, workspaceConfig(context))
    : await replayWorkspaceEventDetailed(event, {}, workspaceConfig(context));
  await context.store.appendWorkspaceDispatch(outcome.record);
  const attempt = maintenanceAttemptForWorkspaceDispatch(event, outcome.record, outcome.result?.runs);
  await context.store.appendMaintenanceAttempt(attempt);
  writeOutput(context, { event, record: outcome.record, attempt });
  return outcome.record.status === "failed" ? 1 : 0;
}

async function handleSync(attemptId: string | undefined, context: CliContext): Promise<number> {
  if (!attemptId) {
    throw new UsageError("sync requires ATTEMPT_ID");
  }
  const attempt = await context.store.getMaintenanceAttempt(attemptId);
  if (!attempt) {
    throw new UsageError(`maintenance attempt not found: ${attemptId}`, 1);
  }
  const next = await syncMaintenanceAttempt(context.store, attempt, workspaceConfig(context));
  writeOutput(context, { attempt: next });
  return 0;
}

async function handleSetup(positionals: string[], context: CliContext): Promise<number> {
  const target = positionals[0];
  if (target !== "codex") {
    throw new UsageError("setup requires codex");
  }
  const repoPath = resolvePath(context.workspaceRoot, flagValue(context.parsed, "repo") ?? context.env.PEEZY_CODEX_REPO ?? "../codex");
  const upstreamRemote = flagValue(context.parsed, "upstream-remote") ?? "upstream";
  const upstreamUrl = flagValue(context.parsed, "upstream-url") ?? "https://github.com/openai/codex.git";
  const targetBranch = flagValue(context.parsed, "target-branch") ?? "main";
  const apply = flagBool(context.parsed, "apply");
  const repo = await inspectGitRepo(repoPath, {
    upstreamRemote,
    upstreamUrl,
    targetBranch,
    apply,
  });

  if (context.json) {
    writeJson(context, repo);
    return 0;
  }

  writeLine(context, `repo: ${repo.path}`);
  writeLine(context, `branch: ${repo.branch ?? "unknown"}${repo.branchMatchesTarget ? "" : ` (expected ${targetBranch})`}`);
  writeLine(context, `origin: ${repo.origin ?? "missing"}`);
  writeLine(context, `${upstreamRemote}: ${repo.upstream ?? "missing"}`);
  writeLine(context, `worktree: ${repo.clean ? "clean" : "dirty"}`);
  if (repo.addedUpstream) {
    writeLine(context, `added ${upstreamRemote}: ${upstreamUrl}`);
  }
  writeLine(context, `ready: ${repo.ready ? "yes" : "no"}`);
  for (const issue of repo.issues) {
    writeLine(context, `- ${issue}`);
  }
  return 0;
}

type CodexSetupReport = {
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
): Promise<CodexSetupReport> {
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

async function readFlowEvent(filePath: string, cwd: string): Promise<FlowEvent> {
  const raw = JSON.parse(await readFile(resolvePath(cwd, filePath), "utf8")) as FlowEvent;
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || typeof raw.type !== "string") {
    throw new UsageError(`invalid flow event file: ${filePath}`);
  }
  return raw;
}

async function appendFlowEventIfMissing(store: EventStore, event: FlowEvent): Promise<boolean> {
  if (await store.getFlowEvent(event.id)) {
    return false;
  }
  await store.appendFlowEvent(event);
  return true;
}

function assertCodexDispatchAllowed(context: CliContext, command = "codex-release"): void {
  if (
    flagBool(context.parsed, "allow-local") ||
    workspaceBackendConfigured(context.env) ||
    actionsLocalConfigured(context.env)
  ) {
    return;
  }
  throw new UsageError(
    `${command} dispatch requires PATCH_WORKSPACE_BACKEND_URL, CODEX_WORKSPACE_MODE=actions, or --allow-local; use --dry-run to verify matching without executing maintenance work`,
  );
}

function workspaceBackendConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(
    env.PATCH_WORKSPACE_BACKEND_URL?.trim() ||
    env.PATCH_FLOW_BACKEND_URL?.trim() ||
    env.PATCH_FLOW_DISPATCH_URL?.trim(),
  );
}

function actionsLocalConfigured(env: Record<string, string | undefined>): boolean {
  return env.CODEX_WORKSPACE_MODE === "actions" || env.GITHUB_ACTIONS === "true";
}

function workspaceConfig(context: CliContext): WorkspaceDispatchConfig {
  return {
    env: context.env,
    cwd: context.workspaceRoot,
    ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}),
  };
}

function patchRepoPath(context: CliContext): string {
  return resolvePath(context.workspaceRoot, flagValue(context.parsed, "repo") ?? context.env.PATCH_MOI_PATCH_REPO ?? context.env.PEEZY_CODEX_REPO ?? "../codex");
}

function writeOutput(context: CliContext, payload: {
  event?: FlowEvent;
  recorded?: boolean;
  record?: FlowDispatchRecord;
  attempt?: MaintenanceAttemptRecord;
}): void {
  if (context.json) {
    writeJson(context, payload);
    return;
  }
  if (payload.event) {
    writeLine(context, `event: ${payload.event.id}${payload.recorded === false ? " (already recorded)" : ""}`);
  }
  if (payload.record) {
    writeLine(context, `dispatch: ${payload.record.status} ${payload.record.operation ?? "dispatch"} ${payload.record.transport ?? "unknown"}`);
    if (payload.record.error) {
      writeLine(context, `error: ${payload.record.error}`);
    }
  }
  if (payload.attempt) {
    writeLine(context, `attempt: ${payload.attempt.status} ${payload.attempt.id}`);
  }
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
      if (!rawName) {
        continue;
      }
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

function numberFlag(parsed: ParsedArgs, name: string, fallback: number): number {
  const value = flagValue(parsed, name);
  if (!value) {
    return fallback;
  }
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    throw new UsageError(`--${name} must be a number`);
  }
  return parsedValue;
}

function resolvePath(cwd: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

function findWorkspaceRoot(cwd: string): string {
  let current = cwd;
  while (true) {
    if (
      existsSync(path.join(current, ".codex/workspace.toml")) ||
      existsSync(path.join(current, "flows/patch-moi-harness/flow.toml"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return cwd;
    }
    current = parent;
  }
}

function dispatchStatus(value: string | undefined): FlowDispatchRecord["status"] | undefined {
  if (!value) return undefined;
  if (value === "dispatched" || value === "failed" || value === "skipped") return value;
  throw new UsageError("--status must be dispatched, failed, or skipped");
}

function maintenanceStatus(value: string | undefined): MaintenanceAttemptRecord["status"] | undefined {
  if (!value) return undefined;
  if (
    value === "started" ||
    value === "completed" ||
    value === "changed" ||
    value === "needs_intervention" ||
    value === "blocked" ||
    value === "failed" ||
    value === "skipped"
  ) return value;
  throw new UsageError("--status is not a valid maintenance attempt status");
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  return entries.length > 0 ? entries.map(([key, value]) => `${key}=${value}`).join(" ") : "none";
}

if (import.meta.main) {
  process.exit(await runCli());
}
