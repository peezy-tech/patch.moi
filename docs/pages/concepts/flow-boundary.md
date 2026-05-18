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

## Flow Execution Surfaces

patch.moi supports the codex-flows flow surfaces without requiring any one of
them to be running on this checkout:

| Surface | How patch.moi selects it | Run state |
| --- | --- | --- |
| synchronous local | no backend URL and no Actions mode | in-process local client state |
| Actions/local | `CODEX_WORKSPACE_MODE=actions` or `GITHUB_ACTIONS=true` and no backend URL | `.codex/workspace/actions/flow-client` |
| workspace HTTP | `PATCH_WORKSPACE_BACKEND_URL`, `PATCH_FLOW_BACKEND_URL`, or `PATCH_FLOW_DISPATCH_URL` is an HTTP URL | backend-owned |
| workspace WebSocket | configured workspace URL starts with `ws://` or `wss://` | backend-owned |

The Actions/local surface is the no-running-backend path for semi-autonomous
fork maintenance in CI. A persistent workspace backend remains optional: use it
when a host, service, or gateway needs durable run inspection, app-server
pass-through, or remote dispatch/replay control.

In every case patch.moi writes its own dispatch and maintenance-attempt records
under `DATA_DIR`.

Workspace backend run state is useful for inspection and sync. It is not the
authoritative patch.moi product state.

## Repo-Native Workspace Automation

`.codex/workspace.toml` is optional repo automation for operators. In this repo,
the first task is a manual command task that runs the existing harness fixture:

```bash
bun run workspace:run:harness
```

That task remains deliberately `kind = "command"`, because it is the no-backend
local harness path. The repository also includes an explicit manual
`kind = "flow"` smoke task for operator experiments:

```bash
bun run workspace:run:harness-flow
```

That flow task requires a running workspace backend URL for the repo-native
workspace automation command. In codex-flows, workspace-owned flow tasks synthesize unique
`id`, `occurredAt`, and `receivedAt` fields for every run. Those ids are useful
for workspace automation, but patch.moi must not use workspace-generated ids
for feed-owned maintenance attempts.

The generated local state under `.codex/workspace/local/` is run history for
the operator automation surface. It does not replace `DATA_DIR` feed events,
workspace dispatches, or maintenance attempts.
