---
name: "patch-moi:triage-attempt"
description: "Triage patch.moi DATA_DIR events, dispatches, and maintenance attempts before deciding whether retry, replay, sync, or manual Git repair is appropriate."
---

# Triage Attempt

Use this workflow when a patch.moi run is failed, blocked, stale, or unclear.

## Workflow

1. Read local state with `mcp__patch-moi__status`, then narrow with `events`, `dispatches`, and `attempts`.
2. Inspect the associated Git checkout with `git_discover` and `patch_doctor`.
3. If workspace run state may have moved since the last DATA_DIR record, use `sync` only when `PATCH_MOI_ALLOW_SYNC=1` is explicitly present.
4. Use `retry` for a new dispatch attempt after fixing configuration or transient backend issues.
5. Use `replay` only when the original event should be reprocessed with the current automation/runtime behavior.

Mutation tools fail closed unless the matching safety policy or env gate is enabled.
