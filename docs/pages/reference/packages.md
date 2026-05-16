---
title: Packages
description: Workspace packages in the patch.moi monorepo.
---

# Packages

## `@peezy.tech/patch`

The Bun service in `apps/patch`. It exports no public package API; its runtime
entry point is `src/server.ts`.

Responsibilities:

- Poll configured feeds.
- Normalize entries into `FeedSignal` records.
- Store JSONL state.
- Dispatch generic codex-flow events through `@peezy.tech/flow-runtime/client`.
- Serve admin inspection, retry, and replay endpoints.

The service package does not store patch contents. Maintained patch stacks live
in Git repositories operated on by local workspaces or forge runners.

## `@peezy.tech/patch-docs`

The Tome documentation package in `docs`. Build it with:

```bash
bun run docs:build
```
