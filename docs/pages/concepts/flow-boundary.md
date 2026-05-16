---
title: Flow boundary
description: What patch.moi owns, what codex-flow owns, and where workspace backend orchestration belongs.
---

# Flow boundary

patch.moi owns upstream observation and patch-stack orchestration. It knows
about feed sources, update signals, maintained repositories, remote branches,
workflow runs, dispatch attempts, and operator-visible state.

codex-flow owns portable event execution. Flow packages match `FlowEvent.type`
and payload schema, run Bun or Code Mode steps, and emit `FLOW_RESULT`.

The Codex workspace backend owns workspace control surfaces: app-server
pass-through, delegation, flow execution transport, workbench state, and the
HTTP/WebSocket protocol around those capabilities. patch.moi should use that
surface instead of redefining it.

The boundary should stay narrow:

| Layer | Owns |
| --- | --- |
| patch.moi intake | feeds, source ids, feed state, update records |
| patch.moi orchestration | maintained repo selection, remote branch policy, workflow triggers, retry and review state |
| codex-flow | generic event matching, step execution, run state, `FLOW_RESULT` |
| codex workspace backend | workspace transport, app-server bridge, delegation, flow HTTP routes |
| local workspace or forge runner | git operations, conflict resolution, checks, candidate refs |
| release channel | deploy, publish, trusted publishing, rollback policy |

## Flow Events Are Triggers

A generic `upstream.release` event is a good trigger. It should not become the
whole product model.

patch.moi should be able to say: this upstream release produced this workflow
run, which produced this candidate branch, which was used by this internal build
or public release. A single flow event cannot hold that lifecycle cleanly.

## Service State

A patch.moi service backend is useful when patch.moi needs to coordinate a
remote forge, human intervention, and operator surfaces. That backend can own
patch.moi-specific service state while still dispatching generic flow events to
the Codex workspace backend where it fits.

The rule is simple: use flow events for portable automation triggers, and use a
patch.moi service for patch-stack product state: remote refs, workflow runs,
pull requests, issues, checks, artifacts, and review status.
