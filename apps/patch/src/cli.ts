#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadPatchMoiConfig } from "./config";
import {
  dispatchWorkspaceEventDetailed,
  mergePatchWorkWithAttempt,
  patchAttemptForWorkspaceDispatch,
  patchDownstreamReleaseEvent,
  patchWorkForAutomationEvent,
  patchUpstreamBranchUpdateEvent,
  patchUpstreamReleaseEvent,
  replayWorkspaceEventDetailed,
  type WorkspaceDispatchConfig,
} from "./automation";
import { syncPatchAttempt } from "./patch-attempts";
import {
  capturePatchBranch,
  createPatchWorkBranch,
  inspectPatchWorkspace,
  listPatchBranches,
  rebuildPatchMain,
} from "./patch-workspace";
import { EventStore } from "./queue";
import type {
  AutomationDispatchRecord,
  AutomationEvent,
  CandidateRefRecord,
  PatchAttemptRecord,
  PatchWorkKind,
  PatchWorkRecord,
  PatchWorkStatus,
} from "./types";
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
  patch.moi attempts [--event-id ID] [--work-id ID] [--kind KIND] [--status STATUS] [--limit N] [--data-dir DIR] [--json]
  patch.moi work start feature --title TITLE --repo DIR --branch BRANCH --base REF [--patch-branch patch/NAME] [--create-branch] [--data-dir DIR] [--json]
  patch.moi work list [--kind KIND] [--status STATUS] [--limit N] [--data-dir DIR] [--json]
  patch.moi work show WORK_ID [--data-dir DIR] [--json]
  patch.moi work set-status WORK_ID --status STATUS [--data-dir DIR] [--json]
  patch.moi run harness [--event FILE] [--workspace-root DIR] [--data-dir DIR] [--dry-run] [--allow-local] [--json]
  patch.moi run upstream-release --repo OWNER/NAME --tag TAG [--automation NAME] [--workspace-root DIR] [--data-dir DIR] [--dry-run] [--record-only] [--allow-local] [--json]
  patch.moi run upstream-branch --repo OWNER/NAME [--sha SHA] [--ref refs/heads/main] [--automation NAME] [--workspace-root DIR] [--data-dir DIR] [--dry-run] [--record-only] [--allow-local] [--json]
  patch.moi run downstream-release --package PACKAGE --version VERSION [--repo OWNER/NAME] [--automation NAME] [--workspace-root DIR] [--data-dir DIR] [--dry-run] [--record-only] [--allow-local] [--json]
  patch.moi run event --file FILE [--workspace-root DIR] [--data-dir DIR] [--dry-run] [--record-only] [--json]
  patch.moi patch doctor [--repo DIR] [--main BRANCH] [--upstream-remote REMOTE] [--upstream-branch BRANCH] [--fork-remote REMOTE] [--json]
  patch.moi patch list [--repo DIR] [--prefix patch/] [--json]
  patch.moi patch capture patch/NAME --from BRANCH [--base BRANCH] [--repo DIR] [--message MSG] [--force] [--work-id ID] [--json]
  patch.moi patch rebuild [--base BRANCH] [--to BRANCH] [--repo DIR] [--prefix patch/] [--json]
  patch.moi retry EVENT_ID [--workspace-root DIR] [--data-dir DIR] [--json]
  patch.moi replay EVENT_ID [--workspace-root DIR] [--data-dir DIR] [--json]
  patch.moi sync ATTEMPT_ID [--workspace-root DIR] [--data-dir DIR] [--json]
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

    const command = parsed.positionals[0];
    const context = cliContext(parsed, cwd, env, out, err, options.fetchImpl);
    switch (command) {
      case "status":
        return await handleStatus(context);
      case "events":
        return await handleEvents(context);
      case "dispatches":
        return await handleDispatches(context);
      case "attempts":
        return await handleAttempts(context);
      case "work":
        return await handleWork(parsed.positionals.slice(1), context);
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
  stderr: (text: string) => void;
  fetchImpl?: WorkspaceBackendFetch;
};

