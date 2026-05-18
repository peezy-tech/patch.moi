---
title: Packages
description: Workspace packages in the patch.moi monorepo.
---

# Packages

## `@peezy.tech/patch`

The Bun service in `apps/patch`. It exports no public package API; its runtime
entry points are `src/server.ts` for the service and `src/cli.ts` for local
operator commands.

Responsibilities:

- Poll configured feeds.
- Normalize entries into `FeedSignal` records.
- Store JSONL state.
- Submit generic `FlowEvent` triggers through the patch.moi workspace backend
  adapter.
- Provide the `patch.moi` CLI for setup, local maintenance runs, status,
  retry, replay, and sync.
- Serve admin inspection, retry, and replay endpoints.

The service package does not store patch contents. Maintained patch stacks live
in Git repositories operated on by local workspaces or forge runners.

## `@peezy.tech/patch-docs`

The Tome documentation package in `docs`. Build it with:

```bash
bun run docs:build
```

## Root Workspace

The repository root owns shared scripts and dev dependencies. It installs the
current `@peezy.tech/codex-flows` package surface so repo-native workspace,
flow, app-server, and backend commands are available:

```bash
bun run flow:list
bun run workspace:backend
bun run workspace:doctor
bun run workspace:tick
bun run workspace:run:harness
```

Those commands are operator automation around the repo. They do not replace the
Patch service package or its `DATA_DIR` state.

## Installed Flow Capabilities

External flow capabilities are installed under `.codex/flows` and tracked in
`.codex/pack-lock.json`. The current install brings in the Codex release
maintenance flows from the sibling `../codex-flows` repository:

```bash
codex-flows pack doctor --json
```

`openai-codex-bindings` matches `upstream.release` events for `openai/codex`.
`peezy-codex-fork` matches both `upstream.release` and
`upstream.branch_update` events. `peezy-codex-flows-fork` matches
`downstream.release` events for `@peezy.tech/codex` and
`@peezy.tech/codex-flows`. They are installed capabilities, not patch.moi
product state. patch.moi still records feed-owned flow events, workspace
dispatches, and maintenance attempts under `DATA_DIR`.

## Related Runtime Package

patch.moi uses the consolidated codex-flows package surface:

| Package | Published version | patch.moi use |
| --- | --- | --- |
| `@peezy.tech/codex-flows` | `^0.4.0` | flow runtime, Bun flow helpers, workspace backend protocol/client, Actions/local flow state, CLI automation, and backend bins |

patch.moi product state still belongs in the Patch service JSONL store by
default. Generic flow backend state is execution/run state. It is useful for
inspection and sync, but it is not the default home for feed signals, workspace
dispatch records, or maintenance attempts.
