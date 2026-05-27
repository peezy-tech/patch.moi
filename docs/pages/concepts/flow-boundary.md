---
title: Automation boundary
description: What patch.moi, codex-flows, workspace backends, runners, and release channels own.
---

# Automation Boundary

patch.moi uses automation events to start portable work, but an automation event is not the
whole product model. The event says "this upstream thing happened." patch.moi
must still know which patch work it belongs to, which attempt handled it, which workspace runs were created,
which candidate refs appeared, and whether review or intervention is required.

## Layer Contract

| Layer | Owns |
| --- | --- |
| patch.moi intake | feed sources, feed cursors, normalized update signals |
| patch.moi orchestration | patch work, deterministic events, dispatch/retry/replay records, patch attempts, candidate refs, review state |
| codex-flows automations | named script discovery, module return values, turn host APIs |
| Codex workspace backend | app-server bridge, delegation, remote turn host |
| local workspace or forge runner | Git operations, conflict resolution, verification, candidate ref creation |
| release channel | internal artifacts, public publishing, rollout, rollback, trusted publishing policy |

Keeping these layers separate lets patch.moi retry or replay a trigger without
pretending that the trigger itself contains the maintained fork lifecycle.

## Event Contract

For patch.moi-dispatched update work, `event.id` is the trigger idempotency key. Feed
targets create deterministic ids such as:

```text
patch:<sourceId>:<entryId>:<eventType>
```

The event should include enough payload for an automation or backend workspace
to identify the upstream update. The receiving workspace still reads Git and
forge state to discover the maintained branch, patch commits, candidate refs,
and current checks.

## Automation Execution Surfaces

patch.moi supports explicit named automations without requiring a separate flow
runner:

| Surface | How patch.moi selects it | Run state |
| --- | --- | --- |
| local app-server | operator passes `--allow-local` without a backend URL | patch.moi `DATA_DIR` |
| local workspace WebSocket | `PATCH_WORKSPACE_BACKEND_URL` starts with `ws://` or `wss://` | patch.moi `DATA_DIR` plus backend thread state |
| SSH remote agent | `PATCH_WORKSPACE_SSH_TARGET` or target `sshTarget` is set | patch.moi `DATA_DIR` plus remote Codex thread state |

A persistent workspace backend remains optional and local/co-located. Use SSH
for remote hosts. Use forge runners for service-mode patch-work checkouts.

In every case patch.moi writes its own patch-work, dispatch, and patch-attempt records
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
`kind = "automation"` smoke task for operator experiments. In codex-flows,
workspace-owned automation tasks synthesize unique
`id`, `occurredAt`, and `receivedAt` fields for every run. Those ids are useful
for workspace automation, but patch.moi must not use workspace-generated ids
for feed-owned patch work and patch attempts.

The generated local state under `.codex/workspace/local/` is run history for
the operator automation surface. It does not replace `DATA_DIR` feed events,
patch work, workspace dispatches, or patch attempts.
