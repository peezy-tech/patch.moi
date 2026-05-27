---
title: Run Patch locally
description: Install dependencies, inspect the Git project model, start the service, and run checks.
---

# Run Patch locally

Install from the repository root:

```bash
bun install
```

Inspect the maintained repository you want patch.moi to operate around. The
repo should expose its upstream and fork as Git remotes:

```bash
git remote -v
git branch --show-current
git status --short --branch
```

The usual local shape is:

| Git fact | Meaning |
| --- | --- |
| `upstream` remote | source project |
| `origin` remote | maintained fork |
| current branch | patch stack or candidate branch |
| upstream tag | release point to rebase onto |

If `upstream` is missing, the repo may still be valid. A common GitHub flow is
fork in the web UI, then clone your own fork, which gives you only `origin`.
patch.moi should discover the parent repository from provider metadata when it
can, then add and fetch the upstream remote.

Start the service app:

```bash
bun run dev
```

Root scripts delegate into the workspace:

```bash
bun run check
bun run test
bun run patch.moi -- status
bun run docs:dev
bun run workspace:doctor
```

Use explicit paths when you run the app package directly:

```bash
cd apps/patch
DATA_DIR=./data FEED_SOURCES_PATH=./feed-sources.json bun run dev
```

`GET /healthz` returns `ok` when the server is running.

Local workspace execution runs from the process working directory only when the
operator explicitly allows it. That makes `--allow-local` useful for testing a
patch application workspace before sending the same event to a configured local
backend, SSH target, or service runner.

The CLI uses the same dispatch and state path as the service. To record a local
harness maintenance attempt:

```bash
bun run patch.moi -- run harness --allow-local
bun run patch.moi -- attempts
```

The repo-native workspace task runs the harness fixture through the same direct
automation command:

```bash
bun run workspace:run:harness
```

That task writes local run state under `.codex/workspace/local/`, which is
ignored by Git.

There is also a manual workspace-owned automation smoke task:

```bash
bun run workspace:backend:init
bun run workspace:backend:service
```

For a foreground development backend instead of a user service, run
`bun run workspace:backend:dev`.

```bash
CODEX_WORKSPACE_BACKEND_WS_URL=ws://127.0.0.1:3586 \
bun run workspace:run:harness
```

That path requires a running local Codex workspace backend. Use it to inspect
backend event and run records; keep patch.moi feed-owned maintenance attempts on
the Patch dispatch path. Use `PATCH_WORKSPACE_SSH_TARGET` and
`PATCH_WORKSPACE_REMOTE_CWD` when the maintenance checkout is remote.

Local mode is checkout-oriented. Service mode is forge-oriented: patch.moi
should talk to the remote forge, trigger a runner, and let that runner perform
the disposable checkout and patch application work.
