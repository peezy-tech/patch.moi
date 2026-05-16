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
| `PEEZY_CODEX_REPO` | `../codex` | Optional Codex checkout path for `patch.moi setup codex`. |
| `CODEX_FLOWS_ENABLE_CODE_MODE` | unset | Required by Code Mode flow steps before local Code Mode execution. |
| `CODEX_APP_SERVER_CODEX_COMMAND` | unset | Passed to local code-mode flow execution. |
| `CODEX_HOME` | unset | Passed to local code-mode flow execution. |

Feed target fields can override backend settings with `workspaceUrl`,
`workspaceUrlEnv`, and `workspaceSecretEnv`. Older `dispatchUrl`,
`dispatchUrlEnv`, and `dispatchSecretEnv` fields remain accepted.

Git topology is intentionally not represented here. Local mode should read
upstream, fork, branch, and tag state from Git. Service mode should read remote
repository, branch, workflow, and review state from the forge. Environment
variables should stay limited to runtime concerns such as workspace backend
URLs, data directories, and Codex execution settings.
