---
title: Maintain a fork
description: Maintain a Git patch stack without patch.moi durable state.
---

# Maintain a fork

patch.moi maintenance is Git-first:

- upstream movement is represented by fetched remote-tracking refs and tags
- local product changes live on feature branches
- durable patch stack entries live on ordered `patch/*` branches
- runner output arrives as candidate refs, forge checks, artifacts, and
  codex-flows thread metadata

## Inspect

```bash
bun run patch.moi -- patch doctor --repo /path/to/fork --json
bun run patch.moi -- patch list --repo /path/to/fork --json
```

Resolve dirty worktrees, missing remotes, missing upstream refs, and missing
patch branches before rebuilding.

## Rebuild

```bash
bun run patch.moi -- patch rebuild --repo /path/to/fork --to main --json
```

This rebuilds the maintained branch from the configured upstream remote-tracking
base plus ordered patch branches.

## Pick Up Runner Work

Runners should publish Git refs plus forge/codex-flows metadata. patch.moi only
pulls the Git ref:

```bash
bun run patch.moi -- patch candidates --repo /path/to/fork --remote origin --json
PATCH_MOI_ALLOW_PULL=1 bun run patch.moi -- patch pull --repo /path/to/fork --remote origin --branch candidate/upstream-release --json
```

`patch pull` is fast-forward only and fails on dirty worktrees. Continue or
transplant the corresponding Codex thread through codex-flows.
