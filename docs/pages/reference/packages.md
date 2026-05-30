---
title: Packages
description: Workspace packages in the patch.moi monorepo.
---

# Packages

## `@peezy.tech/patch`

The Bun package in `apps/patch`. It provides:

- `patch.moi`, the local Git CLI
- `patch.moi-mcp`, the local MCP server
- Git discovery, patch capture, patch rebuild, and candidate ref helpers
- codex-toys automation templates under `templates/codex-toys`

It does not provide an HTTP service, feed poller, JSONL store, dispatch adapter,
or codex-toys runner controller.

## `@peezy.tech/patch-docs`

The Tome documentation package in `docs`.

```bash
bun run docs:build
```

## Runtime Dependencies

patch.moi has no runtime dependency on codex-toys. codex-toys remains the
place for runner execution, retry/replay, thread transplant, SSH toybox and
dashboard surfaces, and workspace automation. The templates are files that
codex-toys can install and run; they are not a patch.moi service mode.
