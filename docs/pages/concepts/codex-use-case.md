---
title: Codex use case
description: How patch.moi applies to Codex fork maintenance.
---

# Codex Use Case

patch.moi watches GitHub OpenAI Codex branch and release feeds. Branch activity
can notify operators. Release activity can emit a generic `upstream.release`
flow event for codex-flow automation.

The concrete local model is the neighboring `../codex` checkout:

- `origin` points at `https://github.com/peezy-tech/codex`.
- `code-mode-exec-hooks` is the maintained patch branch.
- `origin/main` is the current comparison branch.
- `rust-v0.130.0` is a downstream tag on the maintained branch head.
- the patch stack contains Code Mode exec/replay work and Peezy npm release
  changes.

That checkout currently lacks an `upstream` remote, so a patch.moi setup flow
should add or confirm `https://github.com/openai/codex.git` before a release
rebase.

The Codex maintenance flow rebases the Peezy Codex fork patch stack onto a
canonical upstream release tag. That is a patch application workspace, not a
public release by itself.

Internal Codex use can track a fast-moving branch for local work. Public npm
release can follow upstream release tags and trusted publishing. Those channels
should share candidate Git refs when appropriate, but one should not block the
other by default.

In service mode, the same Codex maintenance work can run through a forge runner:
patch.moi creates or updates the remote maintenance branch, triggers the runner,
and records the resulting branch, artifact, check, or PR.

See [Codex fork model](codex-fork-model) for the exact repo-derived model.
