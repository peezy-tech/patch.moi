---
name: "patch-moi:inspect-upstream-release"
description: "Inspect an upstream release against local Git tags, remote-tracking refs, and patch branches without mutating fork state."
---

# Inspect Upstream Release

Use this workflow when an upstream release tag needs readiness review before maintenance begins.

## Workflow

1. Run `git_discover` to confirm the upstream remote, target branch, patch prefix, and local tags.
2. If the release tag is missing locally, use `fetch_upstream` only when fetch policy allows it or the operator has approved the update.
3. Check `patch_list` for the ordered patch stack that would be applied to the upstream base.
4. Use forge or codex-flows records for runner execution details; patch.moi only inspects Git refs.
5. Do not call `patch_rebuild` or other mutation tools unless the matching safety gate is explicitly enabled.
