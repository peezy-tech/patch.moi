---
title: Run patch.moi locally
description: Use the local CLI and MCP server without service state.
---

# Run patch.moi locally

patch.moi runs as local CLI or local MCP tooling. There is no patch.moi HTTP
service, feed poller, or `DATA_DIR`.

## Install

```bash
bun install
bun run check
```

## Inspect a fork

```bash
bun run patch.moi -- patch doctor --repo harness/fork
bun run patch.moi -- patch list --repo harness/fork
```

## Work on patches

```bash
bun run patch.moi -- work start feature --title "My feature" --repo harness/fork --branch feature/my-feature --base main --create-branch
bun run patch.moi -- patch capture patch/010-my-feature --repo harness/fork --from feature/my-feature
bun run patch.moi -- patch rebuild --repo harness/fork --to main
```

## Pick up runner output

```bash
bun run patch.moi -- patch candidates --repo harness/fork --remote origin
PATCH_MOI_ALLOW_PULL=1 bun run patch.moi -- patch pull --repo harness/fork --remote origin --branch candidate/my-run
```

Use codex-flows for runner execution and thread transplant. Use the forge for
checks and artifacts.
