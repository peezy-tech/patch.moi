import {
  APP_SERVER_CALL_METHOD,
  CodexWorkspaceBackendClient,
} from "@peezy.tech/codex-flows/workspace-backend";
import {
  CodexAppServerClient,
  createSshRemoteAgentTransport,
} from "@peezy.tech/codex-flows";
import type { FeedWorkspaceAutomationTarget } from "./types";

export type WorkspaceBackendFetch = (url: string, init: RequestInit) => Promise<Response>;

export type WorkspaceBackendConfig = {
  env?: Record<string, string | undefined>;
  cwd?: string;
  allowLocal?: boolean;
  progress?: (event: unknown) => void;
};

export type AutomationHostBackend = {
  mode: WorkspaceExecutionSelection["transport"];
  url?: string;
  sshTarget?: string;
  remoteCwd?: string;
  appRequest(method: string, params: unknown): Promise<unknown>;
  workspaceRequest?(method: string, params: unknown): Promise<unknown>;
  close(): void;
};

export type WorkspaceExecutionSelection =
  | {
    target: "local";
    transport: "app-server";
  }
  | {
    target: "workspace-backend";
    transport: "workspace-ws";
    workspaceBackendUrl: string;
  }
  | {
    target: "ssh";
    transport: "ssh-remote-agent";
    sshTarget: string;
    remoteCwd?: string;
  };

export async function createAutomationHostBackend(
  target: Partial<FeedWorkspaceAutomationTarget> = {},
  config: WorkspaceBackendConfig = {},
): Promise<AutomationHostBackend> {
  const env = config.env ?? process.env;
  const selection = selectWorkspaceExecution(target, config);
  if (selection.transport === "workspace-ws") {
    const client = new CodexWorkspaceBackendClient({
      clientName: "patch-moi",
      clientTitle: "patch.moi",
      clientVersion: "0.1.0",
      webSocketTransportOptions: {
        url: selection.workspaceBackendUrl,
        requestTimeoutMs: 90_000,
      },
    });
    await client.connect();
    return {
      mode: "workspace-ws",
      url: selection.workspaceBackendUrl,
      appRequest: async (method, params) =>
        await client.workspaceRequest(APP_SERVER_CALL_METHOD, { method, params }),
      workspaceRequest: async (method, params) =>
        await client.workspaceRequest(method, params),
      close: () => client.close(),
    };
  }
  if (selection.transport === "ssh-remote-agent") {
    const client = new CodexWorkspaceBackendClient({
      clientName: "patch-moi",
      clientTitle: "patch.moi",
      clientVersion: "0.1.0",
      transport: createSshRemoteAgentTransport({
        sshTarget: selection.sshTarget,
        cwd: selection.remoteCwd,
        timeoutMs: 90_000,
        env,
      }),
    });
    await client.connect();
    return {
      mode: "ssh-remote-agent",
      sshTarget: selection.sshTarget,
      remoteCwd: selection.remoteCwd,
      appRequest: async (method, params) =>
        await client.workspaceRequest(APP_SERVER_CALL_METHOD, { method, params }),
      workspaceRequest: async (method, params) =>
        await client.workspaceRequest(method, params),
      close: () => client.close(),
    };
  }
  if (!localAppServerAllowed(config, env)) {
    throw new Error("local app-server dispatch requires --allow-local or PATCH_ALLOW_LOCAL_APP_SERVER=1");
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

export function selectWorkspaceExecution(
  target: Partial<FeedWorkspaceAutomationTarget>,
  config: WorkspaceBackendConfig = {},
): WorkspaceExecutionSelection {
  const env = config.env ?? process.env;
  const url = targetWorkspaceBackendUrl(target, env);
  const ssh = targetSshRemote(target, env);
  if (url && ssh) {
    throw new Error("workspace automation cannot set both a workspace backend URL and an SSH target");
  }
  if (url) {
    if (!isWebSocketUrl(url)) {
      throw new Error(`workspace automation requires a WebSocket workspace backend URL, got ${url}`);
    }
    return {
      target: "workspace-backend",
      transport: "workspace-ws",
      workspaceBackendUrl: url,
    };
  }
  if (ssh) {
    return {
      target: "ssh",
      transport: "ssh-remote-agent",
      sshTarget: ssh.sshTarget,
      ...(ssh.remoteCwd ? { remoteCwd: ssh.remoteCwd } : {}),
    };
  }
  return {
    target: "local",
    transport: "app-server",
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

function targetSshRemote(
  target: Partial<FeedWorkspaceAutomationTarget>,
  env: Record<string, string | undefined>,
): { sshTarget: string; remoteCwd?: string } | undefined {
  const sshTarget = target.sshTarget?.trim() ||
    envValue(env, target.sshTargetEnv) ||
    env.PATCH_WORKSPACE_SSH_TARGET?.trim() ||
    undefined;
  if (!sshTarget) {
    return undefined;
  }
  const remoteCwd = target.remoteCwd?.trim() ||
    envValue(env, target.remoteCwdEnv) ||
    env.PATCH_WORKSPACE_REMOTE_CWD?.trim() ||
    undefined;
  return {
    sshTarget,
    ...(remoteCwd ? { remoteCwd } : {}),
  };
}

function envValue(env: Record<string, string | undefined>, name: string | undefined): string | undefined {
  return name?.trim() ? env[name.trim()]?.trim() || undefined : undefined;
}

function isWebSocketUrl(url: string): boolean {
  return url.startsWith("ws://") || url.startsWith("wss://");
}

function localAppServerAllowed(
  config: WorkspaceBackendConfig,
  env: Record<string, string | undefined>,
): boolean {
  return config.allowLocal === true || booleanEnv(env.PATCH_ALLOW_LOCAL_APP_SERVER);
}

function booleanEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
