---
name: "patch-moi:maintain-fork"
description: "Maintain a Git-first fork with patch.moi by inspecting remotes, remote-tracking upstream refs, patch branches, candidate refs, and gated Git mutations."
---

# Maintain Fork

Use this workflow when a maintained fork needs to absorb an upstream branch,
release, or runner-produced candidate branch.

## Workflow

1. Inspect Git discovery with `mcp__patch-moi__git_discover`.
2. Run `mcp__patch-moi__patch_doctor` and resolve readiness issues before planning writes.
3. Use `fetch_upstream` only when fetch policy allows it or the operator has
   approved the update. The canonical upstream base is
   `refs/remotes/<upstreamRemote>/<upstreamBranch>`.
4. Use `patch_candidates` to inspect runner-produced refs that already exist in
   local or remote-tracking Git state.
5. Use `patch_pull` only when `PATCH_MOI_ALLOW_PULL=1` or
   `[safety].allowPull=true` is explicitly present; it fast-forwards local
   branches from Git refs and does not inspect runner state.
6. Use `patch_rebuild` to rebuild the maintained branch from upstream plus
   ordered `patch/*` branches.

## Defaults

- `upstreamRemote = "upstream"`
- `upstreamBranch = "main"`
- `forkRemote = "origin"`
- `targetBranch = "main"`
- `patchPrefix = "patch/"`

Do not require or create a local branch named `upstream`; use the remote-tracking ref.
Runner orchestration, retry/replay, run history, and Codex thread transplant
belong to codex-flows or the forge, not patch.moi.
When upkeep should be automated, install the patch.moi codex-flows templates
and run them through codex-flows rather than adding patch.moi state.
