---
title: Maintain a fork
description: Operator runbook for dispatching, inspecting, and finishing patch.moi fork maintenance work.
---

# Maintain a fork

Use this runbook when an upstream release or branch movement needs to become a
maintained fork candidate. patch.moi records the event and attempt state.
codex-flows and the selected execution surface do the checkout, rebase,
verification, and optional push.

The safest default is an explicit local rehearsal with pushes disabled. That
does not require a workspace backend to be running beside patch.moi.

## 1. Pick the state directory

Use one durable `DATA_DIR` per patch.moi environment:

```bash
export DATA_DIR=/var/lib/patch.moi/data
```

For a local rehearsal, a temporary directory is fine:

```bash
export DATA_DIR="$(mktemp -d)"
```

patch.moi product state goes under `DATA_DIR`. Repo-native `codex-flows
workspace` tasks write run state under `.codex/workspace/<mode>` in the
workspace root. Direct patch.moi `--allow-local` dispatches use the local
app-server surface and Codex thread state from the active `CODEX_HOME`.

## 2. Select the execution surface

For no-backend operation, use the local app-server surface and pass
`--allow-local` on the dispatch command:

```bash
unset PATCH_WORKSPACE_BACKEND_URL
unset PATCH_WORKSPACE_SSH_TARGET
```

For an explicit local workspace backend:

```bash
export PATCH_WORKSPACE_BACKEND_URL=ws://127.0.0.1:3586
```

For a remote maintenance checkout, use SSH:

```bash
export PATCH_WORKSPACE_SSH_TARGET=devbox
export PATCH_WORKSPACE_REMOTE_CWD=/srv/codex
```

Do not set both unless you are intentionally testing precedence. A configured
workspace backend URL and an SSH target are mutually exclusive.

## 3. Keep the first run non-pushing

Leave destructive or externally visible operations off until the candidate is
understood. Automation defaults should keep pushes and publishing off. For
harness-only local rehearsals, disable network fetches in the automation config
when the checkout already has the release tag and upstream refs.

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

The output should show the automations that will receive the event. For the
private Codex workspace, the expected fanout is the bindings update automation
and the Codex fork release-cycle automation. Product workspaces should pass the
repo and tag explicitly; patch.moi does not carry private release lookup policy.

When a Peezy downstream package release needs to refresh the codex-flows fork
release candidate, dry-run the downstream release event:

```bash
bun run patch.moi -- run downstream-release \
  --package @peezy.tech/codex \
  --version 0.130.0 \
  --repo peezy-tech/codex \
  --dry-run
```

That event should match the `peezy-codex-flows-fork` automation. The same
automation also accepts `@peezy.tech/codex-flows` releases.

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

Dispatch locally with pushes still disabled:

```bash
bun run patch.moi -- run upstream-release \
  --repo openai/codex \
  --tag rust-v0.130.0 \
  --allow-local \
  --json
```

patch.moi writes:

- `automation-events.jsonl` for the normalized upstream event
- `workspace-dispatches.jsonl` for the dispatch result
- `maintenance-attempts.jsonl` for the attempt record

The Codex fork maintenance automation decides whether it only runs local code or
starts a native Codex turn for follow-up work. Direct local dispatch uses the
active `CODEX_HOME`; repo-native workspace tasks write `.codex/workspace`
state.

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

For repo-native workspace execution details, inspect the codex-flows state
directory:

```bash
find .codex/workspace/actions -maxdepth 3 -type f | sort
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

Replay an accepted event when the automation package or execution surface changed and
you want a fresh attempt:

```bash
bun run patch.moi -- replay '<event-id>' --json
```

Retry and replay append new records. They do not mutate old JSONL entries.

## 8. Enable pushing only after review

Only enable pushing on a runner that is allowed to update the maintained fork:

```bash
PATCH_WORKSPACE_SSH_TARGET=runner \
PATCH_WORKSPACE_REMOTE_CWD=/srv/codex \
bun run patch.moi -- replay '<event-id>' --json
```

Automation scripts decide exactly when candidate refs should be pushed. The
harness automation pushes configured branch refs with `--force-with-lease`. The
Codex fork automation pushes the maintained `main` branch and, when configured
to publish, release tags.

## 9. Leave durable state in Git and the forge

Treat runner checkouts as disposable. The durable outputs are:

- patch.moi JSONL state under `DATA_DIR`
- candidate branches, tags, pull requests, checks, and artifacts in the forge
- automation run state under the selected codex-flows workspace mode
- release-channel records when a candidate is published or deployed

If a checkout disappears, patch.moi should still be able to replay the event or
link the attempt to the candidate refs that were already pushed.
