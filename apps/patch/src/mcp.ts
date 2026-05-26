#!/usr/bin/env bun

import path from "node:path";
import { canonicalUpstreamRef, loadPatchMoiConfig, type PatchMoiConfig } from "./config";
import {
  dispatchWorkspaceEventDetailed,
  maintenanceAttemptForWorkspaceDispatch,
  patchDownstreamReleaseEvent,
  patchUpstreamBranchUpdateEvent,
  patchUpstreamReleaseEvent,
  replayWorkspaceEventDetailed,
} from "./automation";
import { discoverPatchGitProject, fetchUpstream } from "./git-discovery";
import { syncMaintenanceAttempt } from "./maintenance";
import {
  capturePatchBranch,
  inspectPatchWorkspace,
  listPatchBranches,
  rebuildPatchMain,
} from "./patch-workspace";
import { EventStore } from "./queue";
import type { AutomationEvent } from "./types";

type McpEnv = Record<string, string | undefined>;
type ToolArgs = Record<string, unknown>;

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const jsonObjectSchema = {
  type: "object",
  additionalProperties: true,
};

const commonProperties = {
  cwd: { type: "string", description: "Workspace root for automation discovery. Defaults to process cwd." },
  workspaceRoot: { type: "string", description: "Explicit workspace root for automation discovery and relative DATA_DIR." },
  repo: { type: "string", description: "Git repository to inspect or mutate. Defaults to cwd, PATCH_MOI_PATCH_REPO, or the workspace root." },
  dataDir: { type: "string", description: "patch.moi DATA_DIR. Defaults to DATA_DIR or ./data under the workspace root." },
  mode: { type: "string", enum: ["local", "remote"], description: "Override PATCH_MOI_MODE for this call." },
};

export const patchMoiTools: ToolDefinition[] = [
  tool("status", "Show recent patch.moi events, dispatches, and maintenance attempts.", {
    limit: { type: "number" },
  }),
  tool("events", "List recorded patch.moi automation events from DATA_DIR.", {
    type: { type: "string" },
    limit: { type: "number" },
  }),
  tool("attempts", "List recorded maintenance attempts from DATA_DIR.", {
    eventId: { type: "string" },
    status: { type: "string" },
    limit: { type: "number" },
  }),
  tool("dispatches", "List recorded workspace dispatches from DATA_DIR.", {
    eventId: { type: "string" },
    status: { type: "string" },
    limit: { type: "number" },
  }),
  tool("patch_doctor", "Inspect patch stack readiness using Git remotes, remote-tracking upstream refs, target branch, and patch branches.", {
    main: { type: "string" },
    upstreamBranch: { type: "string" },
    upstreamRemote: { type: "string" },
    forkRemote: { type: "string" },
    prefix: { type: "string" },
  }),
  tool("patch_list", "List local patch branches ordered by branch name.", {
    prefix: { type: "string" },
  }),
  tool("git_discover", "Discover the Git-first patch.moi project model and local readiness issues.", {}),
  tool("fetch_upstream", "Fetch the configured upstream branch and tags when fetch policy explicitly allows it.", {}),
  tool("run_upstream_release_dry_run", "Build an upstream.release event and report configured automations without writing DATA_DIR.", {
    tag: { type: "string" },
    upstreamRepo: { type: "string" },
  }, ["upstreamRepo", "tag"]),
  tool("run_upstream_branch_dry_run", "Build an upstream.branch_update event and report configured automations without writing DATA_DIR.", {
    sha: { type: "string" },
    upstreamRepo: { type: "string" },
    ref: { type: "string" },
  }, ["upstreamRepo"]),
  tool("run_downstream_release_dry_run", "Build a downstream.release event and report configured automations without writing DATA_DIR.", {
    packageName: { type: "string" },
    version: { type: "string" },
    repo: { type: "string" },
  }, ["packageName", "version"]),
  tool("run_upstream_release", "Dispatch an upstream.release maintenance event. Gated by patch.moi safety policy.", {
    tag: { type: "string" },
    upstreamRepo: { type: "string" },
  }, ["upstreamRepo", "tag"]),
  tool("run_upstream_branch", "Dispatch an upstream.branch_update maintenance event. Gated by patch.moi safety policy.", {
    sha: { type: "string" },
    upstreamRepo: { type: "string" },
    ref: { type: "string" },
  }, ["upstreamRepo"]),
  tool("run_downstream_release", "Dispatch a downstream.release maintenance event. Gated by patch.moi safety policy.", {
    packageName: { type: "string" },
    version: { type: "string" },
    repo: { type: "string" },
  }, ["packageName", "version"]),
  tool("retry", "Retry a recorded event through the workspace backend. Gated by patch.moi safety policy.", {
    eventId: { type: "string" },
  }, ["eventId"]),
  tool("replay", "Replay a recorded event through the workspace backend. Gated by patch.moi safety policy.", {
    eventId: { type: "string" },
  }, ["eventId"]),
  tool("sync", "Sync one recorded maintenance attempt from workspace run state. Gated by PATCH_MOI_ALLOW_SYNC.", {
    attemptId: { type: "string" },
  }, ["attemptId"]),
  tool("patch_capture", "Capture a branch as a patch branch. Gated by patch.moi safety policy.", {
    patchBranch: { type: "string" },
    from: { type: "string" },
    base: { type: "string" },
    message: { type: "string" },
    force: { type: "boolean" },
  }, ["patchBranch", "from"]),
  tool("patch_rebuild", "Rebuild the target branch from the canonical upstream ref plus patch branches. Gated by patch.moi safety policy.", {
    base: { type: "string" },
    to: { type: "string" },
    prefix: { type: "string" },
  }),
];

