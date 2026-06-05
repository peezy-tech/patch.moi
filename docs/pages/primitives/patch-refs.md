---
title: Patch Refs
description: Reusable patch branches, inferred bases, independent status, and stacked dependencies.
---

# Patch Refs

Patch refs are reusable Git refs under `patch/*`.

```text
refs/heads/patch/*
refs/remotes/<remote>/patch/*
```

A patch's content is the commit range from the inferred upstream merge base to
the patch ref tip.

## Independent By Default

A patch ref is `independent` when no other visible patch ref tip is an ancestor
of it. A patch ref is `stacked` when another patch ref tip is an ancestor.

Stacked patches are valid but exceptional. `patch doctor`, `patch list`, and
`patch inspect` surface the dependency refs so consumers know whether a patch
can be picked alone.

## Commands

```bash
bun run patch.moi -- patch list --repo <fork> --json
bun run patch.moi -- patch inspect patch/010-feature --repo <fork> --json
bun run patch.moi -- patch test-apply patch/010-feature --repo <fork> --to main --json
PATCH_MOI_ALLOW_APPLY=1 bun run patch.moi -- patch apply patch/010-feature --repo <fork> --to try-feature --create-branch --json
```

`patch test-apply` uses a temporary worktree. `patch apply` mutates the target
branch and is gated.

## Identity

Patch identity is Git-native: ref name plus commit content. There is no stable
UUID across rebases.

## Boundary

Patch refs own reusable source changes. Maintained branches own product
composition. patch.moi does not write a manifest, index, JSONL log, or
per-patch metadata file.
