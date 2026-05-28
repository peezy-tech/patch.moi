---
title: codex-flows templates
description: Install patch.moi automation recipes without giving patch.moi runner state.
---

# codex-flows templates

patch.moi ships codex-flows automation templates for teams that want reusable
patch-stack upkeep recipes, while keeping execution state outside patch.moi.

The templates start codex-flows turns with patch.moi prompts. codex-flows and
the forge own the run ids, retry/replay, thread ids, checks, artifacts, and
remote control. patch.moi remains local Git porcelain inside the turn.

## Install

From the target workspace:

```bash
codex-flows pack inspect /path/to/patch.moi/templates/codex-flows
codex-flows pack add /path/to/patch.moi/templates/codex-flows --apply
```

The pack installs:

- `.codex/automations/patch-moi-maintain-fork`
- `.codex/automations/patch-moi-feature-candidate`

## Run

```bash
codex-flows automation run patch-moi-maintain-fork --event event.json --via workspace
codex-flows automation run patch-moi-feature-candidate --event event.json --via workspace
```

The event payload may include `repoPath`, `threadId`, `model`, `permissions`,
and feature-specific fields such as `title`, `branch`, `base`, `patchBranch`,
or `candidateBranch`.

## Boundary

The templates may ask a Codex turn to use patch.moi commands such as
`patch doctor`, `patch list`, `patch capture`, `patch rebuild`,
`patch candidates`, or `patch pull`. They do not create patch.moi records,
attempts, feed cursors, dispatches, run history, or compatibility state.
