---
title: Flow boundary
description: What Patch owns and what codex-flow packages own.
---

# Flow boundary

Patch owns upstream observation. It knows about feeds, source ids, feed state,
and dispatch attempts.

codex-flow owns execution. Flow packages match `FlowEvent.type` and payload
schema, run Bun or gated Code Mode steps, and emit `FLOW_RESULT`.

Product completion stays outside Patch. For example, OpenAI Codex release
automation should decide how to update a fork, open a branch, ask for review, or
publish a result. Patch only dispatches the upstream release event and records
the dispatch outcome.
