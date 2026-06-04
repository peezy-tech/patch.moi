---
name: "patch-moi:install-codex-toys-templates"
description: "Install patch.moi codex-toys workflow templates into a workbench while keeping execution state in codex-toys."
---

# Install codex-toys Templates

Use this workflow when a workbench should receive patch.moi workflow recipes
that are executed by codex-toys.

## Workflow

1. Locate the patch.moi repo and use `templates/codex-toys` as the kit source.
2. Inspect before writing:
   `codex-toys kit inspect /path/to/patch.moi/templates/codex-toys --json`
3. Dry-run install in the target workbench:
   `codex-toys kit add /path/to/patch.moi/templates/codex-toys --workbench-root /path/to/workbench --json`
4. Apply only after reviewing the plan:
   `codex-toys kit add /path/to/patch.moi/templates/codex-toys --workbench-root /path/to/workbench --apply --json`
5. Verify `.codex/workflows/patch-moi-maintain-fork` and
   `.codex/workflows/patch-moi-feature-candidate` exist in the workbench.

The templates start codex-toys workflow turns. They do not create patch.moi records,
attempts, feed cursors, dispatches, or run history.
