---
name: "patch-moi:install-codex-toys-templates"
description: "Install patch.moi codex-toys automation templates into a workspace while keeping execution state in codex-toys."
---

# Install codex-toys Templates

Use this workflow when a workspace should receive patch.moi automation recipes
that are executed by codex-toys.

## Workflow

1. Locate the patch.moi repo and use `templates/codex-toys` as the pack source.
2. Inspect before writing:
   `codex-toys pack inspect /path/to/patch.moi/templates/codex-toys --json`
3. Dry-run install in the target workspace:
   `codex-toys pack add /path/to/patch.moi/templates/codex-toys --workspace-root /path/to/workspace --json`
4. Apply only after reviewing the plan:
   `codex-toys pack add /path/to/patch.moi/templates/codex-toys --workspace-root /path/to/workspace --apply --json`
5. Verify `.codex/automations/patch-moi-maintain-fork` and
   `.codex/automations/patch-moi-feature-candidate` exist in the workspace.

The templates start codex-toys turns. They do not create patch.moi records,
attempts, feed cursors, dispatches, or run history.
