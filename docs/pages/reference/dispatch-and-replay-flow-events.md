---
title: Flow event retry and replay
description: Reference for local or workspace backend execution and retrying stored update triggers.
---

# Flow Event Retry And Replay

Patch creates deterministic event ids:

```text
patch:<sourceId>:<entryId>:<eventType>
```

Dispatch is idempotent at the workspace backend flow capability by event id.
Replay intentionally asks that capability to create another attempt for the
stored event.

For patch-stack maintenance, treat the event as an update trigger. The
authoritative patch state still comes from Git when the local workspace or forge
runner runs.

## Select a workspace backend

```bash
PATCH_WORKSPACE_BACKEND_URL=http://127.0.0.1:3586
PATCH_WORKSPACE_BACKEND_SECRET=dev-secret
```

Patch signs HTTP workspace dispatches with the shared flow HMAC header when a
secret is configured. The backend URL can be a base URL or `/events` URL.

## Use local dispatch

Leave `PATCH_WORKSPACE_BACKEND_URL`, `PATCH_FLOW_BACKEND_URL`, and
`PATCH_FLOW_DISPATCH_URL` unset. Patch creates a local flow client rooted at the
app working directory and runs matching flows synchronously.

## Retry or replay

```bash
curl -X POST http://127.0.0.1:3000/flow-events/<event-id>/retry
curl -X POST http://127.0.0.1:3000/flow-events/<event-id>/replay
```

`retry` dispatches the stored event again. `replay` calls the configured
workspace backend replay operation when a backend URL is configured, or
dispatches locally when no backend URL is configured.

Each retry or replay writes a maintenance attempt record:

```bash
curl http://127.0.0.1:3000/maintenance-attempts?eventId=<event-id>
```

After the workspace run finishes, sync the attempt to record the final
maintenance outcome and any candidate refs reported by the flow:

```bash
curl -X POST http://127.0.0.1:3000/maintenance-attempts/<attempt-id>/sync
```

Use workspace inspection endpoints to read backend-owned run state:

```bash
curl http://127.0.0.1:3000/workspace-runs?eventId=<event-id>
curl http://127.0.0.1:3000/workspace-events/<event-id>
```

Retrying or replaying an event should not rewrite patch branches by itself. The
workspace or flow package decides whether to push candidate refs after it checks
the current Git state.
