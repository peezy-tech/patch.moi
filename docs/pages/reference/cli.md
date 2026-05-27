---
title: CLI
description: Local patch.moi commands for setup, feature work, patch runs, status, retry, replay, and sync.
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

Inspect a maintained fork checkout:

```bash
bun run patch.moi -- setup fork \
  --repo ../project-fork \
  --upstream-url https://example.com/upstream/project.git \
  --json
```

Add the canonical upstream remote when it is missing:

```bash
bun run patch.moi -- setup fork \
  --repo ../project-fork \
  --upstream-url https://example.com/upstream/project.git \
  --apply
```

The setup command reports the current branch, `origin`, `upstream`, worktree
cleanliness, and whether the checkout is ready for automated patch work. It
does not clean local changes.

## Patch Work

Start feature work and optionally create its branch:

```bash
bun run patch.moi -- work start feature \
  --title "Add native replay" \
  --repo ../project-fork \
  --branch feature/native-replay \
  --base main \
  --patch-branch patch/020-native-replay \
  --create-branch
```

List, inspect, and update work records:

```bash
bun run patch.moi -- work list --kind feature
bun run patch.moi -- work show '<work-id>'
bun run patch.moi -- work set-status '<work-id>' --status review
```

## Patch Branches

Patch branch commands operate on a local fork workspace. They do not push.

Inspect whether a fork workspace has the expected `main`, `upstream`, and
`patch/*` branches:

```bash
bun run patch.moi -- patch doctor --repo ../project-fork --json
```

List ordered local patch branches:

```bash
bun run patch.moi -- patch list --repo ../project-fork
```

Capture a feature branch as a single patch branch commit:

```bash
bun run patch.moi -- patch capture patch/010-packaging-build \
  --repo ../project-fork \
  --from packaging-work \
  --base main \
  --message "patch: packaging and release build" \
  --work-id '<work-id>'
```

Rebuild the maintained `main` branch from `upstream` plus all ordered
`patch/*` branch tips:

```bash
bun run patch.moi -- patch rebuild --repo ../project-fork --base upstream --to main
```

If a cherry-pick conflicts, rebuild stops with `needs_intervention` and leaves
the checkout in the conflicted state for the operator or a Code Mode turn.

## Run Patch Work

Dispatch the harness release fixture through the patch.moi state path:

```bash
bun run patch.moi -- run harness --allow-local
```

The command records the automation event, patch work, dispatch record, and patch
attempt under `DATA_DIR`. Upstream, downstream, and arbitrary event dispatches
require one explicit execution surface: `PATCH_WORKSPACE_BACKEND_URL`,
`PATCH_WORKSPACE_SSH_TARGET`, `--allow-local`, or
`PATCH_ALLOW_LOCAL_APP_SERVER=1`.

Verify upstream release flow matching without executing release work:

```bash
bun run patch.moi -- run upstream-release \
  --repo owner/project \
  --tag v1.2.3 \
  --dry-run
```

Verify upstream branch update matching without executing patch work:

```bash
bun run patch.moi -- run upstream-branch \
  --repo owner/project \
  --sha '<upstream-main-sha>' \
  --dry-run
```

Verify a downstream package release without executing fork packaging:

```bash
bun run patch.moi -- run downstream-release \
  --package @scope/package \
  --version 1.2.3 \
  --repo owner/project \
  --dry-run
```

Dispatching an upstream release task requires an explicit execution surface. Use
the local app-server surface with `--allow-local` only for intentional
no-backend runs:

```bash
bun run patch.moi -- run upstream-release --repo owner/project --tag v1.2.3 --allow-local
```

Or point at a workspace backend:

```bash
PATCH_WORKSPACE_BACKEND_URL=ws://127.0.0.1:3586 \
bun run patch.moi -- run upstream-release --repo owner/project --tag v1.2.3
```

Or target a remote checkout through SSH:

```bash
PATCH_WORKSPACE_SSH_TARGET=devbox \
PATCH_WORKSPACE_REMOTE_CWD=/srv/project-fork \
bun run patch.moi -- run upstream-release --repo owner/project --tag v1.2.3
```

Use `--allow-local` only when you intentionally want the local Patch process to
execute matching workspace automations.

## Status

Read patch.moi-owned state:

```bash
bun run patch.moi -- status
bun run patch.moi -- events --type upstream.release
bun run patch.moi -- events --type downstream.release
bun run patch.moi -- work list --kind feature
bun run patch.moi -- work list --kind maintenance
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
patch attempt:

```bash
bun run patch.moi -- sync '<attempt-id>'
```

Retry and replay append new dispatch and patch-attempt records. Sync
appends a newer record for the same attempt id when backend run state changes.
