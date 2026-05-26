import {
  APP_SERVER_CALL_METHOD,
  CodexWorkspaceBackendClient,
} from "@peezy.tech/codex-flows/workspace-backend";
import { CodexAppServerClient } from "@peezy.tech/codex-flows";
import type { FeedWorkspaceAutomationTarget } from "./types";

export type WorkspaceBackendFetch = (url: string, init: RequestInit) => Promise<Response>;

export type WorkspaceBackendConfig = {
  env?: Record<string, string | undefined>;
  cwd?: string;
  progress?: (event: unknown) => void;
};

export type AutomationHostBackend = {
  mode: "app-server" | "workspace-ws";
  url?: string;
  appRequest(method: string, params: unknown): Promise<unknown>;
  workspaceRequest?(method: string, params: unknown): Promise<unknown>;
  close(): void;
};

export async function createAutomationHostBackend(
  target: Partial<FeedWorkspaceAutomationTarget> = {},
  config: WorkspaceBackendConfig = {},
): Promise<AutomationHostBackend> {
  const env = config.env ?? process.env;
  const url = targetWorkspaceBackendUrl(target, env);
  if (url) {
    if (!isWebSocketUrl(url)) {
      throw new Error(`workspace automation requires a WebSocket workspace backend URL, got ${url}`);
    }
    const client = new CodexWorkspaceBackendClient({
      clientName: "patch-moi",
      clientTitle: "patch.moi",
      clientVersion: "0.1.0",
      webSocketTransportOptions: {
        url,
        requestTimeoutMs: 90_000,
      },
    });
    await client.connect();
    return {
      mode: "workspace-ws",
      url,
      appRequest: async (method, params) =>
        await client.workspaceRequest(APP_SERVER_CALL_METHOD, { method, params }),
      workspaceRequest: async (method, params) =>
        await client.workspaceRequest(method, params),
      close: () => client.close(),
    };
  }

  const client = new CodexAppServerClient({
    clientName: "patch-moi",
    clientTitle: "patch.moi",
    clientVersion: "0.1.0",
  });
  await client.connect();
  return {
    mode: "app-server",
    appRequest: async (method, params) => await client.request(method, params),
    close: () => client.close(),
  };
}

export function targetWorkspaceBackendUrl(
  target: Partial<FeedWorkspaceAutomationTarget>,
  env: Record<string, string | undefined>,
): string | undefined {
  const explicit = target.workspaceUrl?.trim();
  if (explicit) {
    return explicit;
  }
  if (target.workspaceUrlEnv?.trim()) {
    const value = env[target.workspaceUrlEnv.trim()]?.trim();
    if (value) {
      return value;
    }
  }
  return env.PATCH_WORKSPACE_BACKEND_URL?.trim() || undefined;
}

function isWebSocketUrl(url: string): boolean {
  return url.startsWith("ws://") || url.startsWith("wss://");
}
