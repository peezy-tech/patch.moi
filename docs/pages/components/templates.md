---
title: Templates
description: codex-toys workflow recipes shipped by patch.moi.
---

# Templates

patch.moi ships codex-toys workflow templates as a kit. The templates provide
product recipes for patch.moi work while codex-toys owns execution state.

## Kit Layout

```text
templates/codex-toys/
  codex-kit.toml
  workflows/
    patch-moi-maintain-fork/
    patch-moi-feature-candidate/
```

## Inspect And Install

```bash
codex-toys kit inspect /path/to/patch.moi/templates/codex-toys --json
codex-toys kit add /path/to/patch.moi/templates/codex-toys --workbench-root /path/to/workbench --json
codex-toys kit add /path/to/patch.moi/templates/codex-toys --workbench-root /path/to/workbench --apply --json
```

Installed workflows land in `.codex/workflows`.

## Boundary

Templates own reusable prompts and workflow shapes. codex-toys owns run ids,
thread ids, retry and replay, queues, feeds, schedules, and artifacts.
patch.moi owns only the Git commands those workflows may call.
