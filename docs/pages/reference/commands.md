---
title: Commands
description: patch.moi CLI command reference.
---

# Commands

All commands accept `--json` where shown. Relative `--repo` paths resolve from
the workspace root.

## Work

```bash
patch.moi work start feature --title TITLE --repo DIR --branch BRANCH --base REF [--patch-branch patch/NAME] [--create-branch] [--json]
```

## Patch

```bash
patch.moi patch doctor [--repo DIR] [--main BRANCH] [--upstream-remote REMOTE] [--upstream-branch BRANCH] [--fork-remote REMOTE] [--json]
patch.moi patch list [--repo DIR] [--prefix patch/] [--base REF] [--json]
patch.moi patch inspect <patch-ref> [--repo DIR] [--base REF] [--json]
patch.moi patch test-apply <patch-ref> [--repo DIR] [--base REF] [--to REF] [--json]
patch.moi patch apply <patch-ref> --to BRANCH [--repo DIR] [--base REF] [--create-branch] [--json]
patch.moi patch explain --branch REF [--repo DIR] [--upstream REF] [--json]
patch.moi patch candidates [--repo DIR] [--remote REMOTE] [--pattern candidate/*] [--json]
patch.moi patch capture patch/NAME --from BRANCH [--base BRANCH] [--repo DIR] [--message MSG] [--force] [--json]
patch.moi patch rebuild [--base BRANCH] [--to BRANCH] [--repo DIR] [--prefix patch/] [--json]
patch.moi patch pull --repo DIR --remote REMOTE --branch BRANCH [--ff-only] [--json]
```

## Setup

```bash
patch.moi setup fork --repo DIR --upstream-url URL [--upstream-remote REMOTE] [--target-branch BRANCH] [--apply] [--json]
```

## Removed Surfaces

patch.moi does not expose `status`, `events`, `dispatches`, `attempts`, `run`,
`retry`, `replay`, or `sync`. Those surfaces belong to codex-toys or the forge.
