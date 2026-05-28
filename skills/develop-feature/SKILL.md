---
name: "patch-moi:develop-feature"
description: "Develop feature work with patch.moi by creating or selecting a local feature branch, capturing it into patch/*, and rebuilding the maintained branch."
---

# Develop Feature

Use this workflow when an operator wants a new feature to become part of a Git
patch stack.

## Workflow

1. Inspect the repo with `mcp__patch-moi__git_discover` and `patch_doctor`.
2. Start feature work with `work_start_feature`, including a title, base ref,
   work branch, and intended `patch/*` branch. Treat the result as an
   ephemeral Git descriptor, not a durable patch.moi record.
3. Make and test the feature commits on the work branch.
4. Capture the feature branch with `patch_capture`.
5. Rebuild the maintained branch with `patch_rebuild` after the capture.
6. Inspect `patch_list`, Git status, and the rebuilt branch before proposing
   push, review, or release steps.

Mutation tools fail closed unless the matching safety policy or env gate is
enabled.
