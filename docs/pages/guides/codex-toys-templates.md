---
title: codex-toys templates
description: Install patch.moi automation recipes without giving patch.moi runner state.
---

# codex-toys templates

patch.moi ships codex-toys automation templates for teams that want reusable
patch-stack upkeep recipes, while keeping execution state outside patch.moi.

The templates start codex-toys turns with patch.moi prompts. codex-toys and
the forge own the run ids, retry/replay, thread ids, checks, artifacts, and
remote/dashboard surfaces. patch.moi remains local Git porcelain inside the turn.

## Install

From the target workspace:

```bash
codex-toys pack inspect /path/to/patch.moi/templates/codex-toys
codex-toys pack add /path/to/patch.moi/templates/codex-toys --apply
```

The pack installs:

- `.codex/automations/patch-moi-maintain-fork`
- `.codex/automations/patch-moi-feature-candidate`

## Run

```bash
codex-toys automation run patch-moi-maintain-fork --event event.json --via workspace
codex-toys automation run patch-moi-feature-candidate --event event.json --via workspace
```

The event payload may include `repoPath`, `threadId`, `model`, `permissions`,
and feature-specific fields such as `title`, `branch`, `base`, `patchBranch`,
or `candidateBranch`.

## Boundary

The templates may ask a Codex turn to use patch.moi commands such as
`patch doctor`, `patch list`, `patch capture`, `patch rebuild`,
`patch candidates`, or `patch pull`. They do not create patch.moi records,
attempts, feed cursors, dispatches, run history, or compatibility state.
