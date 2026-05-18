---
title: Dispatch a Codex release flow
description: Connect the OpenAI Codex release feed to a Codex patch-stack maintenance workspace.
---

# Dispatch a Codex release flow

This tutorial connects upstream OpenAI Codex releases to Codex fork
maintenance. Patch records the upstream release and dispatches a deterministic
event. The receiving workspace or runner rebases the maintained patch stack
onto the upstream release tag and verifies the candidate.

## 1. Use the release source

The bundled `apps/patch/feed-sources.json` includes
`github-openai-codex-releases`. Its target emits `upstream.release` events with
the upstream repository and release tag in the payload.

The maintained Codex fork should still be modeled in Git. In the neighboring
`../codex` checkout, `origin` is `https://github.com/peezy-tech/codex` and
`code-mode-exec-hooks` is the maintained patch branch.

Before running release maintenance, make sure the checkout has a canonical
upstream remote:

```bash
cd ../codex
git remote get-url upstream || git remote add upstream https://github.com/openai/codex.git
git fetch upstream --tags --prune
git fetch origin --prune
git status --short --branch
```

If `git status` shows local changes or untracked files, resolve them before an
automated rebase.

## 2. Install the Codex release capabilities

The Codex release maintenance capabilities are installed from the neighboring
`../codex-flows` pack into `.codex/flows`:

```bash
codex-flows pack add ../codex-flows \
  --include openai-codex-bindings \
  --include peezy-codex-fork \
  --apply
codex-flows pack doctor --json
```

The current local install pins `openai-codex-bindings` and `peezy-codex-fork`
in `.codex/pack-lock.json`. The codex-flows runtime discovers installed
`.codex/flows/*` before source-owned `flows/*`, so the installed Codex
capabilities are visible to patch.moi while the harness remains a source-owned
repo flow.

Safe local verification stops at event matching and runner gating. The test
suite confirms that a stored `upstream.release` event for `openai/codex`
selects both installed Codex release steps, and that the Code Mode step still
requires `CODEX_FLOWS_MODE=code-mode`. Do not fabricate a full
`openai/codex` release lifecycle just to exercise the flow.

You can run the same safe match check through the CLI:

```bash
bun run patch.moi -- run codex-release --tag rust-v0.130.0 --dry-run
```

## 3. Pick an execution surface

Patch does not require a Codex workspace backend to be running in this checkout.
For CI-style no-backend maintenance, select the codex-flows Actions/local
surface:

```bash
CODEX_WORKSPACE_MODE=actions \
DATA_DIR=./data \
bun run patch.moi -- run codex-release --tag rust-v0.130.0
```

That writes flow run state under `.codex/workspace/actions/flow-client` and
patch.moi product state under `DATA_DIR`.

For a service or host-owned execution surface, point Patch at a workspace
backend:

```bash
PATCH_WORKSPACE_BACKEND_URL=http://127.0.0.1:3586 \
PATCH_WORKSPACE_BACKEND_SECRET=dev-secret \
DATA_DIR=./data \
FEED_SOURCES_PATH=./feed-sources.json \
bun run --filter @peezy.tech/patch start
```

`PATCH_WORKSPACE_BACKEND_URL` can point at the Codex workspace backend base URL
or its `/events` endpoint. Patch normalizes either HTTP form before calling the
workspace flow capability. `PATCH_FLOW_BACKEND_URL` and
`PATCH_FLOW_DISPATCH_URL` remain accepted for older feed targets.

Leave `PATCH_WORKSPACE_BACKEND_URL` unset only when you intentionally want local
or Actions/local flow execution from the Patch process working directory.

## 4. Inspect the stored event

```bash
curl http://127.0.0.1:3000/flow-events
```

When `PATCH_ADMIN_TOKEN` is set, include either `Authorization: Bearer <token>`
or `X-Patch-Admin-Token: <token>`.

## 5. Keep completion workspace-owned, state app-owned

Patch dispatches the generic event. The installed Codex release flow or
workspace owns the work that happens next:

- fetch upstream tags
- resolve the release tag
- rebase the maintained patch branch
- collect conflict context when the rebase stops
- run the configured checks
- optionally push a candidate ref

Patch remains responsible for maintenance-attempt state: it stores the dispatch,
can retry or replay the event, and can sync workspace run results back into the
attempt record.

That candidate can be used for an internal build/link workflow before a public
release exists: build the local native binary, place it in the npm wrapper's
vendor layout, and link the package with Bun. Public npm publishing should stay
a separate channel because it may need GitHub Actions, trusted publishing,
release review, and upstream schedule alignment.

For the current Codex fork, public release is the `rust-v*` tag workflow that
publishes the `@peezy.tech/*` npm packages.

In service mode, patch.moi should trigger this work through the remote forge
instead of depending on a persistent local checkout. The service creates or
updates a maintenance branch, starts a runner workflow, and records the PR,
issue, check, artifact, or candidate ref that the runner produces.
