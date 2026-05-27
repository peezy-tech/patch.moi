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

## Automation Events

```text
GET /automation-events?type=<type>&limit=<n>
GET /automation-events/:id?limit=<n>
POST /automation-events/:id/retry
POST /automation-events/:id/replay
```

The list endpoint returns stored events newest first. The detail endpoint
returns the event and matching dispatch records.

These endpoints inspect update triggers and dispatch attempts. They do not
inspect or modify Git patch stacks directly.

## Maintenance attempts

```text
GET /maintenance-attempts?eventId=<id>&status=<status>&limit=<n>
GET /maintenance-attempts/:id
POST /maintenance-attempts/:id/sync
```

`status` can be `started`, `completed`, `changed`, `needs_intervention`,
`blocked`, `failed`, or `skipped`.

Maintenance attempts are patch.moi-owned product records. They link an
upstream update trigger to workspace run ids and candidate refs without copying
workspace backend run state into patch.moi. `sync` reads the configured
workspace backend run results, extracts patch.moi outcome fields such as
candidate refs, and appends the latest attempt state.

## Dispatches

```text
GET /workspace-dispatches?eventId=<id>&status=dispatched|failed|skipped&limit=<n>
GET /automation-dispatches?eventId=<id>&status=dispatched|failed|skipped&limit=<n>
```

`/automation-dispatches` is a compatibility alias for older operators.

## Workspace inspection

```text
GET /workspace-events?type=<type>&limit=<n>
GET /workspace-events/:id
GET /workspace-runs?eventId=<id>&status=<status>&limit=<n>
GET /workspace-runs/:id
```

These endpoints proxy configured workspace backend run state when available. They
inspect backend-owned event and run state; patch.moi still owns update intake
and maintenance attempt records.

## Admin auth

When `PATCH_ADMIN_TOKEN` is set, automation and workspace endpoints require one of:

```text
Authorization: Bearer <token>
X-Patch-Admin-Token: <token>
```
