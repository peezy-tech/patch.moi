---
name: "patch-moi:maintain-fork"
description: "Maintain a Git-first fork with patch.moi by inspecting remotes, remote-tracking upstream refs, patch branches, dry-run automation matches, and gated mutation policy before any write."
---

# Maintain Fork

Use this workflow when a maintained fork needs to absorb an upstream branch or release.

## Workflow

1. Inspect Git discovery with `mcp__patch-moi__git_discover`.
2. Run `mcp__patch-moi__patch_doctor` and resolve readiness issues before planning writes.
3. Use the dry-run tool that matches the update:
   - `run_upstream_release_dry_run` for upstream release tags.
   - `run_upstream_branch_dry_run` for upstream branch movement.
   - `run_downstream_release_dry_run` for downstream package releases.
4. Treat non-dry-run dispatch, fetch, capture, rebuild, replay, and retry as gated operations. Verify `.patchmoi.toml` or the matching `PATCH_MOI_ALLOW_*` env var before calling a mutation tool.
5. Prefer `git fetch`, never `git pull`. The canonical upstream base is `refs/remotes/<upstreamRemote>/<upstreamBranch>`.

## Defaults

- `upstreamRemote = "upstream"`
- `upstreamBranch = "main"`
- `forkRemote = "origin"`
- `targetBranch = "main"`
- `patchPrefix = "patch/"`

Do not require or create a local branch named `upstream`; use the remote-tracking ref.
