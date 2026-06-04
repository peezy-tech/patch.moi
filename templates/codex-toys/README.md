# patch.moi codex-toys templates

This kit installs codex-toys workflow templates that start Codex turns for
patch.moi patch-stack work. The templates live here so patch.moi can provide
product recipes, while codex-toys continues to own execution, thread ids,
retry/replay, runner history, and remote/dashboard surfaces.

Install from a workbench that should receive the templates:

```bash
codex-toys kit inspect /path/to/patch.moi/templates/codex-toys
codex-toys kit add /path/to/patch.moi/templates/codex-toys --apply
```

The installed workflows land in `.codex/workflows`.
