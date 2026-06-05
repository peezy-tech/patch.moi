---
title: Setup Fork
description: Prepare a fork checkout with origin, upstream, target branch, and clean Git state.
---

# Setup Fork

Use this guide when a checkout should become a patch.moi-maintained fork.

## 1. Inspect Remotes

```bash
git -C <fork> remote -v
git -C <fork> branch --show-current
git -C <fork> status --short
```

patch.moi expects a fork remote, an upstream remote, a target branch, and a clean
worktree.

## 2. Add Upstream

```bash
bun run patch.moi -- setup fork \
  --repo <fork> \
  --upstream-url <upstream-url> \
  --upstream-remote upstream \
  --target-branch main \
  --apply \
  --json
```

## 3. Fetch Upstream

Use Git directly or the gated MCP `fetch_upstream` tool.

```bash
git -C <fork> fetch upstream main
```

## 4. Doctor

```bash
bun run patch.moi -- patch doctor --repo <fork> --json
```

Resolve missing refs, dirty worktrees, and missing patch branches before
capturing or rebuilding.
