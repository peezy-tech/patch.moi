#!/usr/bin/env bun

import path from "node:path";
import { canonicalUpstreamRef, loadPatchMoiConfig, type PatchMoiConfig } from "./config";
import { discoverPatchGitProject, fetchUpstream } from "./git-discovery";
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
  cwd: { type: "string", description: "Workspace root for resolving relative paths. Defaults to process cwd." },
  workspaceRoot: { type: "string", description: "Explicit workspace root for relative paths." },
  repo: { type: "string", description: "Git repository to inspect or mutate. Defaults to cwd, PATCH_MOI_PATCH_REPO, or the workspace root." },
};

export const patchMoiTools: ToolDefinition[] = [
  tool("git_discover", "Discover the local Git patch-stack model and readiness issues.", {}),
  tool("fetch_upstream", "Fetch the configured upstream branch and tags when fetch policy explicitly allows it.", {}),
  tool("work_start_feature", "Start feature patch work locally and optionally create the feature branch. Does not write patch.moi state.", {
    title: { type: "string" },
    branch: { type: "string" },
    base: { type: "string" },
    patchBranch: { type: "string" },
    createBranch: { type: "boolean" },
  }, ["title", "branch", "base"]),
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
  tool("patch_candidates", "List local or remote-tracking runner candidate refs from Git.", {
    remote: { type: "string" },
    pattern: { type: "string" },
  }),
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
  tool("patch_pull", "Fetch and fast-forward a local branch from a runner candidate branch. Gated by patch.moi safety policy.", {
    remote: { type: "string" },
    branch: { type: "string" },
    ffOnly: { type: "boolean" },
  }, ["remote", "branch"]),
];

export async function callPatchMoiTool(
  name: string,
  args: ToolArgs = {},
  env: McpEnv = process.env,
): Promise<unknown> {
  const workspaceRoot = workspaceRootArg(args, env);
  const repoPath = repoArg(args, workspaceRoot, env);

  switch (name) {
    case "git_discover":
      return await discoverPatchGitProject(repoPath, await configForRepo(repoPath, args));
    case "fetch_upstream": {
      const config = await configForRepo(repoPath, args);
      assertFetchAllowed(config, env);
      return await fetchUpstream(repoPath, config);
    }
    case "work_start_feature":
      return await startFeatureWork(repoPath, args);
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
    case "patch_candidates":
      return await listPatchCandidates(repoPath, {
        remote: stringArg(args, "remote"),
        pattern: stringArg(args, "pattern"),
      });
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
    case "patch_pull": {
      const config = await configForRepo(repoPath, args);
      assertSafetyAllowed(config, "allowPull", "PATCH_MOI_ALLOW_PULL", env);
      return await pullPatchCandidate(repoPath, {
        remote: requiredStringArg(args, "remote"),
        branch: requiredStringArg(args, "branch"),
        ffOnly: booleanArg(args, "ffOnly"),
      });
    }
    default:
      throw new Error(`unknown patch.moi tool: ${name}`);
  }
}

async function startFeatureWork(repoPath: string, args: ToolArgs): Promise<unknown> {
  const title = requiredStringArg(args, "title");
  const branch = requiredStringArg(args, "branch");
  const base = requiredStringArg(args, "base");
  const baseSha = await resolvePatchRef(repoPath, base);
  const branchResult = booleanArg(args, "createBranch")
    ? await createPatchWorkBranch(repoPath, { branch, base })
    : undefined;
  const workBranchSha = branchResult?.sha ?? await resolvePatchRef(repoPath, branch);
  return {
    kind: "feature",
    title,
    repo: repoPath,
    baseRef: base,
    baseSha,
    workBranch: branch,
    workBranchSha,
    ...(stringArg(args, "patchBranch") ? { patchBranch: stringArg(args, "patchBranch") } : {}),
    createdBranch: Boolean(branchResult),
  };
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

function workspaceRootArg(args: ToolArgs, env: McpEnv): string {
  return path.resolve(stringArg(args, "workspaceRoot") ?? stringArg(args, "cwd") ?? env.PATCH_MOI_WORKSPACE_ROOT ?? process.cwd());
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

function booleanArg(args: ToolArgs, key: string): boolean {
  const value = args[key];
  return value === true || value === "true" || value === "1" || value === "yes";
}

function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "yes" || value === "on";
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
