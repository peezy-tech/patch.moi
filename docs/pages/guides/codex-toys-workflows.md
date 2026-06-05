---
title: codex-toys Workflows
description: Install patch.moi workflow recipes into a codex-toys workbench.
---

# codex-toys Workflows

Use this guide when a codex-toys workbench should run patch.moi recipes.

## 1. Inspect The Kit

```bash
codex-toys kit inspect /path/to/patch.moi/templates/codex-toys --json
```

The kit contains:

```text
patch-moi-maintain-fork
patch-moi-feature-candidate
```

## 2. Dry Run Install

```bash
codex-toys kit add /path/to/patch.moi/templates/codex-toys \
  --workbench-root /path/to/workbench \
  --json
```

## 3. Apply

```bash
codex-toys kit add /path/to/patch.moi/templates/codex-toys \
  --workbench-root /path/to/workbench \
  --apply \
  --json
```

## Boundary

The installed workflows start Codex turns that can use patch.moi. codex-toys
continues to own schedules, feed dispatch, durable queues, run ids, thread ids,
retry and replay, and artifacts.
