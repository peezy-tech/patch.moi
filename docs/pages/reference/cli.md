---
title: CLI
description: Local patch.moi commands for setup, maintenance runs, status, retry, replay, and sync.
---

# CLI

Run the CLI from the repository root:

```bash
bun run patch.moi -- status
```

By default, the CLI writes and reads patch.moi product state under `DATA_DIR`
relative to the workspace root. Use `--data-dir` to point at another JSONL
state directory and `--json` for machine-readable output.

## Setup

Inspect the neighboring Codex fork checkout:

```bash
bun run patch.moi -- setup codex --json
```

Add the canonical OpenAI upstream remote when it is missing:

```bash
bun run patch.moi -- setup codex --apply
```

The setup command reports the current branch, `origin`, `upstream`, worktree
cleanliness, and whether the checkout is ready for an automated maintenance
run. It does not clean local changes.

## Run Maintenance

Dispatch the harness release fixture through the patch.moi state path:

```bash
CODEX_FLOW_FETCH=0 CODEX_FLOW_PUSH=0 \
bun run patch.moi -- run harness
```

The command records the flow event, dispatch record, and maintenance attempt
under `DATA_DIR`. If `PATCH_WORKSPACE_BACKEND_URL` is unset, the dispatch uses
local flow execution from the workspace root. If it is set, the dispatch goes to
the configured workspace backend.

Verify Codex release flow matching without executing release work:

```bash
bun run patch.moi -- run codex-release --tag rust-v0.130.0 --dry-run
```

Dispatching the Codex release task requires an explicit execution surface. Use
Actions/local mode when no workspace backend is running:

```bash
CODEX_WORKSPACE_MODE=actions \
bun run patch.moi -- run codex-release --tag rust-v0.130.0
```

Or point at a workspace backend:

```bash
PATCH_WORKSPACE_BACKEND_URL=ws://127.0.0.1:3586 \
bun run patch.moi -- run codex-release --tag rust-v0.130.0
```

Use `--allow-local` only when you intentionally want the local Patch process to
execute matching Codex release flows. The Code Mode step still requires its own
`CODEX_FLOWS_MODE=code-mode` gate.

## Status

Read patch.moi-owned state:

```bash
bun run patch.moi -- status
bun run patch.moi -- events --type upstream.release
bun run patch.moi -- dispatches --status failed
bun run patch.moi -- attempts --status needs_intervention
```

These commands inspect JSONL state. They do not reach into Git or a workspace
backend unless a command explicitly dispatches, replays, or syncs.

## Retry, Replay, And Sync

Retry dispatch transport failures:

```bash
bun run patch.moi -- retry '<event-id>'
```

Replay an accepted event to create another backend attempt:

```bash
bun run patch.moi -- replay '<event-id>'
```

Sync the latest workspace run outcome and candidate refs into the patch.moi
maintenance attempt:

```bash
bun run patch.moi -- sync '<attempt-id>'
```

Retry and replay append new dispatch and maintenance-attempt records. Sync
appends a newer record for the same attempt id when backend run state changes.
