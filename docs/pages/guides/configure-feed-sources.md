---
title: Configure feed sources
description: Add upstream feeds and route update signals into patch maintenance work.
---

# Configure feed sources

Feed sources live in a JSON file referenced by `FEED_SOURCES_PATH`. The bundled
`apps/patch/feed-sources.json` file is intentionally empty so the product repo
does not carry private operational intake policy. Put real feed sources in the
workspace repo that owns the corresponding installed flows.

Feed sources describe intake. They should not duplicate the maintained patch
stack. The patch stack lives in Git as remotes, branches, tags, and commits;
patch.moi records the operational state around feed events and dispatches.

## Choose an event

Use `event: "push"` for branch commit feeds and `event: "release"` for release
feeds. Patch normalizes both into `FeedSignal` records.

## Choose a target

`notify_only` stores the signal without dispatching patch work:

```json
{
  "provider": "github",
  "repoFullName": "owner/project",
  "branch": "main",
  "mode": "notify_only"
}
```

`workspace_flow` creates a generic `FlowEvent` and submits it to the workspace
backend adapter:

```json
{
  "mode": "workspace_flow",
  "eventType": "upstream.release",
  "workspaceUrlEnv": "PATCH_WORKSPACE_BACKEND_URL",
  "workspaceSecretEnv": "PATCH_WORKSPACE_BACKEND_SECRET",
  "payload": {
    "repo": "owner/project"
  }
}
```

For patch-stack maintenance, prefer `workspace_flow` to create an
`upstream.release` or `upstream.branch_update` trigger. Let the receiving
workspace read Git to discover the maintained branch, patch inventory, and
candidate refs.

Use explicit payload fields for patch.moi-dispatched events. Do not rely on
implicit workspace flow defaults for maintenance events, because patch.moi uses
deterministic ids and timestamps for dispatch and replay.

Set `primeOnly: false` only when old feed entries should be emitted on the first
poll.
