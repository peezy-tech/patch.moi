---
title: Safety Gates
description: Fail-closed network and mutation policy for patch.moi commands and MCP tools.
---

# Safety Gates

patch.moi read commands run by default. Network and mutation operations fail
closed unless explicitly enabled through `.patchmoi.toml` or environment
variables.

## Gates

| Gate | Enables |
|------|---------|
| `[fetch].allowFetch=true` or `PATCH_MOI_ALLOW_FETCH=1` | MCP `fetch_upstream` |
| `[safety].allowCapture=true` or `PATCH_MOI_ALLOW_CAPTURE=1` | MCP `patch_capture` |
| `[safety].allowRebuild=true` or `PATCH_MOI_ALLOW_REBUILD=1` | MCP `patch_rebuild`, CLI `patch rebuild` |
| `[safety].allowPull=true` or `PATCH_MOI_ALLOW_PULL=1` | MCP `patch_pull`, CLI `patch pull` |
| `[safety].allowApply=true` or `PATCH_MOI_ALLOW_APPLY=1` | CLI `patch apply` |

## Read-Only Commands

```bash
bun run patch.moi -- patch doctor --repo <fork> --json
bun run patch.moi -- patch list --repo <fork> --json
bun run patch.moi -- patch inspect patch/010-feature --repo <fork> --json
bun run patch.moi -- patch test-apply patch/010-feature --repo <fork> --to main --json
bun run patch.moi -- patch explain --repo <fork> --branch main --json
bun run patch.moi -- patch candidates --repo <fork> --json
```

`patch test-apply` creates and removes a temporary worktree. It does not mutate
the target repo.

## Boundary

Safety gates protect Git mutations and fetches. They do not replace Git review,
branch protection, forge checks, or product release policy.
