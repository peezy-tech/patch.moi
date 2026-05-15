# patch

Containerized Bun service for upstream feed watching and flow dispatch.

Canonical public host: `https://patch.moi`.

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
DATA_DIR=/app/data
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

Feed watcher events are configured in `feed-sources.json`. The first poll primes
`DATA_DIR/feed-state.json`; later polls append upstream activity to
`DATA_DIR/feed-events.jsonl`. Targets using `mode: "fork_sync"` append legacy
work to `DATA_DIR/feed-jobs.jsonl`. Targets using `mode: "flow_dispatch"`
append generic flow events to `DATA_DIR/flow-events.jsonl`, POST them to the
configured dispatch URL, and record dispatch outcomes in
`DATA_DIR/flow-dispatches.jsonl`.
