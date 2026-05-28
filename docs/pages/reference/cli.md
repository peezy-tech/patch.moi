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
patch.moi patch list [--repo DIR] [--prefix patch/] [--json]
patch.moi patch capture patch/NAME --from BRANCH [--base BRANCH] [--repo DIR] [--message MSG] [--force] [--json]
patch.moi patch rebuild [--base BRANCH] [--to BRANCH] [--repo DIR] [--prefix patch/] [--json]
```

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
