---
title: HTTP API
description: Health, update-trigger inspection, retry, replay, and dispatch history.
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

These endpoints inspect update triggers and dispatch attempts. They do not
inspect or modify Git patch stacks directly.

## Maintenance attempts

```text
GET /maintenance-attempts?eventId=<id>&status=started|failed|skipped&limit=<n>
```

Maintenance attempts are patch.moi-owned product records. They link an
upstream update trigger to workspace run ids and candidate refs without copying
workspace backend run state into patch.moi.

## Dispatches

```text
GET /workspace-dispatches?eventId=<id>&status=dispatched|failed|skipped&limit=<n>
GET /flow-dispatches?eventId=<id>&status=dispatched|failed|skipped&limit=<n>
```

`/flow-dispatches` is a compatibility alias for older operators.

## Workspace inspection

```text
GET /workspace-events?type=<type>&limit=<n>
GET /workspace-events/:id
GET /workspace-runs?eventId=<id>&status=<status>&limit=<n>
GET /workspace-runs/:id
```

These endpoints proxy the configured workspace backend flow capability. They
inspect backend-owned event and run state; patch.moi still owns update intake
and maintenance attempt records.

## Admin auth

When `PATCH_ADMIN_TOKEN` is set, flow and workspace endpoints require one of:

```text
Authorization: Bearer <token>
X-Patch-Admin-Token: <token>
```
