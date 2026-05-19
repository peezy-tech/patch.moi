---
name: "patch-moi:inspect-upstream-release"
description: "Inspect an upstream release against local Git tags, remote-tracking refs, patch branches, and codex-flow dry-run matches without mutating fork state."
---

# Inspect Upstream Release

Use this workflow when an upstream release tag needs readiness review before maintenance begins.

## Workflow

1. Run `git_discover` to confirm the upstream remote, target branch, patch prefix, and local tags.
2. If the release tag is missing locally, use `fetch_upstream` only when fetch policy allows it or the operator has approved the update.
3. Run `run_codex_release_dry_run` with the release tag and inspect matching flows.
4. Check `patch_list` for the ordered patch stack that would be applied to the upstream base.
5. Do not call non-dry-run `run_codex_release`, `patch_rebuild`, or other mutation tools unless the matching safety gate is explicitly enabled.
