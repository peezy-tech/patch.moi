---
title: Packages
description: Workspace packages in the Patch monorepo.
---

# Packages

## `@peezy.tech/patch`

The Bun service in `apps/patch`. It exports no public package API; its runtime
entry point is `src/server.ts`.

Responsibilities:

- Poll configured feeds.
- Normalize entries into `FeedSignal` records.
- Store JSONL state.
- Emit optional Discord notifications.
- Dispatch generic codex-flow events through `@peezy.tech/flow-runtime/client`.
- Serve admin inspection, retry, and replay endpoints.

## `@peezy.tech/patch-docs`

The Tome documentation package in `docs`. Build it with:

```bash
bun run docs:build
```
