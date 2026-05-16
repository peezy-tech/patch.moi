---
title: Upstream use cases
description: How Patch is used for Forgejo and Codex upstream tracking.
---

# Upstream use cases

## Forgejo

Patch watches Codeberg Forgejo branch and release feeds. Branch activity can be
notification-only. Release activity can still produce a legacy `fork_sync` job
for a jojo-hosted Forgejo fork workflow.

The Forgejo fork remains a maintenance decision outside Patch. Patch records the
upstream signal and job; fork policy, branch policy, CI, and release ownership
belong to the Forgejo fork process.

## OpenAI Codex

Patch watches GitHub OpenAI Codex branch and release feeds. Branch activity can
notify operators. Release activity emits a generic `upstream.release` flow event
for codex-flow automation.

This keeps the release feed integration stable while the actual Codex release
automation evolves in flow packages and backends.
