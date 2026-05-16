---
title: Flow boundary
description: What patch.moi, codex-flows, workspace backends, runners, and release channels own.
---

# Flow Boundary

patch.moi uses flow events to start portable work, but a flow event is not the
whole product model. The event says "this upstream thing happened." patch.moi
must still know which attempt handled it, which workspace runs were created,
which candidate refs appeared, and whether review or intervention is required.

## Layer Contract

| Layer | Owns |
| --- | --- |
| patch.moi intake | feed sources, feed cursors, normalized update signals |
| patch.moi orchestration | deterministic events, dispatch/retry/replay records, maintenance attempts, candidate refs, review state |
| codex-flows and flow-runtime | event matching, payload schema checks, step execution, `FLOW_RESULT` |
| Codex workspace backend | app-server bridge, delegation, flow transport, backend run inspection |
| local workspace or forge runner | Git operations, conflict resolution, verification, candidate ref creation |
| release channel | internal artifacts, public publishing, rollout, rollback, trusted publishing policy |

Keeping these layers separate lets patch.moi retry or replay a trigger without
pretending that the trigger itself contains the maintained fork lifecycle.

## Event Contract

For patch.moi-dispatched maintenance, `event.id` is the idempotency key. Feed
targets create deterministic ids such as:

```text
patch:<sourceId>:<entryId>:<eventType>
```

The event should include enough payload for a flow package or backend workspace
to identify the upstream update. The receiving workspace still reads Git and
forge state to discover the maintained branch, patch commits, candidate refs,
and current checks.

## Workspace Backends

When `PATCH_WORKSPACE_BACKEND_URL` is unset, patch.moi uses local flow
execution from the process working directory. When it is set to an HTTP or
WebSocket URL, patch.moi dispatches to that Codex workspace backend. In both
cases patch.moi writes its own dispatch and maintenance-attempt records under
`DATA_DIR`.

Workspace backend run state is useful for inspection and sync. It is not the
authoritative patch.moi product state.

## Repo-Native Workspace Automation

`.codex/workspace.toml` is optional repo automation for operators. In this repo,
the first task is a manual command task that runs the existing harness fixture:

```bash
bun run workspace:run:harness
```

That task is deliberately `kind = "command"`, not an implicit workspace
`kind = "flow"` task. Released workspace flow fallback behavior must not be
treated as a source of patch.moi's deterministic `id`, `occurredAt`, or
`receivedAt`; a future flow task must supply a complete explicit event.

The sibling `../codex-flows` workspace currently has an unreleased fix that
synthesizes those event fields for workspace-owned flow tasks. patch.moi should
not rely on that behavior until it is available in a published
`@peezy.tech/codex-flows` release, and it should not use workspace-generated
event ids for feed-owned maintenance attempts.

The generated local state under `.codex/workspace/local/` is run history for
the operator automation surface. It does not replace `DATA_DIR` feed events,
workspace dispatches, or maintenance attempts.
