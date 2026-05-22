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
  provider: "codeberg" | "github" | "jojo" | "npm";
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

For release feeds, patch.moi prefers a tag parsed from release URLs such as
`/releases/tag/<tag>` before falling back to the feed title. This preserves
upstream tag names when a provider displays a shorter release title.

For upstream release maintenance, use a stable event type such as
`upstream.release`. For upstream main movement, use `upstream.branch_update`.
For downstream package releases, use `downstream.release` with `packageName` and
`version` in the payload.

Include only routing hints in `payload`; avoid copying branch topology into the
feed source when it can be read from the repository.

## npm release sources

npm package sources read the registry package document and treat each published
version as a release entry. Use this shape when a downstream package release
should trigger a workspace flow:

```json
{
  "id": "npm-acme-tool-releases",
  "provider": "npm",
  "url": "https://registry.npmjs.org/@acme%2Ftool",
  "event": "release",
  "repo": {
    "owner": "@acme",
    "name": "tool",
    "fullName": "@acme/tool",
    "webUrl": "https://www.npmjs.com/package/@acme/tool"
  },
  "target": {
    "mode": "workspace_flow",
    "eventType": "downstream.release",
    "payload": {
      "packageName": "@acme/tool",
      "repo": "acme/tool"
    }
  }
}
```
