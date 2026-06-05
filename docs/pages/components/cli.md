---
title: CLI
description: Local patch.moi command porcelain over Git.
---

# CLI

The CLI is the main patch.moi surface. It runs locally, shells out to Git, and
prints human text or JSON.

## Command Groups

| Group | Commands |
|-------|----------|
| Work | `work start feature` |
| Patch inspection | `patch doctor`, `patch list`, `patch inspect`, `patch test-apply`, `patch explain` |
| Patch mutation | `patch capture`, `patch rebuild`, `patch apply` |
| Candidate refs | `patch candidates`, `patch pull` |
| Setup | `setup fork` |

## Commands

```bash
patch.moi work start feature --title TITLE --repo DIR --branch BRANCH --base REF [--patch-branch patch/NAME] [--create-branch] [--json]
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
patch.moi setup fork --repo DIR --upstream-url URL [--upstream-remote REMOTE] [--target-branch BRANCH] [--apply] [--json]
```

## Boundary

The CLI owns local Git porcelain. It does not run background workers, expose a
dashboard, store event state, or schedule work.
