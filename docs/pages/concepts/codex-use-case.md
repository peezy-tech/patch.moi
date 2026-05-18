---
title: Codex use case
description: How patch.moi applies to Codex fork maintenance.
---

# Codex Use Case

patch.moi watches OpenAI Codex branch and release feeds. Branch activity emits
deterministic `upstream.branch_update` events for main-branch maintenance.
Release activity emits deterministic `upstream.release` events for release-cycle
maintenance.

The concrete local model is the neighboring `../codex` checkout:

- `origin` points at `https://github.com/peezy-tech/codex`.
- `main` is the rebuildable maintained fork output.
- `upstream` mirrors `upstream/main`.
- ordered `patch/*` branches hold the logical patch commits.
- `rust-v0.130.0` is a downstream tag on the legacy maintained branch head.
- the current patch inventory contains Code Mode exec/replay work and Peezy npm
  release changes.

That checkout has the canonical `upstream` remote, so maintenance can fetch
OpenAI Codex main and release tags before rebuilding the fork output branch.

The Codex maintenance flow rebuilds the Peezy Codex fork from a canonical
upstream base plus ordered patch branches. That is a patch application workspace
job, not a public release by itself.

Internal Codex use can track a fast-moving branch for local work. Public npm
release can follow upstream release tags and trusted publishing. Those channels
should share candidate Git refs when appropriate, but one should not block the
other by default.

In service mode, the same Codex maintenance work can run through a forge runner:
patch.moi creates or updates the remote maintenance branch, triggers the runner,
and records the resulting branch, artifact, check, or PR.

See [Codex fork model](codex-fork-model) for the exact repo-derived model and
[Workspaces and channels](workspaces-and-channels) for why maintenance,
internal use, and public release stay separate.
