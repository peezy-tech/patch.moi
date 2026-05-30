---
title: Codex fork model
description: The Git topology patch.moi should learn from the neighboring Codex fork.
---

# Codex Fork Model

The neighboring `../codex` checkout is the concrete model for patch.moi:

- `origin` is the maintained fork remote
- `upstream` is the canonical upstream remote
- `main` is the maintained output branch
- `patch/*` branches are the durable patch stack
- runner output should arrive as candidate refs, checks, artifacts, and
  codex-toys thread metadata

patch.moi should not duplicate patch contents or runner history in product
state. It reads Git and mutates Git.

## Local Maintenance Loop

```bash
cd ../codex
git status --short --branch
git fetch upstream --tags --prune
bun run patch.moi -- patch doctor --repo .
bun run patch.moi -- patch list --repo .
bun run patch.moi -- patch rebuild --repo . --to main
```

## Runner Handoff

A runner may rebuild or repair the fork in a disposable checkout. Its durable
outputs should be remote refs and forge/codex-toys metadata:

```bash
bun run patch.moi -- patch candidates --repo ../codex --remote origin
PATCH_MOI_ALLOW_PULL=1 bun run patch.moi -- patch pull --repo ../codex --remote origin --branch candidate/codex-upstream
```

Continue or transplant any Codex thread through codex-toys. patch.moi only
handles the Git ref.
