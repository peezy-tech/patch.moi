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
| `PATCH_ADMIN_TOKEN` | unset | Protects admin automation endpoints when set. |
| `PATCH_WORKSPACE_BACKEND_URL` | unset | Workspace backend WebSocket URL used as the turn host. |
| `PATCH_AUTOMATIONS` | unset | Comma-separated default automation names for manual dispatch and replay. |
| `PATCH_MOI_PATCH_REPO` | unset | Optional default Git checkout path for patch inspection, rebuild, and setup commands. |
| `PATCH_MOI_UPSTREAM_URL` | unset | Optional default upstream remote URL for `patch.moi setup fork`. |
| `CODEX_APP_SERVER_CODEX_COMMAND` | unset | Passed to local app-server execution. |
| `CODEX_HOME` | unset | Passed to local app-server execution. |

Feed target fields can override backend settings with `workspaceUrl`,
`workspaceUrlEnv`.

Git topology is intentionally not represented here. Local mode should read
upstream, fork, branch, and tag state from Git. Service mode should read remote
repository, branch, workflow, and review state from the forge. Environment
variables should stay limited to runtime concerns such as workspace backend
URLs, data directories, workspace mode, and Codex execution settings.
