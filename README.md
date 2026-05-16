# patch.moi

Git-first maintenance control plane for custom patches on top of upstream open
source software.

Canonical public host: `https://patch.moi`.

## Repository

This is a Bun monorepo:

- `apps/patch`: the Patch service, feed poller, JSONL store, Discord output,
  and flow dispatch adapter.
- `docs`: Tome documentation site for patch.moi.

patch.moi treats Git as the source of truth for maintained projects. Upstream
and fork remotes, patch branches, tags, and commits describe the patch stack.
Patch records update intake, dispatch attempts, and operational history around
those Git facts.

## Endpoints

```text
GET  /healthz
GET  /flow-events
GET  /flow-events/:id
POST /flow-events/:id/retry
POST /flow-events/:id/replay
GET  /flow-dispatches
```

## Environment

```text
HOST=0.0.0.0
PORT=3000
DATA_DIR=./data
DISCORD_OUTPUT_ENABLED=false
DISCORD_WEBHOOK_URL=
DISCORD_NOTIFY_EVENTS=push,release
FEED_SOURCES_PATH=./feed-sources.json
PATCH_FLOW_DISPATCH_URL=
PATCH_FLOW_DISPATCH_SECRET=
PATCH_ADMIN_TOKEN=
```

Discord notifications are off by default. Set `DISCORD_OUTPUT_ENABLED=true`
and `DISCORD_WEBHOOK_URL` to send Discord output. `DISCORD_NOTIFY_EVENTS` is a
comma-separated allow list and defaults to `push,release`.

## Development

```bash
bun install
bun run check
bun run dev
```

Feed watcher events are configured in `apps/patch/feed-sources.json`. The first
poll primes `DATA_DIR/feed-state.json`; later polls append upstream activity to
`DATA_DIR/feed-events.jsonl`. Targets using `mode: "fork_sync"` append legacy
work to `DATA_DIR/feed-jobs.jsonl`. Targets using `mode: "flow_dispatch"`
append generic flow events to `DATA_DIR/flow-events.jsonl`, POST them to the
configured dispatch URL, and record dispatch outcomes in
`DATA_DIR/flow-dispatches.jsonl`.

## Documentation

The publishable docs site is a Tome project in `docs/`:

```bash
bun run docs:dev
bun run docs:build
```

Docs source follows the Diataxis framework under `docs/pages/tutorials`,
`docs/pages/guides`, `docs/pages/reference`, and `docs/pages/concepts`.
