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
- codex-flows automation templates under `templates/codex-flows`

It does not provide an HTTP service, feed poller, JSONL store, dispatch adapter,
or codex-flows runner controller.

## `@peezy.tech/patch-docs`

The Tome documentation package in `docs`.

```bash
bun run docs:build
```

## Runtime Dependencies

patch.moi has no runtime dependency on codex-flows. codex-flows remains the
place for runner execution, retry/replay, thread transplant, app-server control,
and workspace automation. The templates are files that codex-flows can install
and run; they are not a patch.moi service mode.
