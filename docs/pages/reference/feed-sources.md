---
title: Feed sources
description: JSON schema by convention for upstream update intake.
---

# Feed sources

`FEED_SOURCES_PATH` points at a JSON object with a `sources` array.

This file configures update intake, not the patch stack. A flow target can add
payload hints, but the receiving workspace should use Git remotes, branches, and
tags as the maintained project source of truth.

```ts
type FeedSourceConfig = {
  id: string;
  provider: "github";
  url: string;
  event: "push" | "release";
  repo: {
    owner: string;
    name: string;
    fullName: string;
    webUrl: string;
    defaultBranch?: string;
  };
  target?: FeedWorkspaceFlowTarget;
  pollIntervalSeconds?: number;
  primeOnly?: boolean;
};
```

## Workspace flow target

```ts
type FeedWorkspaceFlowTarget = {
  mode: "workspace_flow" | "flow_dispatch";
  eventType: string;
  workspaceUrl?: string;
  workspaceUrlEnv?: string;
  workspaceSecretEnv?: string;
  dispatchUrl?: string;
  dispatchUrlEnv?: string;
  dispatchSecretEnv?: string;
  payload?: Record<string, unknown>;
};
```

The target creates a generic `FlowEvent` and hands it to the workspace backend
adapter. The flow payload includes provider, event, source id, entry id, title,
URL, author, published time, repository fields, ref, SHA, tag, and raw feed
metadata. Values from `target.payload` are merged last.

For release maintenance, use a stable event type such as `upstream.release` and
include only routing hints in `payload`. Avoid copying branch topology into the
feed source when it can be read from the repository.
