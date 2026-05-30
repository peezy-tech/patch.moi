# Promote feature work into the patch stack

Use patch.moi locally to start or inspect a feature branch, capture the feature
branch into an ordered `patch/*` branch, rebuild the maintained branch, and
report the Git refs that reviewers or runners should inspect.

Do not create patch.moi durable records, attempts, events, dispatches, or
workspace runs. If this is running on a runner, codex-toys or the forge owns
run state, checks, artifacts, thread metadata, and retry/replay.
