# patchbay

Containerized Bun service for GitHub and jojo.build webhooks.

## Endpoints

```text
GET  /healthz
POST /jojo
POST /github
```

## Environment

```text
HOST=0.0.0.0
PORT=3000
DATA_DIR=/app/data
JOJO_WEBHOOK_SECRET=...
GITHUB_WEBHOOK_SECRET=...
DISCORD_OUTPUT_ENABLED=false
DISCORD_WEBHOOK_URL=
DISCORD_NOTIFY_EVENTS=push,pull_request,release
FEED_SOURCES_PATH=./feed-sources.json
PATCHBAY_FLOW_DISPATCH_URL=
PATCHBAY_FLOW_DISPATCH_SECRET=
```

Discord notifications are off by default. Set `DISCORD_OUTPUT_ENABLED=true`
and `DISCORD_WEBHOOK_URL` to send Discord output. `DISCORD_NOTIFY_EVENTS` is a
comma-separated allow list and defaults to `push,pull_request,release`.

## Development

```bash
bun install
bun run check
bun run dev
```

Accepted webhook events are appended to `DATA_DIR/events.jsonl`; queued work
items are appended to `DATA_DIR/jobs.jsonl`.

Feed watcher events are configured in `feed-sources.json`. The first poll primes
`DATA_DIR/feed-state.json`; later polls append upstream activity to
`DATA_DIR/feed-events.jsonl`. Targets using `mode: "fork_sync"` append legacy
work to `DATA_DIR/feed-jobs.jsonl`. Targets using `mode: "flow_dispatch"`
append generic flow events to `DATA_DIR/flow-events.jsonl`, POST them to the
configured dispatch URL, and record dispatch outcomes in
`DATA_DIR/flow-dispatches.jsonl`.
