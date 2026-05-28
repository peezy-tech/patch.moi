---
title: Architecture
description: patch.moi as stateless Git-first patch-stack porcelain.
---

# Architecture

patch.moi is intentionally small:

- Git is the source of truth.
- patch.moi is local CLI/MCP porcelain over Git.
- codex-flows and the forge own execution state.

## Responsibilities

| Layer | Owns |
| --- | --- |
| Git | upstream refs, fork refs, patch branches, candidate branches, commits |
| patch.moi | inspect, capture, rebuild, candidate ref listing, fast-forward pickup |
| codex-flows | runner execution, retry/replay, thread transplant, local/SSH/app-server control |
| forge | workflow runs, checks, artifacts, PRs, review state |

patch.moi may be called by a runner, but it does not decide when runners run or
store what they did.
