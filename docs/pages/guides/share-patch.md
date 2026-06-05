---
title: Share Patch
description: Inspect, test, and apply one reusable patch ref without taking a whole fork.
---

# Share Patch

Use this guide when a consumer wants one patch from a fork.

## 1. Fetch Patch Refs

```bash
git -C <consumer-fork> fetch <remote> "refs/heads/patch/*:refs/remotes/<remote>/patch/*"
```

## 2. List And Inspect

```bash
bun run patch.moi -- patch list --repo <consumer-fork> --json
bun run patch.moi -- patch inspect <remote>/patch/010-feature --repo <consumer-fork> --json
```

Prefer `independent` patches for single-patch consumption. Stacked patches
report dependency refs.

## 3. Test Apply

```bash
bun run patch.moi -- patch test-apply <remote>/patch/010-feature \
  --repo <consumer-fork> \
  --to main \
  --json
```

## 4. Apply

```bash
PATCH_MOI_ALLOW_APPLY=1 bun run patch.moi -- patch apply <remote>/patch/010-feature \
  --repo <consumer-fork> \
  --to try/010-feature \
  --create-branch \
  --json
```

On conflict, Git is left in the normal conflicted state so the operator can
resolve, continue, or abort with normal Git commands.

## Boundary

Patch sharing is ref-based. A marketplace or product UI can make refs easier to
find, but patch.moi does not need a patch registry or metadata file to share
patches.