export async function callPatchMoiTool(
  name: string,
  args: ToolArgs = {},
  env: McpEnv = process.env,
): Promise<unknown> {
  const mode = stringArg(args, "mode") ?? env.PATCH_MOI_MODE ?? "local";
  if (mode === "remote") {
    return await callRemoteTool(name, args, env);
  }
  if (mode !== "local") {
    throw new Error(`unsupported PATCH_MOI_MODE: ${mode}`);
  }
  return await callLocalTool(name, args, env);
}

async function callLocalTool(name: string, args: ToolArgs, env: McpEnv): Promise<unknown> {
  const workspaceRoot = workspaceRootArg(args, env);
  const dataDir = dataDirArg(args, workspaceRoot, env);
  const repoPath = repoArg(args, workspaceRoot, env);
  const store = new EventStore(dataDir);

  switch (name) {
    case "status": {
      const limit = numberArg(args, "limit", 20);
      const [events, dispatches, attempts] = await Promise.all([
        store.listAutomationEvents({ limit }),
        store.listWorkspaceDispatches({ limit }),
        store.listMaintenanceAttempts({ limit }),
      ]);
      return {
        mode: "local",
        dataDir,
        latest: { events, dispatches, attempts },
        attemptStatusCounts: countBy(attempts, (attempt) => attempt.status),
        dispatchStatusCounts: countBy(dispatches, (record) => record.status),
      };
    }
    case "events":
      return {
        mode: "local",
        dataDir,
        events: await store.listAutomationEvents({
          type: stringArg(args, "type"),
          limit: numberArg(args, "limit", 50),
        }),
      };
    case "attempts":
      return {
        mode: "local",
        dataDir,
        attempts: await store.listMaintenanceAttempts({
          eventId: stringArg(args, "eventId"),
          status: maintenanceStatusArg(args),
          limit: numberArg(args, "limit", 50),
        }),
      };
    case "dispatches":
      return {
        mode: "local",
        dataDir,
        dispatches: await store.listWorkspaceDispatches({
          eventId: stringArg(args, "eventId"),
          status: dispatchStatusArg(args),
          limit: numberArg(args, "limit", 50),
        }),
      };
    case "patch_doctor": {
      const config = await configForRepo(repoPath, args);
      return await inspectPatchWorkspace(repoPath, {
        config,
        mainBranch: stringArg(args, "main"),
        upstreamBranch: stringArg(args, "upstreamBranch"),
        upstreamRemote: stringArg(args, "upstreamRemote"),
        forkRemote: stringArg(args, "forkRemote"),
        patchPrefix: stringArg(args, "prefix"),
      });
    }
    case "patch_list": {
      const config = await configForRepo(repoPath, args);
      return {
        repo: repoPath,
        patchPrefix: stringArg(args, "prefix") ?? config.git.patchPrefix,
        patchBranches: await listPatchBranches(repoPath, stringArg(args, "prefix") ?? config.git.patchPrefix),
      };
    }
    case "git_discover":
      return await discoverPatchGitProject(repoPath, await configForRepo(repoPath, args));
    case "fetch_upstream": {
      const config = await configForRepo(repoPath, args);
      assertFetchAllowed(config, env);
      return await fetchUpstream(repoPath, config);
    }
    case "run_upstream_release_dry_run":
      return await dryRunEvent(upstreamReleaseEvent(args), workspaceRoot);
    case "run_upstream_branch_dry_run":
      return await dryRunEvent(upstreamBranchEvent(args), workspaceRoot);
    case "run_downstream_release_dry_run":
      return await dryRunEvent(downstreamReleaseEvent(args), workspaceRoot);
    case "run_upstream_release":
      return await dispatchEvent(upstreamReleaseEvent(args), store, workspaceRoot, args, env, await configForRepo(repoPath, args));
    case "run_upstream_branch":
      return await dispatchEvent(upstreamBranchEvent(args), store, workspaceRoot, args, env, await configForRepo(repoPath, args));
    case "run_downstream_release":
      return await dispatchEvent(downstreamReleaseEvent(args), store, workspaceRoot, args, env, await configForRepo(repoPath, args));
    case "retry":
      return await retryEvent(requiredStringArg(args, "eventId"), store, workspaceRoot, args, env, await configForRepo(repoPath, args));
    case "replay":
      return await replayEvent(requiredStringArg(args, "eventId"), store, workspaceRoot, args, env, await configForRepo(repoPath, args));
    case "sync":
      return await syncAttempt(requiredStringArg(args, "attemptId"), store, workspaceRoot, env);
    case "patch_capture": {
      const config = await configForRepo(repoPath, args);
      assertSafetyAllowed(config, "allowCapture", "PATCH_MOI_ALLOW_CAPTURE", env);
      return await capturePatchBranch(repoPath, {
        patchBranch: requiredStringArg(args, "patchBranch"),
        from: requiredStringArg(args, "from"),
        base: stringArg(args, "base") ?? config.git.targetBranch,
        message: stringArg(args, "message"),
        force: booleanArg(args, "force"),
        patchPrefix: config.git.patchPrefix,
      });
    }
    case "patch_rebuild": {
      const config = await configForRepo(repoPath, args);
      assertSafetyAllowed(config, "allowRebuild", "PATCH_MOI_ALLOW_REBUILD", env);
      return await rebuildPatchMain(repoPath, {
        config,
        base: stringArg(args, "base") ?? canonicalUpstreamRef(config),
        targetBranch: stringArg(args, "to") ?? config.git.targetBranch,
        patchPrefix: stringArg(args, "prefix") ?? config.git.patchPrefix,
      });
    }
    default:
      throw new Error(`unknown patch.moi tool: ${name}`);
  }
}

