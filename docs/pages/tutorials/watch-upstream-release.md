---
title: Watch an upstream release
description: Configure a release feed and turn an upstream release into patch-work input.
---

# Watch an upstream release

This tutorial creates the smallest useful patch.moi service path: one upstream
release feed becomes a stored update signal, deterministic automation event,
patch work record, workspace dispatch, and patch attempt record. The patch application work
still happens in a local workspace, workspace backend, or forge runner.

Before configuring the feed, make sure the maintained repository has a Git
source of truth:

```bash
git remote get-url upstream
git remote get-url origin
git status --short --branch
```

## 1. Add a feed source

Create or edit a workspace-owned feed file, for example
`feed-sources.json` in the workspace that uses patch.moi:

```json
{
  "sources": [
    {
      "id": "github-openai-codex-releases",
      "provider": "github",
      "url": "https://github.com/openai/codex/releases.atom",
      "event": "release",
      "repo": {
        "owner": "openai",
        "name": "codex",
        "fullName": "openai/codex",
        "webUrl": "https://github.com/openai/codex",
        "defaultBranch": "main"
      },
      "target": {
        "mode": "workspace_automation",
        "eventType": "upstream.release",
        "workspaceUrlEnv": "PATCH_WORKSPACE_BACKEND_URL",
        "automations": ["patch-moi-harness-fork"],
        "payload": {
          "provider": "github",
          "repo": "openai/codex"
        }
      }
    }
  ]
}
```

The target emits a generic `upstream.release` event with a patch.moi-generated
id. The event is a trigger for patch work; the patch commits still live in the
maintained Git repository.

## 2. Start patch.moi

```bash
DATA_DIR=./data \
FEED_SOURCES_PATH=./feed-sources.json \
bun run --filter @peezy.tech/patch dev
```

The first poll primes `data/feed-state.json`. By default, old feed entries are
not emitted on that first pass.

## 3. Dispatch new releases

When the feed later contains an unseen release entry, Patch appends:

- `data/feed-events.jsonl` for the normalized signal.
- `data/automation-events.jsonl` for the generic automation event.
- `data/patch-work.jsonl` for the patch work record.
- `data/patch-attempts.jsonl` for the patch.moi patch attempt and
  later candidate refs.
- `data/workspace-dispatches.jsonl` for the workspace dispatch outcome.

If `PATCH_WORKSPACE_BACKEND_URL` is set, Patch sends the event to that local
workspace backend's turn automation host. If `PATCH_WORKSPACE_SSH_TARGET` is
set, Patch uses the Codex Flows SSH remote agent and optional
`PATCH_WORKSPACE_REMOTE_CWD`. If neither is set, use
`PATCH_ALLOW_LOCAL_APP_SERVER=1` only for intentional local app-server execution
from the working directory. Old flow dispatch URL fallbacks are no longer
accepted.

## 4. Connect patch work

A matching named automation can consume the `upstream.release` event and run the
maintenance loop:

1. fetch upstream tags
2. resolve the release tag
3. rebase or replay patch commits
4. stop for conflicts or failing checks
5. push a candidate branch or tag when policy allows

Internal builds and public release jobs can then consume the candidate ref
independently.

For a local rehearsal before wiring feed intake, use the harness tutorial. It
shows both the direct `bun run harness:automation` path and the repo-native
`bun run workspace:run:harness` path.
