---
title: Configure feed sources
description: Add upstream feeds and choose notification, fork-sync, or flow targets.
---

# Configure feed sources

Feed sources live in a JSON file referenced by `FEED_SOURCES_PATH`. The bundled
file is `apps/patch/feed-sources.json`.

## Choose an event

Use `event: "push"` for branch commit feeds and `event: "release"` for release
feeds. Patch normalizes both into `FeedSignal` records.

## Choose a target

`notify_only` stores the signal and can notify Discord:

```json
{
  "provider": "github",
  "repoFullName": "peezy-tech/codex",
  "branch": "main",
  "mode": "notify_only"
}
```

`fork_sync` stores a legacy fork-sync job for release entries:

```json
{
  "provider": "jojo",
  "repoFullName": "peezy-tech/jojo",
  "branch": "forgejo",
  "mode": "fork_sync"
}
```

`flow_dispatch` creates a generic `FlowEvent` and dispatches it:

```json
{
  "mode": "flow_dispatch",
  "eventType": "upstream.release",
  "dispatchUrlEnv": "PATCH_FLOW_DISPATCH_URL",
  "dispatchSecretEnv": "PATCH_FLOW_DISPATCH_SECRET",
  "payload": {
    "repo": "openai/codex"
  }
}
```

Set `primeOnly: false` only when old feed entries should be emitted on the first
poll.
