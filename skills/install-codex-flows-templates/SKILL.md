---
name: "patch-moi:install-codex-flows-templates"
description: "Install patch.moi codex-flows automation templates into a workspace while keeping execution state in codex-flows."
---

# Install codex-flows Templates

Use this workflow when a workspace should receive patch.moi automation recipes
that are executed by codex-flows.

## Workflow

1. Locate the patch.moi repo and use `templates/codex-flows` as the pack source.
2. Inspect before writing:
   `codex-flows pack inspect /path/to/patch.moi/templates/codex-flows --json`
3. Dry-run install in the target workspace:
   `codex-flows pack add /path/to/patch.moi/templates/codex-flows --workspace-root /path/to/workspace --json`
4. Apply only after reviewing the plan:
   `codex-flows pack add /path/to/patch.moi/templates/codex-flows --workspace-root /path/to/workspace --apply --json`
5. Verify `.codex/automations/patch-moi-maintain-fork` and
   `.codex/automations/patch-moi-feature-candidate` exist in the workspace.

The templates start codex-flows turns. They do not create patch.moi records,
attempts, feed cursors, dispatches, or run history.
