---
title: Configure feed sources
description: Add upstream feeds and route update signals into patch maintenance work.
---

# Configure feed sources

Feed sources live in a JSON file referenced by `FEED_SOURCES_PATH`. The bundled
file is `apps/patch/feed-sources.json`.

Feed sources describe intake. They should not duplicate the maintained patch
stack. The patch stack lives in Git as remotes, branches, tags, and commits.

## Choose an event

Use `event: "push"` for branch commit feeds and `event: "release"` for release
feeds. Patch normalizes both into `FeedSignal` records.

## Choose a target

`notify_only` stores the signal without dispatching patch work:

```json
{
  "provider": "github",
  "repoFullName": "peezy-tech/codex",
  "branch": "main",
  "mode": "notify_only"
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

For patch-stack maintenance, prefer `flow_dispatch` to create an
`upstream.release` or `upstream.update` trigger. Let the receiving workspace read
Git to discover the maintained patch branch and candidate refs.

Set `primeOnly: false` only when old feed entries should be emitted on the first
poll.