async function callRemoteTool(name: string, args: ToolArgs, env: McpEnv): Promise<unknown> {
  const baseUrl = env.PATCH_MOI_URL?.trim();
  if (!baseUrl) {
    throw new Error("remote mode requires PATCH_MOI_URL");
  }
  switch (name) {
    case "status": {
      const limit = numberArg(args, "limit", 20);
      const [events, dispatches, attempts] = await Promise.all([
        remoteGet(baseUrl, `/automation-events?limit=${limit}`, env),
        remoteGet(baseUrl, `/workspace-dispatches?limit=${limit}`, env),
        remoteGet(baseUrl, `/maintenance-attempts?limit=${limit}`, env),
      ]);
      return { mode: "remote", url: baseUrl, latest: { ...recordValue(events), ...recordValue(dispatches), ...recordValue(attempts) } };
    }
    case "events":
      return await remoteGet(baseUrl, queryPath("/automation-events", {
        type: stringArg(args, "type"),
        limit: numberArg(args, "limit", 50),
      }), env);
    case "attempts":
      return await remoteGet(baseUrl, queryPath("/maintenance-attempts", {
        eventId: stringArg(args, "eventId"),
        status: stringArg(args, "status"),
        limit: numberArg(args, "limit", 50),
      }), env);
    case "dispatches":
      return await remoteGet(baseUrl, queryPath("/workspace-dispatches", {
        eventId: stringArg(args, "eventId"),
        status: stringArg(args, "status"),
        limit: numberArg(args, "limit", 50),
      }), env);
    default:
      throw new Error(`remote mode has only read-only status/events/attempts/dispatches wired in V1; ${name} is local-only`);
  }
}

