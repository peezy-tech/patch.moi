---
title: Codex use case
description: How patch.moi applies to Codex fork maintenance.
---

# Codex Use Case

For Codex fork maintenance, patch.moi is the local Git tool used after another
system has decided work is needed.

codex-flows or the forge can watch upstream releases, dispatch runners, preserve
threads, and publish artifacts. patch.moi then helps inspect and update the
fork:

- confirm the fork/upstream remote shape
- inspect ordered `patch/*` branches
- rebuild the maintained `main` branch
- list and fast-forward runner candidate refs
- capture new local feature work into the patch stack

Internal Codex use, public npm release, and runner repair can share Git
candidate refs, but their execution state stays outside patch.moi.

See [Codex fork model](codex-fork-model) and [Flow boundary](flow-boundary).
