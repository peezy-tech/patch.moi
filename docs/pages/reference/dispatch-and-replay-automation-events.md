---
title: Automation event retry and replay
description: Reference for local or workspace backend execution and retrying stored update triggers.
---

# Automation Event Retry And Replay

Patch creates deterministic event ids:

```text
patch:<sourceId>:<entryId>:<eventType>
```

Dispatch records the configured automation attempts for the event id. Replay
intentionally creates another attempt for the stored event.

For patch-stack maintenance, treat the event as an update trigger. The
authoritative patch state still comes from Git when the local workspace or forge
runner runs.

## Select an execution surface

```bash
PATCH_WORKSPACE_BACKEND_URL=ws://127.0.0.1:3586
```

The workspace backend URL is a local or co-located WebSocket URL used as the
turn host for automation scripts. For a persistent local backend, create a
Codex Flows profile and service:

```bash
codex-flows workspace backend init local --global --profile patch-moi --workspace-root /path/to/workspace
codex-flows workspace backend service install --profile patch-moi
```

For remote operation, use SSH instead of exposing a backend port:

```bash
PATCH_WORKSPACE_SSH_TARGET=devbox
PATCH_WORKSPACE_REMOTE_CWD=/srv/patch-workspace
```

## Use local dispatch

Leave both `PATCH_WORKSPACE_BACKEND_URL` and `PATCH_WORKSPACE_SSH_TARGET` unset
only when an operator explicitly allows local app-server execution. CLI runs use
`--allow-local`; service and MCP contexts use `PATCH_ALLOW_LOCAL_APP_SERVER=1`.
Patch runs the configured named automations from the app working directory.

## Retry or replay

```bash
curl -X POST http://127.0.0.1:3000/automation-events/<event-id>/retry
curl -X POST http://127.0.0.1:3000/automation-events/<event-id>/replay
```

`retry` dispatches the stored event again. `replay` creates a fresh automation
attempt for the same stored event.

Each retry or replay writes a maintenance attempt record:

```bash
curl http://127.0.0.1:3000/maintenance-attempts?eventId=<event-id>
```

After the workspace run finishes, sync the attempt to record the final
maintenance outcome and any candidate refs reported by the automation:

```bash
curl -X POST http://127.0.0.1:3000/maintenance-attempts/<attempt-id>/sync
```

Use workspace inspection endpoints to read backend-owned run state:

```bash
curl http://127.0.0.1:3000/workspace-runs?eventId=<event-id>
curl http://127.0.0.1:3000/workspace-events/<event-id>
```

Retrying or replaying an event should not rewrite patch branches by itself. The
workspace automation decides whether to push candidate refs after it checks
the current Git state.
