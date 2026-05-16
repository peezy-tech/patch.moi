---
title: Watch an upstream release
description: Configure a release feed and store the first Patch flow event.
---

# Watch an upstream release

This tutorial creates the smallest useful release watcher: one upstream release
feed that becomes a stored `upstream.release` flow event.

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

## 2. Start Patch

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
