---
title: Watch an upstream release
description: Configure a release feed and turn an upstream release into patch maintenance input.
---

# Watch an upstream release

This tutorial creates the smallest useful patch.moi intake: one upstream release
feed that becomes a stored update signal. That signal can later start a Codex
workspace that rebases a patch stack.

Before configuring the feed, make sure the maintained repository has a Git
source of truth:

```bash
git remote get-url upstream
git remote get-url origin
git status --short --branch
```

## 1. Add a feed source

Create or edit `apps/patch/feed-sources.json`:

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
        "mode": "flow_dispatch",
        "eventType": "upstream.release",
        "dispatchUrlEnv": "PATCH_FLOW_DISPATCH_URL",
        "dispatchSecretEnv": "PATCH_FLOW_DISPATCH_SECRET",
        "payload": {
          "provider": "github",
          "repo": "openai/codex"
        }
      }
    }
  ]
}
```

The target emits a generic `upstream.release` event. The event is a trigger for
patch work; the patch commits still live in the maintained Git repository.

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
- `data/flow-events.jsonl` for the generic flow event.
- `data/flow-dispatches.jsonl` for the dispatch outcome.

If `PATCH_FLOW_DISPATCH_URL` is not set, Patch uses local flow execution from
the working directory. If it is set, Patch sends the event to the HTTP backend.

## 4. Connect patch work

A matching codex-flow package or backend workspace can consume the
`upstream.release` event and run the maintenance loop:

1. fetch upstream tags
2. resolve the release tag
3. rebase or replay patch commits
4. stop for conflicts or failing checks
5. push a candidate branch or tag when policy allows

Internal builds and public release jobs can then consume the candidate ref
independently.
