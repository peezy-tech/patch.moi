# patch.moi codex-flows templates

This pack installs codex-flows automation templates that start Codex turns for
patch.moi patch-stack work. The templates live here so patch.moi can provide
product recipes, while codex-flows continues to own execution, thread ids,
retry/replay, runner history, and remote control.

Install from a workspace that should receive the templates:

```bash
codex-flows pack inspect /path/to/patch.moi/templates/codex-flows
codex-flows pack add /path/to/patch.moi/templates/codex-flows --apply
```

The installed automations land in `.codex/automations`.
