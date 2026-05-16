---
title: Dispatch a Codex release flow
description: Connect the OpenAI Codex release feed to codex-flow automation.
---

# Dispatch a Codex release flow

Patch was built to let upstream release activity trigger generic codex-flow
automation without putting Codex-specific completion logic into Patch itself.

## 1. Use the release source

The bundled `apps/patch/feed-sources.json` includes
`github-openai-codex-releases`. Its target emits `upstream.release` events with
the upstream repository and release tag in the payload.

## 2. Point Patch at a backend

```bash
PATCH_FLOW_DISPATCH_URL=http://127.0.0.1:7345/events \
PATCH_FLOW_DISPATCH_SECRET=dev-secret \
DATA_DIR=./data \
FEED_SOURCES_PATH=./feed-sources.json \
bun run --filter @peezy.tech/patch start
```

`PATCH_FLOW_DISPATCH_URL` can point at the `/events` endpoint or at the backend
base URL. Patch normalizes either form before it creates the shared flow client.

## 3. Inspect the stored event

```bash
curl http://127.0.0.1:3000/flow-events
```

When `PATCH_ADMIN_TOKEN` is set, include either `Authorization: Bearer <token>`
or `X-Patch-Admin-Token: <token>`.

## 4. Keep completion app-owned

Patch dispatches the generic event. The installed Codex release flow owns the
work that happens next: matching `flow.toml`, running steps, checking gates, and
emitting `FLOW_RESULT`. Product-specific completion stays in that flow package
or its backend worker.
