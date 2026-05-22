---
title: Environment
description: Runtime environment variables used by patch.moi.
---

# Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Server bind host. |
| `PORT` | `3000` | Server port. |
| `DATA_DIR` | `./data` | Directory for JSONL state files. |
| `FEED_SOURCES_PATH` | unset | Enables feed polling from the configured JSON file. |
| `PATCH_ADMIN_TOKEN` | unset | Protects admin flow endpoints when set. |
| `PATCH_WORKSPACE_BACKEND_URL` | unset | Preferred workspace backend URL for execution; accepts an HTTP base URL, `/events` URL, or workspace WebSocket URL. |
| `PATCH_WORKSPACE_BACKEND_SECRET` | unset | HMAC secret for HTTP workspace flow dispatch. |
| `PATCH_FLOW_BACKEND_URL` | unset | Legacy workspace flow HTTP surface URL fallback. |
| `PATCH_FLOW_DISPATCH_URL` | unset | Legacy or explicit flow dispatch URL fallback. |
| `PATCH_FLOW_DISPATCH_SECRET` | unset | Legacy HMAC secret fallback. |
| `PATCH_MOI_PATCH_REPO` | unset | Optional default Git checkout path for patch inspection, rebuild, and setup commands. |
| `PATCH_MOI_UPSTREAM_URL` | unset | Optional default upstream remote URL for `patch.moi setup fork`. |
| `CODEX_WORKSPACE_MODE` | unset | Set to `actions` to use codex-flows Actions/local flow state when no workspace backend URL is configured. |
| `GITHUB_ACTIONS` | unset | When `true`, also selects the Actions/local no-backend flow surface. |
| `CODEX_FLOWS_MODE` | unset | Set to `code-mode` when Code Mode flow steps should run. |
| `CODEX_FLOWS_ENABLE_CODE_MODE` | unset | Legacy narrow gate accepted by Code Mode flow steps. |
| `CODEX_APP_SERVER_CODEX_COMMAND` | unset | Passed to local code-mode flow execution. |
| `CODEX_HOME` | unset | Passed to local code-mode flow execution. |

Feed target fields can override backend settings with `workspaceUrl`,
`workspaceUrlEnv`, and `workspaceSecretEnv`. Older `dispatchUrl`,
`dispatchUrlEnv`, and `dispatchSecretEnv` fields remain accepted.

Git topology is intentionally not represented here. Local mode should read
upstream, fork, branch, and tag state from Git. Service mode should read remote
repository, branch, workflow, and review state from the forge. Environment
variables should stay limited to runtime concerns such as workspace backend
URLs, data directories, workspace mode, and Codex execution settings.
