import {
  createFlowClient,
  type FlowCancelResult,
  type FlowClient,
  type FlowDispatchOptions,
  type FlowDispatchResult,
  type FlowEventList,
  type FlowListEventsOptions,
  type FlowListRunsOptions,
  type FlowReplayOptions,
  type FlowReplayResult,
  type FlowRunList,
  type FlowRunView,
} from "@peezy.tech/codex-flows/flow-runtime/client";
import { createActionsLocalFlowClient } from "@peezy.tech/codex-flows/actions";
import { CodexWorkspaceBackendClient } from "@peezy.tech/codex-flows/workspace-backend";
import {
  normalizeDispatchResult,
  normalizeEvent,
  normalizeEventList,
  normalizeRun,
  normalizeRunList,
} from "@peezy.tech/codex-flows/flow-runtime/backend-client";
import type { FeedWorkspaceFlowTarget, FlowEvent } from "./types";

export type WorkspaceBackendFetch = (url: string, init: RequestInit) => Promise<Response>;

export type WorkspaceBackendConfig = {
  env?: Record<string, string | undefined>;
  fetchImpl?: WorkspaceBackendFetch;
  cwd?: string;
};

export type PatchWorkspaceBackend = {
  mode: "local" | "actions-local" | "workspace-http" | "workspace-ws";
  url?: string;
  eventsUrl?: string;
  client: FlowClient;
};

export function createPatchWorkspaceBackend(
  target: Partial<FeedWorkspaceFlowTarget> = {},
  config: WorkspaceBackendConfig = {},
): PatchWorkspaceBackend {
  const env = config.env ?? process.env;
  const url = targetWorkspaceBackendUrl(target, env);
  if (url) {
    if (isWebSocketUrl(url)) {
      return {
        mode: "workspace-ws",
        url,
        client: new WorkspaceBackendWebSocketFlowClient(url),
      };
    }
    const baseUrl = workspaceBackendHttpBaseUrl(url);
    return {
      mode: "workspace-http",
      url: baseUrl,
      eventsUrl: workspaceBackendEventsUrl(url),
      client: createFlowClient({
        mode: "http",
        baseUrl,
        hmacSecret: targetWorkspaceSecret(target, env),
        ...(config.fetchImpl ? { fetch: patchFetch(config.fetchImpl) } : {}),
      }),
    };
  }
  const cwd = config.cwd ?? process.cwd();
  if (actionsLocalRequested(env)) {
    return {
      mode: "actions-local",
      client: createActionsLocalFlowClient({
        workspaceRoot: cwd,
        env,
      }) as unknown as FlowClient,
    };
  }
  return {
    mode: "local",
    client: createFlowClient({
      mode: "local",
      cwd,
      env,
      codex: {
        command: env.CODEX_APP_SERVER_CODEX_COMMAND,
        codexHome: env.CODEX_HOME,
        stream: true,
      },
    }),
  };
}

export function targetWorkspaceBackendUrl(
  target: Partial<FeedWorkspaceFlowTarget>,
  env: Record<string, string | undefined>,
): string | undefined {
  const explicit = target.workspaceUrl?.trim() || target.dispatchUrl?.trim();
  if (explicit) {
    return explicit;
  }
  for (const envName of [target.workspaceUrlEnv, target.dispatchUrlEnv]) {
    const value = envName?.trim() ? env[envName.trim()]?.trim() : undefined;
    if (value) {
      return value;
    }
  }
  return env.PATCH_WORKSPACE_BACKEND_URL?.trim() ||
    env.PATCH_FLOW_BACKEND_URL?.trim() ||
    env.PATCH_FLOW_DISPATCH_URL?.trim() ||
    undefined;
}

export function targetWorkspaceSecret(
  target: Partial<FeedWorkspaceFlowTarget>,
  env: Record<string, string | undefined>,
): string | undefined {
  for (const envName of [target.workspaceSecretEnv, target.dispatchSecretEnv]) {
    const value = envName?.trim() ? env[envName.trim()]?.trim() : undefined;
    if (value) {
      return value;
    }
  }
  return env.PATCH_WORKSPACE_BACKEND_SECRET?.trim() ||
    env.PATCH_FLOW_DISPATCH_SECRET?.trim() ||
    undefined;
}

export function workspaceBackendHttpBaseUrl(url: string): string {
  return url.replace(/\/(?:events|flow-events)\/?$/, "").replace(/\/+$/, "");
}

export function workspaceBackendEventsUrl(url: string): string {
  return `${workspaceBackendHttpBaseUrl(url)}/events`;
}

function isWebSocketUrl(url: string): boolean {
  return url.startsWith("ws://") || url.startsWith("wss://");
}

function actionsLocalRequested(env: Record<string, string | undefined>): boolean {
  return env.CODEX_WORKSPACE_MODE === "actions" || env.GITHUB_ACTIONS === "true";
}

function patchFetch(fetchImpl: WorkspaceBackendFetch) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    return fetchImpl(String(input), init ?? {});
  };
}

class WorkspaceBackendWebSocketFlowClient implements FlowClient {
  #url: string;

  constructor(url: string) {
    this.#url = url;
  }

  async listRuns(options: FlowListRunsOptions = {}): Promise<FlowRunList> {
    return normalizeRunList(await this.#request("flow.listRuns", options));
  }

  async getRun(runId: string): Promise<FlowRunView> {
    const raw = await this.#request("flow.getRun", { runId });
    return normalizeRun(record(raw).run ?? raw);
  }

  async listEvents(options: FlowListEventsOptions = {}): Promise<FlowEventList> {
    return normalizeEventList(await this.#request("flow.listEvents", options));
  }

  async getEvent(eventId: string) {
    const raw = await this.#request("flow.getEvent", { eventId });
    return normalizeEvent(record(raw).event ?? raw, record(raw).runs);
  }

  async dispatchEvent(event: FlowEvent, options: FlowDispatchOptions = {}): Promise<FlowDispatchResult> {
    return normalizeDispatchResult(await this.#request("flow.dispatch", {
      event,
      ...options,
    }));
  }

  async replayEvent(eventId: string, options: FlowReplayOptions = {}): Promise<FlowReplayResult> {
    return normalizeDispatchResult(await this.#request("flow.replay", {
      eventId,
      ...options,
    }));
  }

  async cancelRun(runId: string): Promise<FlowCancelResult> {
    const raw = await this.#request("flow.cancelRun", { runId });
    return {
      run: normalizeRun(record(raw).run ?? raw),
      raw,
    };
  }

  async #request(method: string, params?: unknown): Promise<unknown> {
    const client = new CodexWorkspaceBackendClient({
      clientName: "patch-moi",
      clientTitle: "patch.moi",
      clientVersion: "0.1.0",
      webSocketTransportOptions: {
        url: this.#url,
        requestTimeoutMs: 90_000,
      },
    });
    try {
      await client.connect();
      return await client.workspaceRequest(method, params);
    } finally {
      client.close();
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
