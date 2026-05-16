---
title: HTTP API
description: Health, flow event inspection, retry, replay, and dispatch history.
---

# HTTP API

## Health

```text
GET /healthz
```

Returns `ok`.

## Flow events

```text
GET /flow-events?type=<type>&limit=<n>
GET /flow-events/:id?limit=<n>
POST /flow-events/:id/retry
POST /flow-events/:id/replay
```

The list endpoint returns stored events newest first. The detail endpoint
returns the event and matching dispatch records.

## Dispatches

```text
GET /flow-dispatches?eventId=<id>&status=dispatched|failed|skipped&limit=<n>
```

## Admin auth

When `PATCH_ADMIN_TOKEN` is set, flow endpoints require one of:

```text
Authorization: Bearer <token>
X-Patch-Admin-Token: <token>
```
