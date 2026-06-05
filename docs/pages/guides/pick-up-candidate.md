---
title: Pick Up Candidate
description: Fast-forward runner-produced candidate refs from Git.
---

# Pick Up Candidate

Use this guide when a runner produced a branch and patch.moi should pick up the
Git ref.

## 1. List Candidates

```bash
bun run patch.moi -- patch candidates --repo <fork> --remote origin --json
```

## 2. Pull Candidate

```bash
PATCH_MOI_ALLOW_PULL=1 bun run patch.moi -- patch pull \
  --repo <fork> \
  --remote origin \
  --branch candidate/upstream-update \
  --json
```

The update must be a fast-forward. If the local branch diverged, inspect with
Git and decide whether to preserve, merge, or replace it outside patch.moi.

## 3. Continue Review

Use Git, forge checks, and the corresponding codex-toys thread or workflow run
to decide whether the candidate should become a patch ref, a maintained branch
update, or a rejected branch.

## Boundary

patch.moi only moves the candidate Git ref. Runner status, thread recovery,
retry and replay, and artifacts belong outside patch.moi.
