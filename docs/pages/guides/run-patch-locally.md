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
bun run docs:dev
```

Use explicit paths when you run the app package directly:

```bash
cd apps/patch
DATA_DIR=./data FEED_SOURCES_PATH=./feed-sources.json bun run dev
```

`GET /healthz` returns `ok` when the server is running.

Local flow dispatch runs from the process working directory when
`PATCH_FLOW_DISPATCH_URL` is unset. That makes local mode useful for testing a
patch application workspace before sending the same event to a service backend.

Local mode is checkout-oriented. Service mode is forge-oriented: patch.moi
should talk to the remote forge, trigger a runner, and let that runner perform
the disposable checkout and patch application work.
