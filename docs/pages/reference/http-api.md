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

## Patch Work

```text
GET /patch-work?kind=<kind>&status=<status>&limit=<n>
GET /patch-work/:id
POST /patch-work
```

Patch work records track feature, maintenance, or release work across attempts.
They hold the title, repo, base ref, work branch, patch branch, candidate refs,
linked attempt ids, and current status.

## Patch Attempts

```text
GET /patch-attempts?eventId=<id>&workId=<id>&kind=<kind>&status=<status>&limit=<n>
GET /patch-attempts/:id
POST /patch-attempts/:id/sync
```

`status` can be `started`, `completed`, `changed`, `needs_intervention`,
`blocked`, `failed`, or `skipped`.

Patch attempts are patch.moi-owned product records. They link patch work to
automation events, workspace run ids, thread refs, candidate refs, and outcomes
without copying workspace backend run state into patch.moi. `sync` reads the
configured workspace backend run results, extracts patch.moi outcome fields such
as candidate refs, and appends the latest attempt state.

## Dispatches

```text
GET /workspace-dispatches?eventId=<id>&status=dispatched|failed|skipped&limit=<n>
```

## Workspace inspection

```text
GET /workspace-events?type=<type>&limit=<n>
GET /workspace-events/:id
GET /workspace-runs?eventId=<id>&status=<status>&limit=<n>
GET /workspace-runs/:id
```

These endpoints proxy configured workspace backend run state when available. They
inspect backend-owned event and run state; patch.moi still owns update intake
and patch attempt records.

## Admin auth

When `PATCH_ADMIN_TOKEN` is set, automation and workspace endpoints require one of:

```text
Authorization: Bearer <token>
X-Patch-Admin-Token: <token>
```
