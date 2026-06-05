---
title: Maintain Fork
description: Rebuild a maintained branch from upstream plus reusable patch refs.
---

# Maintain Fork

Use this guide when upstream moved and a maintained branch should be rebuilt.

## 1. Refresh Upstream

```bash
git -C <fork> fetch upstream main --tags --prune
```

## 2. Inspect

```bash
bun run patch.moi -- patch doctor --repo <fork> --json
bun run patch.moi -- patch list --repo <fork> --json
```

Resolve stacked-patch warnings if the fork should publish patches that consumers
can pick independently.

## 3. Rebuild

```bash
PATCH_MOI_ALLOW_REBUILD=1 bun run patch.moi -- patch rebuild \
  --repo <fork> \
  --base refs/remotes/upstream/main \
  --to main \
  --json
```

## 4. Explain

```bash
bun run patch.moi -- patch explain \
  --repo <fork> \
  --branch main \
  --upstream refs/remotes/upstream/main \
  --json
```

`patch explain` reports matched patch refs in application order plus unmatched
commits.

## Boundary

Rebuild changes a maintained branch. It does not change the reusable `patch/*`
refs unless the operator captures or edits those refs separately.
