---
title: Inspect upstream movement
description: Inspect upstream refs before rebuilding a maintained fork.
---

# Inspect upstream movement

patch.moi no longer watches feeds or stores update events. Use the forge or
codex-toys to decide when upstream moved, then use patch.moi to inspect the Git
shape in the maintained fork.

## 1. Inspect readiness

```bash
bun run --silent patch.moi -- patch doctor --repo harness/fork --json
```

The canonical upstream base is
`refs/remotes/<upstreamRemote>/<upstreamBranch>`.

## 2. Fetch when allowed

Configure `[fetch].allowFetch=true` or set `PATCH_MOI_ALLOW_FETCH=1`, then use
the MCP `fetch_upstream` tool or ordinary `git fetch`.

## 3. Rebuild when ready

```bash
bun run --silent patch.moi -- patch list --repo harness/fork --json
bun run --silent patch.moi -- patch rebuild --repo harness/fork --to main --json
```

Runner runs, retry/replay, and Codex thread continuation are codex-toys or
forge concerns. patch.moi only consumes the Git refs they leave behind.
