---
name: "patch-moi:develop-feature"
description: "Develop feature work with patch.moi by starting a patch-work record, committing on a feature branch, capturing it into patch/*, and rebuilding the maintained branch."
---

# Develop Feature

Use this workflow when an operator wants a new feature to become part of a Git
patch stack.

## Workflow

1. Inspect the repo with `mcp__patch-moi__git_discover` and `patch_doctor`.
2. Start feature work with `work_start_feature`, including a title, base ref,
   work branch, and intended `patch/*` branch.
3. Make and test the feature commits on the work branch.
4. Capture the feature branch with `patch_capture` and pass the `workId` so the
   capture attempt is linked to the patch work record.
5. Rebuild the maintained branch with `patch_rebuild` after the capture.
6. Show the work with `work_show` and inspect linked attempts before proposing
   push, review, or release steps.

Mutation tools fail closed unless the matching safety policy or env gate is
enabled.
