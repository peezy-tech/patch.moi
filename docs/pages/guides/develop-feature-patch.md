---
title: Develop Feature Patch
description: Turn local feature work into an independent reusable patch ref.
---

# Develop Feature Patch

Use this guide when a local feature branch should become a reusable `patch/*`
ref.

## 1. Start Feature Work

```bash
bun run patch.moi -- work start feature \
  --title "Add native replay" \
  --repo <fork> \
  --branch feature/native-replay \
  --base refs/remotes/upstream/main \
  --patch-branch patch/020-native-replay \
  --create-branch \
  --json
```

Make and commit the feature work on the feature branch.

## 2. Capture The Patch Ref

```bash
bun run patch.moi -- patch capture patch/020-native-replay \
  --repo <fork> \
  --from feature/native-replay \
  --base refs/remotes/upstream/main \
  --message "patch: native replay" \
  --json
```

## 3. Check Independence

```bash
bun run patch.moi -- patch inspect patch/020-native-replay --repo <fork> --json
bun run patch.moi -- patch test-apply patch/020-native-replay --repo <fork> --to refs/remotes/upstream/main --json
```

A shareable patch should usually report `independent` and apply on its own.

## Boundary

Feature branches are workspaces. Patch refs are reusable deliverables.
Maintained branches are products assembled from patch refs.
