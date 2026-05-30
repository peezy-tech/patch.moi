---
title: Architecture
description: patch.moi as stateless Git-first patch-stack porcelain.
---

# Architecture

patch.moi is intentionally small:

- Git is the source of truth.
- patch.moi is local CLI/MCP porcelain over Git.
- patch.moi may ship codex-toys automation templates as recipes.
- codex-toys and the forge own execution state.

## Responsibilities

| Layer | Owns |
| --- | --- |
| Git | upstream refs, fork refs, patch branches, candidate branches, commits |
| patch.moi | inspect, capture, rebuild, candidate ref listing, fast-forward pickup, reusable codex-toys templates |
| codex-toys | runner execution, retry/replay, thread transplant, SSH toybox and dashboard surfaces |
| forge | workflow runs, checks, artifacts, PRs, review state |

patch.moi may be called by a runner or through a patch.moi-provided template,
but it does not decide when runners run or store what they did.
