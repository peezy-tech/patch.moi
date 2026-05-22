---
title: Maintain a fork
description: Operator runbook for dispatching, inspecting, and finishing patch.moi fork maintenance work.
---

# Maintain a fork

Use this runbook when an upstream release or branch movement needs to become a
maintained fork candidate. patch.moi records the event and attempt state.
codex-flows and the selected execution surface do the checkout, rebase,
verification, and optional push.

The safest default is Actions/local mode with pushes disabled. That does not
require a workspace backend to be running beside patch.moi.

## 1. Pick the state directory

Use one durable `DATA_DIR` per patch.moi environment:

```bash
export DATA_DIR=/var/lib/patch.moi/data
```

For a local rehearsal, a temporary directory is fine:

```bash
export DATA_DIR="$(mktemp -d)"
```

patch.moi product state goes under `DATA_DIR`. codex-flows Actions/local run
state goes under `.codex/workspace/actions/flow-client` in the workspace root.

## 2. Select the execution surface

For no-backend operation:

```bash
export CODEX_WORKSPACE_MODE=actions
unset PATCH_WORKSPACE_BACKEND_URL
```

For an explicit workspace backend:

```bash
export PATCH_WORKSPACE_BACKEND_URL=http://127.0.0.1:3586
export PATCH_WORKSPACE_BACKEND_SECRET=dev-secret
```

Do not set both unless you are intentionally testing precedence. A configured
workspace backend URL wins over Actions/local mode.

## 3. Keep the first run non-pushing

Leave destructive or externally visible operations off until the candidate is
understood:

```bash
export CODEX_FLOW_PUSH=0
export CODEX_FLOW_PUBLISH=0
```

Flow package defaults should also keep pushes and publishing off, but exporting
the flags makes the operator intent explicit. For harness-only local rehearsals
you can also disable network fetches:

```bash
export CODEX_FLOW_FETCH=0
```

Do not use `CODEX_FLOW_FETCH=0` for a real upstream release unless the runner
already has the release tag and upstream refs.

## 4. Verify matching before dispatch

Before dispatching automation, inspect the fork workspace branch shape:

```bash
bun run patch.moi -- patch doctor --repo ../codex
bun run patch.moi -- patch list --repo ../codex
```

For the Git-native patch model, `main` is the rebuildable maintained fork,
`upstream` follows the canonical upstream branch, and ordered `patch/*` branches
hold the logical patch commits. To rebuild the maintained branch locally:

```bash
bun run patch.moi -- patch rebuild --repo ../codex --base upstream --to main
```

Dry-run the release event. This records nothing and runs no maintenance work:

```bash
bun run patch.moi -- run upstream-release \
  --repo openai/codex \
  --tag rust-v0.130.0 \
  --dry-run \
  --json
```

The output should show the flow steps that will receive the event. For the
private Codex workspace, the expected fanout is the bindings update flow and
the Codex fork release-cycle flow. Product workspaces should pass the repo and
tag explicitly; patch.moi does not carry private release lookup policy.

When a Peezy downstream package release needs to refresh the codex-flows fork
release candidate, dry-run the downstream release event:

```bash
bun run patch.moi -- run downstream-release \
  --package @peezy.tech/codex \
  --version 0.130.0 \
  --repo peezy-tech/codex \
  --dry-run
```

That event should match the `peezy-codex-flows-fork/release-fork` Bun step. The
same flow also accepts `@peezy.tech/codex-flows` releases.

Dry-run the upstream main branch update path separately:

```bash
bun run patch.moi -- run upstream-branch \
  --repo openai/codex \
  --sha '<upstream-main-sha>' \
  --dry-run \
  --json
```

That event should match the Codex fork `main-branch-update` Bun step.

## 5. Dispatch the maintenance attempt

Dispatch with Actions/local and pushes still disabled:

```bash
CODEX_WORKSPACE_MODE=actions \
CODEX_FLOW_PUSH=0 \
CODEX_FLOW_PUBLISH=0 \
bun run patch.moi -- run upstream-release \
  --repo openai/codex \
  --tag rust-v0.130.0 \
  --json
```

patch.moi writes:

- `flow-events.jsonl` for the normalized upstream event
- `workspace-dispatches.jsonl` for the dispatch result
- `maintenance-attempts.jsonl` for the attempt record

codex-flows writes the execution run state under `.codex/workspace/actions`.
The Codex fork maintenance step is a deterministic Bun step; it does not need
the Code Mode runner gate.

## 6. Inspect the result

Start with patch.moi state:

```bash
bun run patch.moi -- status --json
bun run patch.moi -- attempts --json
bun run patch.moi -- dispatches --json
```

Filter to the records that need attention:

```bash
bun run patch.moi -- attempts --status needs_intervention
bun run patch.moi -- dispatches --status failed
```

For Actions/local execution details, inspect the codex-flows state directory:

```bash
find .codex/workspace/actions/flow-client -maxdepth 2 -type f | sort
```

For a workspace backend run, use `sync` after the backend has a terminal run
state:

```bash
bun run patch.moi -- sync '<attempt-id>' --json
```

`sync` copies the final status, message, and candidate refs from workspace run
state into patch.moi's maintenance attempt record.

## 7. Retry or replay when needed

Retry a transport failure for the same event:

```bash
bun run patch.moi -- retry '<event-id>' --json
```

Replay an accepted event when the flow package or execution surface changed and
you want a fresh attempt:

```bash
bun run patch.moi -- replay '<event-id>' --json
```

Retry and replay append new records. They do not mutate old JSONL entries.

## 8. Enable pushing only after review

Only enable pushing on a runner that is allowed to update the maintained fork:

```bash
CODEX_WORKSPACE_MODE=actions \
CODEX_FLOW_PUSH=1 \
CODEX_FLOW_PUBLISH=0 \
bun run patch.moi -- replay '<event-id>' --json
```

Flow packages decide exactly what `CODEX_FLOW_PUSH=1` means. The harness flow
pushes configured branch refs with `--force-with-lease`. The Codex fork flow
pushes the maintained `main` branch and, when configured to publish, release
tags.

Keep `CODEX_FLOW_PUBLISH=0` unless you are intentionally entering the public
release channel.

## 9. Leave durable state in Git and the forge

Treat runner checkouts as disposable. The durable outputs are:

- patch.moi JSONL state under `DATA_DIR`
- candidate branches, tags, pull requests, checks, and artifacts in the forge
- flow run state under the selected codex-flows workspace mode
- release-channel records when a candidate is published or deployed

If a checkout disappears, patch.moi should still be able to replay the event or
link the attempt to the candidate refs that were already pushed.