function cliContext(
  parsed: ParsedArgs,
  cwd: string,
  env: Record<string, string | undefined>,
  stdout: (text: string) => void,
  stderr: (text: string) => void,
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
    stderr,
    fetchImpl,
  };
}

async function handleStatus(context: CliContext): Promise<number> {
  const limit = numberFlag(context.parsed, "limit", 20);
  const [events, dispatches, attempts] = await Promise.all([
    context.store.listAutomationEvents({ limit }),
    context.store.listWorkspaceDispatches({ limit }),
    context.store.listPatchAttempts({ limit }),
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
  const events = await context.store.listAutomationEvents({
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
  const attempts = await context.store.listPatchAttempts({
    eventId: flagValue(context.parsed, "event-id"),
    workId: flagValue(context.parsed, "work-id"),
    kind: patchWorkKind(flagValue(context.parsed, "kind")),
    status: patchAttemptStatus(flagValue(context.parsed, "status")),
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

async function handleWork(positionals: string[], context: CliContext): Promise<number> {
  const action = positionals[0];
  if (!action) {
    throw new UsageError("work requires start, list, show, or set-status");
  }
  if (action === "start") {
    const kind = patchWorkKind(positionals[1]);
    if (kind !== "feature") {
      throw new UsageError("work start currently requires feature");
    }
    const title = flagValue(context.parsed, "title");
    const branch = flagValue(context.parsed, "branch");
    const base = flagValue(context.parsed, "base");
    if (!title) throw new UsageError("work start feature requires --title");
    if (!branch) throw new UsageError("work start feature requires --branch");
    if (!base) throw new UsageError("work start feature requires --base");
    const repo = patchRepoPath(context);
    const now = new Date().toISOString();
    const branchResult = flagBool(context.parsed, "create-branch")
      ? await createPatchWorkBranch(repo, { branch, base })
      : undefined;
    const work: PatchWorkRecord = {
      id: `patch-work:feature:${slugValue(title)}:${now}`,
      kind,
      title,
      repo,
      baseRef: base,
      workBranch: branch,
      ...(flagValue(context.parsed, "patch-branch") ? { patchBranch: flagValue(context.parsed, "patch-branch") } : {}),
      status: "active",
      candidateRefs: [],
      attemptIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await context.store.appendPatchWork(work);
    writeOutput(context, { work, branchResult });
    return 0;
  }
  if (action === "list") {
    const work = await context.store.listPatchWork({
      kind: patchWorkKind(flagValue(context.parsed, "kind")),
      status: patchWorkStatus(flagValue(context.parsed, "status")),
      limit: numberFlag(context.parsed, "limit", 50),
    });
    if (context.json) {
      writeJson(context, { work });
    } else {
      for (const item of work) {
        writeLine(context, `${item.updatedAt} ${item.status} ${item.kind} ${item.id} ${item.title}`);
      }
    }
    return 0;
  }
  if (action === "show") {
    const id = positionals[1];
    if (!id) throw new UsageError("work show requires WORK_ID");
    const work = await context.store.getPatchWork(id);
    if (!work) throw new UsageError(`patch work not found: ${id}`, 1);
    const attempts = await context.store.listPatchAttempts({ workId: id, limit: 100 });
    writeOutput(context, { work, attempts });
    return 0;
  }
  if (action === "set-status") {
    const id = positionals[1];
    if (!id) throw new UsageError("work set-status requires WORK_ID");
    const status = patchWorkStatus(flagValue(context.parsed, "status"));
    if (!status) throw new UsageError("work set-status requires --status");
    const work = await context.store.getPatchWork(id);
    if (!work) throw new UsageError(`patch work not found: ${id}`, 1);
    const now = new Date().toISOString();
    const next: PatchWorkRecord = {
      ...work,
      status,
      updatedAt: now,
      ...(terminalPatchWorkStatus(status) ? { completedAt: now } : {}),
    };
    await context.store.appendPatchWork(next);
    writeOutput(context, { work: next });
    return 0;
  }
  throw new UsageError(`unknown work action: ${action}`);
}

async function handleRun(positionals: string[], context: CliContext): Promise<number> {
  const target = positionals[0];
  if (!target) {
    throw new UsageError("run requires harness, upstream-release, upstream-branch, downstream-release, or event");
  }
  if (target === "harness") {
    const eventFile = flagValue(context.parsed, "event") ??
      path.join(context.workspaceRoot, "automations/patch-moi-harness-fork/fixtures/upstream-release-v0.1.3.json");
    const event = await readAutomationEvent(eventFile, context.workspaceRoot);
    return await runEvent(event, context);
  }
  if (target === "upstream-release") {
    const repo = flagValue(context.parsed, "repo");
    const tag = flagValue(context.parsed, "tag");
    if (!repo) {
      throw new UsageError("run upstream-release requires --repo");
    }
    if (!tag) {
      throw new UsageError("run upstream-release requires --tag");
    }
    const event = patchUpstreamReleaseEvent({ repo, tag, automations: automationFlags(context.parsed) });
    if (!flagBool(context.parsed, "dry-run") && !flagBool(context.parsed, "record-only")) {
      assertDispatchSurfaceAllowed(context, "upstream-release");
    }
    return await runEvent(event, context);
  }
  if (target === "upstream-branch") {
    const repo = flagValue(context.parsed, "repo");
    if (!repo) {
      throw new UsageError("run upstream-branch requires --repo");
    }
    const ref = flagValue(context.parsed, "ref") ?? "refs/heads/main";
    const event = patchUpstreamBranchUpdateEvent({
      repo,
      ref,
      sha: flagValue(context.parsed, "sha"),
      automations: automationFlags(context.parsed),
    });
    if (!flagBool(context.parsed, "dry-run") && !flagBool(context.parsed, "record-only")) {
      assertDispatchSurfaceAllowed(context, "upstream-branch");
    }
    return await runEvent(event, context);
  }
  if (target === "downstream-release") {
    const packageName = flagValue(context.parsed, "package") ?? flagValue(context.parsed, "package-name");
    const version = flagValue(context.parsed, "version") ?? flagValue(context.parsed, "tag");
    if (!packageName) {
      throw new UsageError("run downstream-release requires --package");
    }
    if (!version) {
      throw new UsageError("run downstream-release requires --version");
    }
    const event = patchDownstreamReleaseEvent({
      packageName,
      version,
      repo: flagValue(context.parsed, "repo"),
      automations: automationFlags(context.parsed),
    });
    if (!flagBool(context.parsed, "dry-run") && !flagBool(context.parsed, "record-only")) {
      assertDispatchSurfaceAllowed(context, "downstream-release");
    }
    return await runEvent(event, context);
  }
  if (target === "event") {
    const eventFile = flagValue(context.parsed, "file");
    if (!eventFile) {
      throw new UsageError("run event requires --file");
    }
    return await runEvent(await readAutomationEvent(eventFile, context.workspaceRoot), context);
  }
  throw new UsageError(`unknown run target: ${target}`);
}

async function handlePatch(positionals: string[], context: CliContext): Promise<number> {
  const action = positionals[0];
  if (!action) {
    throw new UsageError("patch requires doctor, list, capture, or rebuild");
  }
  const repoPath = patchRepoPath(context);
  const config = await loadPatchMoiConfig(repoPath);
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
    const branches = await listPatchBranches(repoPath, patchPrefix);
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
      base: flagValue(context.parsed, "base") ?? mainBranch,
      message: flagValue(context.parsed, "message"),
      force: flagBool(context.parsed, "force"),
      patchPrefix,
    });
    const workId = flagValue(context.parsed, "work-id");
    if (workId) {
      const work = await context.store.getPatchWork(workId);
      if (!work) {
        throw new UsageError(`patch work not found: ${workId}`, 1);
      }
      const now = new Date().toISOString();
      const candidateRefs: CandidateRefRecord[] = result.sha
        ? [{ kind: "branch", ref: result.patchBranch, sha: result.sha }]
        : [];
      const attempt: PatchAttemptRecord = {
        id: `${work.id}:capture:${now}`,
        workId: work.id,
        kind: work.kind,
        operation: "capture",
        status: result.status === "changed" ? "changed" : "skipped",
        workspaceRunIds: [],
        candidateRefs,
        message: result.message,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      };
      const nextWork: PatchWorkRecord = {
        ...work,
        patchBranch: result.patchBranch,
        status: result.status === "changed" ? "captured" : work.status,
        candidateRefs: uniqueCandidateRefs([...work.candidateRefs, ...candidateRefs]),
        attemptIds: uniqueStrings([...work.attemptIds, attempt.id]),
        updatedAt: now,
      };
      await context.store.appendPatchAttempt(attempt);
      await context.store.appendPatchWork(nextWork);
      if (context.json) {
        writeJson(context, { result, work: nextWork, attempt });
        return 0;
      }
    }
    if (context.json) {
      writeJson(context, result);
    } else {
      writeLine(context, `${result.status}: ${result.patchBranch}${result.sha ? ` ${result.sha}` : ""}`);
    }
    return 0;
  }
  if (action === "rebuild") {
    const result = await rebuildPatchMain(repoPath, {
      config: effectiveConfig,
      base: flagValue(context.parsed, "base"),
      targetBranch: flagValue(context.parsed, "to") ?? mainBranch,
      patchPrefix,
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

async function runEvent(event: AutomationEvent, context: CliContext): Promise<number> {
  if (flagBool(context.parsed, "dry-run")) {
    const automations = automationsForEvent(event, context);
    const payload = {
      event,
      automations,
    };
    if (context.json) {
      writeJson(context, payload);
    } else {
      writeLine(context, `${event.id} targets ${automations.length} automation(s)`);
      for (const automation of automations) {
        writeLine(context, `- ${automation}`);
      }
    }
    return 0;
  }

  await writeDispatchPlan(context, event);
  const recorded = await appendAutomationEventIfMissing(context.store, event);
  if (flagBool(context.parsed, "record-only")) {
    const work = patchWorkForAutomationEvent(event);
    await context.store.appendPatchWork(work);
    writeOutput(context, { event, recorded, work });
    return 0;
  }

  const { record, result } = await dispatchWorkspaceEventDetailed(event, {}, workspaceConfig(context));
  await context.store.appendWorkspaceDispatch(record);
  const attempt = patchAttemptForWorkspaceDispatch(event, record, result?.runs);
  await context.store.appendPatchAttempt(attempt);
  await upsertPatchWorkForAttempt(context, event, attempt);
  writeAttemptProgress(context, attempt);
  writeOutput(context, { event, recorded, record, attempt });
  return attemptFailed(attempt) ? 1 : 0;
}

async function handleDispatchOperation(
  operation: "retry" | "replay",
  eventId: string | undefined,
  context: CliContext,
): Promise<number> {
  if (!eventId) {
    throw new UsageError(`${operation} requires EVENT_ID`);
  }
  const event = await context.store.getAutomationEvent(eventId);
  if (!event) {
    throw new UsageError(`automation event not found: ${eventId}`, 1);
  }
  const outcome = operation === "retry"
    ? await dispatchWorkspaceEventDetailed(event, {}, workspaceConfig(context))
    : await replayWorkspaceEventDetailed(event, {}, workspaceConfig(context));
  await context.store.appendWorkspaceDispatch(outcome.record);
  const attempt = patchAttemptForWorkspaceDispatch(event, outcome.record, outcome.result?.runs);
  await context.store.appendPatchAttempt(attempt);
  await upsertPatchWorkForAttempt(context, event, attempt);
  writeAttemptProgress(context, attempt);
  writeOutput(context, { event, record: outcome.record, attempt });
  return attemptFailed(attempt) ? 1 : 0;
}

async function handleSync(attemptId: string | undefined, context: CliContext): Promise<number> {
  if (!attemptId) {
    throw new UsageError("sync requires ATTEMPT_ID");
  }
  const attempt = await context.store.getPatchAttempt(attemptId);
  if (!attempt) {
    throw new UsageError(`patch attempt not found: ${attemptId}`, 1);
  }
  const next = await syncPatchAttempt(context.store, attempt, workspaceConfig(context));
  writeOutput(context, { attempt: next });
  return 0;
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

async function readAutomationEvent(filePath: string, cwd: string): Promise<AutomationEvent> {
  const raw = JSON.parse(await readFile(resolvePath(cwd, filePath), "utf8")) as AutomationEvent;
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || typeof raw.type !== "string") {
    throw new UsageError(`invalid automation event file: ${filePath}`);
  }
  return raw;
}

async function appendAutomationEventIfMissing(store: EventStore, event: AutomationEvent): Promise<boolean> {
  if (await store.getAutomationEvent(event.id)) {
    return false;
  }
  await store.appendAutomationEvent(event);
  return true;
}

function assertDispatchSurfaceAllowed(context: CliContext, command = "upstream-release"): void {
  if (
    localDispatchAllowed(context) ||
    remoteExecutionConfigured(context.env)
  ) {
    return;
  }
  throw new UsageError(
    `${command} dispatch requires PATCH_WORKSPACE_BACKEND_URL, PATCH_WORKSPACE_SSH_TARGET, --allow-local, or PATCH_ALLOW_LOCAL_APP_SERVER=1; use --dry-run to verify configured automations without executing patch work`,
  );
}

function remoteExecutionConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(
    env.PATCH_WORKSPACE_BACKEND_URL?.trim() ||
      env.PATCH_WORKSPACE_SSH_TARGET?.trim(),
  );
}

function automationsForEvent(event: AutomationEvent, context: CliContext): string[] {
  return [
    ...(event.automations ?? []),
    ...commaList(context.env.PATCH_AUTOMATIONS),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function commaList(value: string | undefined): string[] {
  return value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function booleanEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function workspaceConfig(context: CliContext): WorkspaceDispatchConfig {
  return {
    env: context.env,
    cwd: context.workspaceRoot,
    allowLocal: localDispatchAllowed(context),
    progress: progressSink(context),
  };
}

function localDispatchAllowed(context: CliContext): boolean {
  return flagBool(context.parsed, "allow-local") ||
    booleanEnv(context.env.PATCH_ALLOW_LOCAL_APP_SERVER);
}

async function writeDispatchPlan(context: CliContext, event: AutomationEvent): Promise<void> {
  const automations = automationsForEvent(event, context);
  writeProgress(context, `[automation] dispatch ${event.id} -> ${automations.length} automation(s)\n`);
  for (const automation of automations) {
    writeProgress(context, `[automation] queued ${automation}\n`);
  }
}

async function upsertPatchWorkForAttempt(
  context: CliContext,
  event: AutomationEvent,
  attempt: PatchAttemptRecord,
): Promise<PatchWorkRecord> {
  const existing = await context.store.getPatchWork(attempt.workId);
  const work = mergePatchWorkWithAttempt(existing, event, attempt);
  await context.store.appendPatchWork(work);
  return work;
}

function writeAttemptProgress(context: CliContext, attempt: PatchAttemptRecord): void {
  writeProgress(context, `[automation] attempt ${attempt.status} ${attempt.id}\n`);
  for (const thread of attempt.workspaceThreadRefs ?? []) {
    const owner = thread.automationName;
    writeProgress(
      context,
      `[automation] thread ${owner || thread.label || "codex"} ${thread.threadId}${thread.turnId ? ` turn=${thread.turnId}` : ""}\n`,
    );
  }
}

function progressSink(context: CliContext): (event: unknown) => void {
  return (event) => {
    const record = event && typeof event === "object" ? event as Record<string, unknown> : {};
    const kind = typeof record.kind === "string" ? record.kind : "";
    const automation = typeof record.automationName === "string" ? record.automationName : "unknown-automation";
    const runId = typeof record.runId === "string" ? record.runId : "";
    if (kind === "run_start") {
      writeProgress(context, `[automation] start ${automation}${runId ? ` ${runId}` : ""}\n`);
      return;
    }
    if (kind === "run_complete") {
      const status = typeof record.status === "string" ? record.status : "unknown";
      writeProgress(context, `[automation] done ${automation}${runId ? ` ${runId}` : ""} status=${status}\n`);
      return;
    }
    if ((kind === "stderr" || kind === "stdout") && typeof record.text === "string") {
      writeProgress(context, record.text);
    }
  };
}

function writeProgress(context: CliContext, text: string): void {
  context.stderr(text);
}

function attemptFailed(attempt: PatchAttemptRecord): boolean {
  return ["failed", "blocked", "needs_intervention"].includes(attempt.status);
}

function patchRepoPath(context: CliContext): string {
  return resolvePath(context.workspaceRoot, flagValue(context.parsed, "repo") ?? context.env.PATCH_MOI_PATCH_REPO ?? ".");
}

function writeOutput(context: CliContext, payload: {
  event?: AutomationEvent;
  recorded?: boolean;
  record?: AutomationDispatchRecord;
  attempt?: PatchAttemptRecord;
  attempts?: PatchAttemptRecord[];
  work?: PatchWorkRecord;
  branchResult?: unknown;
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
  if (payload.work) {
    writeLine(context, `work: ${payload.work.status} ${payload.work.id}`);
    writeLine(context, `title: ${payload.work.title}`);
  }
  if (payload.attempt) {
    writeLine(context, `attempt: ${payload.attempt.status} ${payload.attempt.id}`);
    for (const thread of payload.attempt.workspaceThreadRefs ?? []) {
      const owner = thread.automationName;
      writeLine(
        context,
        `thread: ${owner || thread.label || "codex"} ${thread.threadId}${thread.turnId ? ` turn=${thread.turnId}` : ""}`,
      );
    }
  }
  if (payload.attempts) {
    for (const attempt of payload.attempts) {
      writeLine(context, `attempt: ${attempt.status} ${attempt.operation} ${attempt.id}`);
    }
  }
  if (payload.branchResult) {
    const result = payload.branchResult as { status?: string; branch?: string; base?: string };
    writeLine(context, `branch: ${result.status ?? "updated"} ${result.branch ?? ""}${result.base ? ` from ${result.base}` : ""}`.trim());
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

function automationFlags(parsed: ParsedArgs): string[] | undefined {
  const values = parsed.flags.get("automation") ?? parsed.flags.get("automations") ?? [];
  const automations = values.flatMap((value) =>
    value.split(",").map((entry) => entry.trim()).filter((entry) => entry && entry !== "true")
  );
  return automations.length > 0 ? [...new Set(automations)] : undefined;
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
      existsSync(path.join(current, "automations/patch-moi-harness-fork/automation.json"))
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

function dispatchStatus(value: string | undefined): AutomationDispatchRecord["status"] | undefined {
  if (!value) return undefined;
  if (value === "dispatched" || value === "failed" || value === "skipped") return value;
  throw new UsageError("--status must be dispatched, failed, or skipped");
}

function patchAttemptStatus(value: string | undefined): PatchAttemptRecord["status"] | undefined {
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
  throw new UsageError("--status is not a valid patch attempt status");
}

function patchWorkKind(value: string | undefined): PatchWorkKind | undefined {
  if (!value) return undefined;
  if (value === "feature" || value === "maintenance" || value === "release") return value;
  throw new UsageError("--kind must be feature, maintenance, or release");
}

function patchWorkStatus(value: string | undefined): PatchWorkStatus | undefined {
  if (!value) return undefined;
  if (
    value === "planned" ||
    value === "active" ||
    value === "captured" ||
    value === "changed" ||
    value === "completed" ||
    value === "needs_intervention" ||
    value === "blocked" ||
    value === "failed" ||
    value === "skipped" ||
    value === "review" ||
    value === "shipped" ||
    value === "closed"
  ) return value;
  throw new UsageError("--status is not a valid patch work status");
}

function terminalPatchWorkStatus(status: PatchWorkStatus): boolean {
  return status === "completed" ||
    status === "failed" ||
    status === "skipped" ||
    status === "shipped" ||
    status === "closed";
}

function slugValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replaceAll("/", "-") || "work";
}

function uniqueCandidateRefs(refs: CandidateRefRecord[]): CandidateRefRecord[] {
  const seen = new Set<string>();
  const result: CandidateRefRecord[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.repo ?? ""}:${ref.remote ?? ""}:${ref.ref}:${ref.sha ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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
