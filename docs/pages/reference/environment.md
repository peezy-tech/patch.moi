---
title: Environment
description: Runtime environment variables used by Patch.
---

# Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Server bind host. |
| `PORT` | `3000` | Server port. |
| `DATA_DIR` | `./data` | Directory for JSONL state files. |
| `FEED_SOURCES_PATH` | unset | Enables feed polling from the configured JSON file. |
| `PATCH_ADMIN_TOKEN` | unset | Protects admin flow endpoints when set. |
| `PATCH_FLOW_DISPATCH_URL` | unset | Default flow backend URL for dispatch targets. |
| `PATCH_FLOW_BACKEND_URL` | unset | Alternate default backend base URL. |
| `PATCH_FLOW_DISPATCH_SECRET` | unset | HMAC secret for HTTP flow dispatch. |
| `DISCORD_OUTPUT_ENABLED` | `false` | Enables Discord webhook output. |
| `DISCORD_WEBHOOK_URL` | unset | Discord webhook target. |
| `DISCORD_NOTIFY_EVENTS` | `push,release` | Comma-separated notification allow list. |
| `CODEX_APP_SERVER_CODEX_COMMAND` | unset | Passed to local code-mode flow execution. |
| `CODEX_HOME` | unset | Passed to local code-mode flow execution. |

Feed target fields can override backend settings with `dispatchUrl`,
`dispatchUrlEnv`, and `dispatchSecretEnv`.