async function dryRunEvent(event: AutomationEvent, workspaceRoot: string): Promise<unknown> {
  const automations = automationsForEvent(event, {});
  return {
    dryRun: true,
    event,
    workspaceRoot,
    automations,
  };
}

async function dispatchEvent(
  event: AutomationEvent,
  store: EventStore,
  workspaceRoot: string,
  args: ToolArgs,
  env: McpEnv,
  config: PatchMoiConfig,
): Promise<unknown> {
  assertSafetyAllowed(config, "allowDispatch", "PATCH_MOI_ALLOW_DISPATCH", env);
  const recorded = await appendAutomationEventIfMissing(store, event);
  const outcome = await dispatchWorkspaceEventDetailed(event, {}, {
    env,
    cwd: workspaceRoot,
  });
  await store.appendWorkspaceDispatch(outcome.record);
  const attempt = maintenanceAttemptForWorkspaceDispatch(event, outcome.record, outcome.result?.runs);
  await store.appendMaintenanceAttempt(attempt);
  return { event, recorded, record: outcome.record, attempt };
}

async function retryEvent(
  eventId: string,
  store: EventStore,
  workspaceRoot: string,
  args: ToolArgs,
  env: McpEnv,
  config: PatchMoiConfig,
): Promise<unknown> {
  assertSafetyAllowed(config, "allowDispatch", "PATCH_MOI_ALLOW_DISPATCH", env);
  const event = await store.getAutomationEvent(eventId);
  if (!event) {
    throw new Error(`automation event not found: ${eventId}`);
  }
  const outcome = await dispatchWorkspaceEventDetailed(event, {}, { env, cwd: workspaceRoot });
  await store.appendWorkspaceDispatch(outcome.record);
  const attempt = maintenanceAttemptForWorkspaceDispatch(event, outcome.record, outcome.result?.runs);
  await store.appendMaintenanceAttempt(attempt);
  return { event, record: outcome.record, attempt };
}

async function replayEvent(
  eventId: string,
  store: EventStore,
  workspaceRoot: string,
  args: ToolArgs,
  env: McpEnv,
  config: PatchMoiConfig,
): Promise<unknown> {
  assertSafetyAllowed(config, "allowReplay", "PATCH_MOI_ALLOW_REPLAY", env);
  const event = await store.getAutomationEvent(eventId);
  if (!event) {
    throw new Error(`automation event not found: ${eventId}`);
  }
  const outcome = await replayWorkspaceEventDetailed(event, {}, { env, cwd: workspaceRoot });
  await store.appendWorkspaceDispatch(outcome.record);
  const attempt = maintenanceAttemptForWorkspaceDispatch(event, outcome.record, outcome.result?.runs);
  await store.appendMaintenanceAttempt(attempt);
  return { event, record: outcome.record, attempt };
}

