# Maintain the patch.moi fork

Use patch.moi as local Git-first patch-stack porcelain. Inspect the configured
fork, upstream remote-tracking refs, ordered `patch/*` branches, and any
candidate refs already present in Git.

Do not create patch.moi durable state. Do not call patch.moi service, feed,
dispatch, retry, replay, or attempt commands. Runner state, thread transplant,
checks, artifacts, and remote/mobile control belong to codex-flows or the forge.

When mutation is explicitly allowed by workspace policy, rebuild the maintained
branch from upstream plus patch branches. If the runner or forge should receive
an output, publish Git refs/checks/artifacts through that environment rather
than patch.moi state.
