---
title: CLI
description: Local Git-first patch.moi commands.
---

# CLI

patch.moi exposes local Git commands only.

## Feature work

```bash
patch.moi work start feature --title TITLE --repo DIR --branch BRANCH --base REF [--patch-branch patch/NAME] [--create-branch] [--json]
```

JSON output:

```json
{
  "kind": "feature",
  "title": "Add native replay",
  "repo": "/path/to/fork",
  "baseRef": "main",
  "baseSha": "<sha>",
  "workBranch": "feature/native-replay",
  "workBranchSha": "<sha>",
  "patchBranch": "patch/020-native-replay",
  "createdBranch": true
}
```

## Patch stack

```bash
patch.moi patch doctor [--repo DIR] [--main BRANCH] [--upstream-remote REMOTE] [--upstream-branch BRANCH] [--fork-remote REMOTE] [--json]
patch.moi patch list [--repo DIR] [--prefix patch/] [--base REF] [--json]
patch.moi patch inspect <patch-ref> [--repo DIR] [--base REF] [--json]
patch.moi patch test-apply <patch-ref> [--repo DIR] [--base REF] [--to REF] [--json]
patch.moi patch apply <patch-ref> --to BRANCH [--repo DIR] [--base REF] [--create-branch] [--json]
patch.moi patch explain --branch REF [--repo DIR] [--upstream REF] [--json]
patch.moi patch capture patch/NAME --from BRANCH [--base BRANCH] [--repo DIR] [--message MSG] [--force] [--json]
patch.moi patch rebuild [--base BRANCH] [--to BRANCH] [--repo DIR] [--prefix patch/] [--json]
```

`patch list` includes local `refs/heads/patch/*` and visible remote-tracking
`refs/remotes/<remote>/patch/*` refs. Output includes the tip SHA, inferred base
SHA, `independent` or `stacked` status, and dependency refs inferred from Git
ancestry.

`patch inspect` shows the commits and files in the patch range. It warns when
another patch ref tip is an ancestor.

`patch test-apply` uses a temporary worktree and does not mutate the repo.

`patch apply` requires `--to`. If the target branch does not exist,
`--create-branch` creates it from the upstream base. The command is gated by
`PATCH_MOI_ALLOW_APPLY=1` or `[safety].allowApply=true`.

`patch explain` compares a maintained branch to visible `patch/*` refs with
stable patch-id matching and reports matched patch refs plus unmatched commits.

## Runner candidate refs

```bash
patch.moi patch candidates [--repo DIR] [--remote REMOTE] [--pattern candidate/*] [--json]
patch.moi patch pull --repo DIR --remote REMOTE --branch BRANCH [--ff-only] [--json]
```

`patch candidates` inspects local and remote-tracking refs. It does not query a
runner.

`patch pull` fetches `refs/heads/<branch>` from the remote, updates the matching
local branch, and fails unless the update is a fast-forward. It also fails on a
dirty worktree and is gated by `PATCH_MOI_ALLOW_PULL=1` or
`[safety].allowPull=true`.

## Setup

```bash
patch.moi setup fork --repo DIR --upstream-url URL [--upstream-remote REMOTE] [--target-branch BRANCH] [--apply] [--json]
```

## Removed surfaces

The following commands are intentionally absent: `status`, `events`,
`dispatches`, `attempts`, `run`, `retry`, `replay`, and `sync`.
