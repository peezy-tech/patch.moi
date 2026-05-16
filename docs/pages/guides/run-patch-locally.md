---
title: Run Patch locally
description: Install dependencies, start the service, and run checks.
---

# Run Patch locally

Install from the repository root:

```bash
bun install
```

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
