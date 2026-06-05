---
title: Candidate Refs
description: Runner-produced branches that can be inspected and fast-forwarded through Git.
---

# Candidate Refs

Candidate refs are runner-produced Git branches, usually under `candidate/*`.
They are separate from reusable `patch/*` refs.

patch.moi can list visible candidate refs and fast-forward a matching local
branch from a remote-tracking candidate. It does not own runner attempts,
workflow runs, thread ids, retries, artifacts, or review state.

## Commands

```bash
bun run patch.moi -- patch candidates --repo <fork> --remote origin --json
PATCH_MOI_ALLOW_PULL=1 bun run patch.moi -- patch pull --repo <fork> --remote origin --branch candidate/upstream-update --json
```

`patch pull` fetches `refs/heads/<branch>` from the remote and updates the local
branch only when the update is a fast-forward. It also fails on a dirty
worktree.

## Boundary

Candidate refs own handoff from runners into Git. Products and codex-toys own
why the candidate exists, how it was produced, and what should happen after it
is picked up.
