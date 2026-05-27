---
title: Dispatch a Codex release automation
description: Connect the OpenAI Codex release feed to a Codex patch-stack maintenance workspace.
---

# Dispatch a Codex release automation

This tutorial connects upstream OpenAI Codex releases to Codex fork
maintenance. Patch records the upstream release and dispatches a deterministic
event. The receiving workspace or runner rebuilds the maintained `main` branch
from the upstream release tag plus the ordered `patch/*` branches, then
verifies the candidate.

## 1. Use a workspace-owned release source

The patch.moi product repo does not bundle the private Codex feed source. Put a
`github-openai-codex-releases` source in the workspace repo that owns the
installed Codex maintenance automations. Its target should emit `upstream.release`
events with the upstream repository and release tag in the payload.

The maintained Codex fork should still be modeled in Git. In the neighboring
`../codex` checkout, `origin` is `https://github.com/peezy-tech/codex` and
the local branch shape is:

```text
main        rebuildable maintained fork output
upstream    local mirror of upstream/main
patch/*     ordered one-commit logical patches
```

Before running release maintenance, make sure the checkout has a canonical
upstream remote:

```bash
cd ../codex
git remote get-url upstream || git remote add upstream https://github.com/openai/codex.git
git fetch upstream --tags --prune main
git fetch origin --prune
git status --short --branch
```

If `git status` shows local changes or untracked files, resolve them before an
automated rebuild.

## 2. Install the Codex release capabilities in the workspace

The Codex release maintenance capabilities should be installed in the workspace
repo that uses patch.moi. In a meta-workspace where `codex-flows/` and
`patch.moi/` are sibling checkouts, run this from the workspace root:

```bash
codex-flows automation list
```

The workspace install pins `openai-codex-bindings`, `peezy-codex-fork`, and
`openai-codex-bindings`, `peezy-codex-fork`, and
`peezy-codex-flows-fork` should be visible from the workspace root. The
codex-flows runtime discovers installed `.codex/automations/*` before
source-owned `automations/*`, so the installed Codex capabilities are visible
when patch.moi is run with the workspace root while the harness remains
source-owned inside the patch.moi product repo.

Safe local verification stops at event matching and runner gating. The test
suite confirms that a stored `upstream.release` event for `openai/codex`
selects the installed release automations. Do not fabricate a full
`openai/codex` release lifecycle just to exercise the automation.

You can run the same safe match check through the CLI:

```bash
bun run --cwd patch.moi patch.moi -- run upstream-release \
  --workspace-root /home/peezy/meta-workspace \
  --repo openai/codex \
  --tag rust-v0.130.0 \
  --dry-run
```

## 3. Pick an execution surface

Patch does not require a Codex workspace backend to be running in this checkout.
For an intentional no-backend rehearsal, select the local app-server surface and
allow local execution:

```bash
DATA_DIR=./data \
bun run --cwd patch.moi patch.moi -- run upstream-release \
  --workspace-root /home/peezy/meta-workspace \
  --repo openai/codex \
  --tag rust-v0.130.0 \
  --allow-local
```

That writes patch.moi product state under `DATA_DIR` and uses the local
app-server surface from the active `CODEX_HOME`.

For a persistent local host-owned execution surface, create a Codex Flows
backend profile and point Patch at its local WebSocket URL:

```bash
codex-flows workspace backend init local --global --profile codex-maintenance --workspace-root /home/peezy/meta-workspace
codex-flows workspace backend service install --profile codex-maintenance
```

```bash
PATCH_WORKSPACE_BACKEND_URL=ws://127.0.0.1:3586 \
DATA_DIR=./data \
FEED_SOURCES_PATH=../feed-sources.json \
bun run --cwd patch.moi start
```

For a remote checkout, use SSH instead of exposing a backend port:

```bash
PATCH_WORKSPACE_SSH_TARGET=codex-runner \
PATCH_WORKSPACE_REMOTE_CWD=/srv/meta-workspace \
DATA_DIR=./data \
FEED_SOURCES_PATH=../feed-sources.json \
bun run --cwd patch.moi start
```

Leave `PATCH_WORKSPACE_BACKEND_URL` and `PATCH_WORKSPACE_SSH_TARGET` unset only
when you intentionally allow local app-server execution from the Patch process
working directory with `--allow-local` or `PATCH_ALLOW_LOCAL_APP_SERVER=1`.

## 4. Inspect the stored event

```bash
curl http://127.0.0.1:3000/automation-events
```

When `PATCH_ADMIN_TOKEN` is set, include either `Authorization: Bearer <token>`
or `X-Patch-Admin-Token: <token>`.

## 5. Keep completion workspace-owned, state app-owned

Patch dispatches the generic event. The installed Codex release automation or
workspace owns the work that happens next:

- fetch upstream main and tags
- resolve the release tag
- rebuild `main` from the release tag plus ordered `patch/*` branches
- collect conflict context when a cherry-pick stops
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
