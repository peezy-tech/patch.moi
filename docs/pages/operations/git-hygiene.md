---
title: Git Hygiene
description: Operational checks for clean worktrees, refs, and Git-only patch state.
---

# Git Hygiene

patch.moi intentionally keeps durable state in Git. Operational health starts
with ordinary Git checks.

## Checks

```bash
git -C <fork> status --short --branch
git -C <fork> remote -v
git -C <fork> show-ref --heads --remotes
bun run patch.moi -- patch doctor --repo <fork> --json
```

## No Patch Metadata Files

patch.moi should not create patch manifests, registries, JSONL logs, patch
indexes, or per-patch metadata files.

```bash
find <fork> -maxdepth 2 -name ".patchmoi" -o -name "patches.json" -o -name "patch-index.json"
```

If a product wants a marketplace, dashboard, or catalog, it should derive from
Git refs or keep product state outside patch.moi.

## Dirty Worktrees

Mutation commands fail on dirty worktrees. Resolve local changes before running
capture, rebuild, pull, or apply.

## Boundary

Git hygiene owns local safety and reviewability. It does not replace forge
checks, branch protection, signed releases, or product release policy.
