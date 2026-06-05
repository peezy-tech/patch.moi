---
title: Maintained Branches
description: Product branches assembled from upstream plus patch refs.
---

# Maintained Branches

Maintained branches are product branches such as `main`, `release/v1`, or
`jojo/main`. They are assembled from an upstream base plus an ordered set of
patch refs.

The order is not stored in a patch.moi manifest. The current rebuild command
uses local patch branch ordering. `patch explain` later derives the branch
composition by comparing commits with stable patch-ids.

## Commands

```bash
bun run patch.moi -- patch doctor --repo <fork> --json
PATCH_MOI_ALLOW_REBUILD=1 bun run patch.moi -- patch rebuild --repo <fork> --to main --json
bun run patch.moi -- patch explain --repo <fork> --branch main --upstream refs/remotes/upstream/main --json
```

## Release Snapshots

Release branches and tags are snapshots of a maintained branch. They should not
be the only place reusable patch identity lives. Keep reusable patches available
as `patch/*` refs so consumers can pick one change without taking the whole
fork.

## Boundary

Maintained branches own assembled products. Patch refs own reusable patches.
Release refs own snapshots. patch.moi derives relationships from Git rather
than storing composition files.
