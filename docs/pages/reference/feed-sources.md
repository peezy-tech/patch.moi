---
title: Feed sources
description: JSON schema by convention for upstream feed configuration.
---

# Feed sources

`FEED_SOURCES_PATH` points at a JSON object with a `sources` array.

```ts
type FeedSourceConfig = {
  id: string;
  provider: "codeberg" | "github" | "jojo";
  url: string;
  event: "push" | "release";
  repo: {
    owner: string;
    name: string;
    fullName: string;
    webUrl: string;
    defaultBranch?: string;
  };
  target?: FeedForkSyncTarget | FeedFlowDispatchTarget;
  pollIntervalSeconds?: number;
  primeOnly?: boolean;
};
```

## Flow dispatch target

```ts
type FeedFlowDispatchTarget = {
  mode: "flow_dispatch";
  eventType: string;
  dispatchUrl?: string;
  dispatchUrlEnv?: string;
  dispatchSecretEnv?: string;
  payload?: Record<string, unknown>;
};
```

The flow payload includes provider, event, source id, entry id, title, URL,
author, published time, repository fields, ref, SHA, tag, and raw feed metadata.
Values from `target.payload` are merged last.
