---
title: Environment
description: Environment variables understood by patch.moi.
---

# Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PATCH_MOI_PATCH_REPO` | current workspace | Default repo path for CLI and MCP calls. |
| `PATCH_MOI_WORKSPACE_ROOT` | process cwd | Default workspace root for MCP calls. |
| `PATCH_MOI_UPSTREAM_URL` | unset | Default upstream URL for `setup fork`. |
| `PATCH_MOI_ALLOW_FETCH` | unset | Allows `fetch_upstream`. |
| `PATCH_MOI_ALLOW_CAPTURE` | unset | Allows MCP `patch_capture`. |
| `PATCH_MOI_ALLOW_REBUILD` | unset | Allows MCP `patch_rebuild`. |
| `PATCH_MOI_ALLOW_PULL` | unset | Allows `patch pull` and MCP `patch_pull`. |

There is no `DATA_DIR`, `PATCH_MOI_URL`, feed watcher, admin token, workspace
backend URL, or local app-server flag in patch.moi. Runner and thread execution
configuration belongs to codex-flows or the forge.
