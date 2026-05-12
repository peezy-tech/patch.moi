# patchbay

Containerized Bun service for GitHub and jojo.build webhooks.

## Endpoints

```text
GET  /healthz
POST /patchbay/jojo
POST /patchbay/github
```

Existing `/git-webhooks/jojo` and `/git-webhooks/github` routes remain
compatibility aliases for existing webhook registrations.

## Environment

```text
HOST=0.0.0.0
PORT=3000
DATA_DIR=/app/data
JOJO_WEBHOOK_SECRET=...
GITHUB_WEBHOOK_SECRET=...
DISCORD_WEBHOOK_URL=
DISCORD_NOTIFY_EVENTS=push,pull_request,release
FEED_SOURCES_PATH=./feed-sources.json
```

Discord notifications are optional. When `DISCORD_WEBHOOK_URL` is unset, the
service skips Discord output. `DISCORD_NOTIFY_EVENTS` is a comma-separated
allow list and defaults to `push,pull_request,release`.

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
`DATA_DIR/feed-events.jsonl` and release-triggered fork sync work to
`DATA_DIR/feed-jobs.jsonl`.
