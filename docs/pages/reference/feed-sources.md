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

For upstream release maintenance, use a stable event type such as
`upstream.release`. For upstream main movement, use `upstream.branch_update`.
For downstream package releases, use `downstream.release` with `packageName` and
`version` in the payload.

Include only routing hints in `payload`; avoid copying branch topology into the
feed source when it can be read from the repository.

## npm release sources

npm package sources read the registry package document and treat each published
version as a release entry. patch.moi uses this for the local downstream release
broadcasts from `@peezy.tech/codex` and `@peezy.tech/codex-flows`:

```json
{
  "id": "npm-peezy-codex-flows-releases",
  "provider": "npm",
  "url": "https://registry.npmjs.org/@peezy.tech%2Fcodex-flows",
  "event": "release",
  "repo": {
    "owner": "@peezy.tech",
    "name": "codex-flows",
    "fullName": "@peezy.tech/codex-flows",
    "webUrl": "https://www.npmjs.com/package/@peezy.tech/codex-flows"
  },
  "target": {
    "mode": "workspace_flow",
    "eventType": "downstream.release",
    "payload": {
      "packageName": "@peezy.tech/codex-flows",
      "repo": "peezy-tech/codex-flows"
    }
  }
}
```
