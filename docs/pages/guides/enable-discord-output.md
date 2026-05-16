---
title: Enable Discord output
description: Send selected upstream signals to a Discord webhook.
---

# Enable Discord output

Discord notifications are disabled by default.

```bash
DISCORD_OUTPUT_ENABLED=true
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_NOTIFY_EVENTS=push,release
```

`DISCORD_NOTIFY_EVENTS` is a comma-separated allow list. Patch still stores feed
signals when Discord is disabled or when an event is not in the allow list.

Notifications include provider, repository, event type, branch, author, short
SHA, queued job kind, and source id when those fields are available.
