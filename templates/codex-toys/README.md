# patch.moi codex-toys templates

This pack installs codex-toys automation templates that start Codex turns for
patch.moi patch-stack work. The templates live here so patch.moi can provide
product recipes, while codex-toys continues to own execution, thread ids,
retry/replay, runner history, and remote/dashboard surfaces.

Install from a workspace that should receive the templates:

```bash
codex-toys pack inspect /path/to/patch.moi/templates/codex-toys
codex-toys pack add /path/to/patch.moi/templates/codex-toys --apply
```

The installed automations land in `.codex/automations`.
