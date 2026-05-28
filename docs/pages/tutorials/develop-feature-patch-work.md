---
title: Develop feature patch work
description: Capture local feature work into a patch stack.
---

# Develop feature patch work

Use patch.moi when a local feature branch should become a durable `patch/*`
branch.

## 1. Start or select the work branch

```bash
bun run --silent patch.moi -- work start feature \
  --title "Add native replay" \
  --repo harness/fork \
  --branch feature/native-replay \
  --base main \
  --patch-branch patch/020-native-replay \
  --create-branch \
  --json
```

The command returns a Git descriptor with `baseSha`, `workBranchSha`, and
`createdBranch`. It does not write a patch.moi record.

## 2. Commit the feature

Work normally on the feature branch and run the relevant project tests.

## 3. Capture the patch branch

```bash
bun run --silent patch.moi -- patch capture patch/020-native-replay \
  --repo harness/fork \
  --from feature/native-replay \
  --base main \
  --message "patch: native replay" \
  --json
```

`patch capture` creates or replaces a `patch/*` branch from the feature branch
content.

## 4. Rebuild the maintained branch

```bash
bun run --silent patch.moi -- patch rebuild --repo harness/fork --to main --json
```

The maintained branch is rebuilt from the configured upstream remote-tracking
base plus ordered `patch/*` branches.
