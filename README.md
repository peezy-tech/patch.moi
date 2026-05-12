# git-webhooks

Containerized Bun service for GitHub and jojo.build webhooks.

## Endpoints

```text
GET  /healthz
POST /git-webhooks/jojo
POST /git-webhooks/github
```

## Environment

```text
HOST=0.0.0.0
PORT=3000
DATA_DIR=/app/data
JOJO_WEBHOOK_SECRET=...
GITHUB_WEBHOOK_SECRET=...
DISCORD_WEBHOOK_URL=
DISCORD_NOTIFY_EVENTS=push,pull_request,release
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