async function syncAttempt(
  attemptId: string,
  store: EventStore,
  workspaceRoot: string,
  env: McpEnv,
): Promise<unknown> {
  if (!truthy(env.PATCH_MOI_ALLOW_SYNC)) {
    throw new Error("sync is gated; set PATCH_MOI_ALLOW_SYNC=1 to allow local state writes");
  }
  const attempt = await store.getMaintenanceAttempt(attemptId);
  if (!attempt) {
    throw new Error(`maintenance attempt not found: ${attemptId}`);
  }
  return { attempt: await syncMaintenanceAttempt(store, attempt, { env, cwd: workspaceRoot }) };
}

async function appendAutomationEventIfMissing(store: EventStore, event: AutomationEvent): Promise<boolean> {
  if (await store.getAutomationEvent(event.id)) {
    return false;
  }
  await store.appendAutomationEvent(event);
  return true;
}

async function configForRepo(repoPath: string, args: ToolArgs): Promise<PatchMoiConfig> {
  const config = await loadPatchMoiConfig(repoPath);
  return {
    git: {
      ...config.git,
      ...(stringArg(args, "upstreamRemote") ? { upstreamRemote: requiredStringArg(args, "upstreamRemote") } : {}),
      ...(stringArg(args, "upstreamBranch") ? { upstreamBranch: requiredStringArg(args, "upstreamBranch") } : {}),
      ...(stringArg(args, "forkRemote") ? { forkRemote: requiredStringArg(args, "forkRemote") } : {}),
      ...(stringArg(args, "main") ? { targetBranch: requiredStringArg(args, "main") } : {}),
      ...(stringArg(args, "prefix") ? { patchPrefix: requiredStringArg(args, "prefix") } : {}),
    },
    fetch: { ...config.fetch },
    safety: { ...config.safety },
  };
}

function upstreamReleaseEvent(args: ToolArgs): AutomationEvent<Record<string, unknown>> {
  return patchUpstreamReleaseEvent({
    repo: requiredStringArg(args, "upstreamRepo"),
    tag: requiredStringArg(args, "tag"),
    automations: automationsArg(args),
  });
}

function upstreamBranchEvent(args: ToolArgs): AutomationEvent<Record<string, unknown>> {
  return patchUpstreamBranchUpdateEvent({
    repo: requiredStringArg(args, "upstreamRepo"),
    ref: stringArg(args, "ref") ?? "refs/heads/main",
    sha: stringArg(args, "sha"),
    automations: automationsArg(args),
  });
}

function downstreamReleaseEvent(args: ToolArgs): AutomationEvent<Record<string, unknown>> {
  return patchDownstreamReleaseEvent({
    packageName: requiredStringArg(args, "packageName"),
    version: requiredStringArg(args, "version"),
    repo: stringArg(args, "repo"),
    automations: automationsArg(args),
  });
}

function assertFetchAllowed(config: PatchMoiConfig, env: McpEnv): void {
  if (config.fetch.allowFetch || truthy(env.PATCH_MOI_ALLOW_FETCH)) {
    return;
  }
  throw new Error("fetch_upstream is gated; set [fetch].allowFetch=true in .patchmoi.toml or PATCH_MOI_ALLOW_FETCH=1");
}

function assertSafetyAllowed(
  config: PatchMoiConfig,
  field: keyof PatchMoiConfig["safety"],
  envName: string,
  env: McpEnv,
): void {
  if (config.safety[field] || truthy(env[envName])) {
    return;
  }
  throw new Error(`${field} is gated; set [safety].${field}=true in .patchmoi.toml or ${envName}=1`);
}

