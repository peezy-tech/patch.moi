import { describe, expect, test } from "bun:test";
import {
  createAutomationHostBackend,
  selectWorkspaceExecution,
  targetWorkspaceBackendUrl,
} from "../src/workspace-backend";

describe("workspace execution selection", () => {
  test("uses a local app-server when no remote surface is configured", () => {
    expect(selectWorkspaceExecution({}, { env: {} })).toEqual({
      target: "local",
      transport: "app-server",
    });
  });

  test("uses a local workspace backend WebSocket URL when configured", () => {
    expect(selectWorkspaceExecution({}, {
      env: { PATCH_WORKSPACE_BACKEND_URL: "ws://127.0.0.1:3586" },
    })).toEqual({
      target: "workspace-backend",
      transport: "workspace-ws",
      workspaceBackendUrl: "ws://127.0.0.1:3586",
    });
  });

  test("uses an SSH remote agent when configured", () => {
    expect(selectWorkspaceExecution({}, {
      env: {
        PATCH_WORKSPACE_SSH_TARGET: "devbox",
        PATCH_WORKSPACE_REMOTE_CWD: "/srv/codex",
      },
    })).toEqual({
      target: "ssh",
      transport: "ssh-remote-agent",
      sshTarget: "devbox",
      remoteCwd: "/srv/codex",
    });
  });

  test("lets feed targets point at env-selected backend and SSH surfaces", () => {
    expect(targetWorkspaceBackendUrl({
      workspaceUrlEnv: "PATCH_TEST_BACKEND",
    }, {
      PATCH_TEST_BACKEND: "ws://127.0.0.1:4599",
    })).toBe("ws://127.0.0.1:4599");

    expect(selectWorkspaceExecution({
      sshTargetEnv: "PATCH_TEST_SSH",
      remoteCwdEnv: "PATCH_TEST_CWD",
    }, {
      env: {
        PATCH_TEST_SSH: "runner",
        PATCH_TEST_CWD: "/work/fork",
      },
    })).toMatchObject({
      transport: "ssh-remote-agent",
      sshTarget: "runner",
      remoteCwd: "/work/fork",
    });
  });

  test("rejects ambiguous or non-WebSocket remote configuration", () => {
    expect(() =>
      selectWorkspaceExecution({}, {
        env: { PATCH_WORKSPACE_BACKEND_URL: "http://127.0.0.1:3586" },
      })
    ).toThrow("requires a WebSocket workspace backend URL");

    expect(() =>
      selectWorkspaceExecution({}, {
        env: {
          PATCH_WORKSPACE_BACKEND_URL: "ws://127.0.0.1:3586",
          PATCH_WORKSPACE_SSH_TARGET: "devbox",
        },
      })
    ).toThrow("cannot set both");
  });

  test("requires an explicit opt-in for local app-server dispatch", async () => {
    await expect(createAutomationHostBackend({}, { env: {} }))
      .rejects.toThrow("local app-server dispatch requires");
  });
});
