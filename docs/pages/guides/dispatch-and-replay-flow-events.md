---
title: Dispatch and replay flow events
description: Use local or HTTP flow execution and retry stored events.
---

# Dispatch and replay flow events

Patch creates deterministic event ids:

```text
patch:<sourceId>:<entryId>:<eventType>
```

Dispatch is idempotent at the flow backend by event id. Replay intentionally
asks the backend to create another attempt for the stored event.

## Select HTTP dispatch

```bash
PATCH_FLOW_DISPATCH_URL=http://127.0.0.1:7345/events
PATCH_FLOW_DISPATCH_SECRET=dev-secret
```

Patch signs HTTP dispatches with the shared flow HMAC header when a secret is
configured.

## Use local dispatch

Leave `PATCH_FLOW_DISPATCH_URL` unset. Patch creates a local flow client rooted
at the app working directory and runs matching flows synchronously.

## Retry or replay

```bash
curl -X POST http://127.0.0.1:3000/flow-events/<event-id>/retry
curl -X POST http://127.0.0.1:3000/flow-events/<event-id>/replay
```

`retry` dispatches the stored event again. `replay` calls the backend replay
endpoint when HTTP mode is configured, or dispatches locally when no backend URL
is configured.