async function remoteGet(baseUrl: string, pathName: string, env: McpEnv): Promise<unknown> {
  const response = await fetch(new URL(pathName, baseUrl), {
    headers: remoteHeaders(env),
  });
  if (!response.ok) {
    throw new Error(`PATCH_MOI_URL request failed with ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

function remoteHeaders(env: McpEnv): HeadersInit {
  const token = env.PATCH_ADMIN_TOKEN?.trim();
  return token
    ? {
      authorization: `Bearer ${token}`,
      "x-patch-admin-token": token,
    }
    : {};
}

function queryPath(pathName: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${pathName}?${query}` : pathName;
}

function workspaceRootArg(args: ToolArgs, env: McpEnv): string {
  return path.resolve(stringArg(args, "workspaceRoot") ?? stringArg(args, "cwd") ?? env.PATCH_MOI_WORKSPACE_ROOT ?? process.cwd());
}

function dataDirArg(args: ToolArgs, workspaceRoot: string, env: McpEnv): string {
  const value = stringArg(args, "dataDir") ?? env.DATA_DIR ?? "./data";
  return path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value);
}

function repoArg(args: ToolArgs, workspaceRoot: string, env: McpEnv): string {
  const value = stringArg(args, "repo") ?? env.PATCH_MOI_PATCH_REPO ?? stringArg(args, "cwd") ?? workspaceRoot;
  return path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value);
}

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolDefinition {
  return {
    name,
    description,
    inputSchema: {
      ...jsonObjectSchema,
      properties: {
        ...commonProperties,
        ...properties,
      },
      required,
    },
  };
}

function requiredStringArg(args: ToolArgs, key: string): string {
  const value = stringArg(args, key);
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function stringArg(args: ToolArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function automationsArg(args: ToolArgs): string[] | undefined {
  const value = args.automations ?? args.automation;
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const automations = list
    .map((entry) => typeof entry === "string" ? entry.trim() : "")
    .filter(Boolean);
  return automations.length > 0 ? [...new Set(automations)] : undefined;
}

function automationsForEvent(
  event: AutomationEvent,
  env: Record<string, string | undefined>,
): string[] {
  return [
    ...(event.automations ?? []),
    ...commaList(env.PATCH_AUTOMATIONS),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function commaList(value: string | undefined): string[] {
  return value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function numberArg(args: ToolArgs, key: string, fallback: number): number {
  const value = args[key];
  if (value === undefined) {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function booleanArg(args: ToolArgs, key: string): boolean {
  const value = args[key];
  return value === true || value === "true" || value === "1" || value === "yes";
}

function dispatchStatusArg(args: ToolArgs): "dispatched" | "failed" | "skipped" | undefined {
  const value = stringArg(args, "status");
  if (!value) return undefined;
  if (value === "dispatched" || value === "failed" || value === "skipped") return value;
  throw new Error("status must be dispatched, failed, or skipped");
}

function maintenanceStatusArg(args: ToolArgs) {
  const value = stringArg(args, "status");
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
  throw new Error("status is not a valid maintenance attempt status");
}

function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

function startMcpServer(): void {
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }
      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match?.[1]) {
        throw new Error("MCP message missing Content-Length");
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) {
        return;
      }
      const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.subarray(bodyEnd);
      void handleRpcMessage(JSON.parse(body) as JsonRpcMessage);
    }
  });
}

async function handleRpcMessage(message: JsonRpcMessage): Promise<void> {
  if (!message.id && message.id !== 0) {
    return;
  }
  try {
    if (message.method === "initialize") {
      writeRpc({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "patch-moi", version: "0.1.0" },
        },
      });
      return;
    }
    if (message.method === "tools/list") {
      writeRpc({
        jsonrpc: "2.0",
        id: message.id,
        result: { tools: patchMoiTools },
      });
      return;
    }
    if (message.method === "tools/call") {
      const params = recordValue(message.params);
      const name = typeof params.name === "string" ? params.name : "";
      try {
        const result = await callPatchMoiTool(name, recordValue(params.arguments), process.env);
        writeRpc({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (error) {
        writeRpc({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            isError: true,
            content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          },
        });
      }
      return;
    }
    if (message.method === "ping") {
      writeRpc({ jsonrpc: "2.0", id: message.id, result: {} });
      return;
    }
    writeRpc({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: `method not found: ${message.method ?? "unknown"}` },
    });
  } catch (error) {
    writeRpc({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    });
  }
}

function writeRpc(value: unknown): void {
  const body = JSON.stringify(value);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

if (import.meta.main) {
  startMcpServer();
}
