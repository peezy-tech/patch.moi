---
title: Git source of truth
description: What patch.moi derives from Git.
---

# Git source of truth

patch.moi derives state from Git facts:

- configured upstream and fork remotes
- `refs/remotes/<upstreamRemote>/<upstreamBranch>`
- ordered `patch/*` branches
- feature branches
- runner candidate branches such as `candidate/*`
- commit ids and subjects

There is no separate patch.moi database. If a runner produced work, the durable
proof is the Git ref plus forge checks, artifacts, PRs, and codex-toys thread
metadata.

## Processedness

For feed or runner intake, processedness should be defined outside patch.moi by
the outputs:

- a branch exists at the expected commit
- a check or workflow run finished for that commit
- an artifact or PR references that commit
- a codex-toys thread can be resumed or transplanted

patch.moi only inspects and updates Git refs.
