---
title: JSONL state
description: Operational records written under DATA_DIR.
---

# JSONL state

Patch uses append-only JSONL files for durable service records. These files are
operational state. They are not the patch stack.

| File | Contents |
| --- | --- |
| `feed-state.json` | Per-source last seen entry and last checked timestamp. |
| `feed-events.jsonl` | Normalized `FeedSignal` records. |
| `automation-events.jsonl` | Generic `AutomationEvent` records emitted by automation targets. |
| `maintenance-attempts.jsonl` | patch.moi-owned attempt records linking update events to workspace run ids, outcomes, and candidate refs. |
| `workspace-dispatches.jsonl` | Workspace dispatch, retry, replay, and failure records. |
| `automation-dispatches.jsonl` | Legacy dispatch record file read for compatibility. |

Admin endpoints read `automation-events.jsonl`, `maintenance-attempts.jsonl`,
`workspace-dispatches.jsonl`, and the legacy `automation-dispatches.jsonl` file. The
feed poller appends to all relevant files as it accepts new feed entries.
Maintenance attempt sync also appends updated records; admin list endpoints show
the latest record for each attempt id.

If a runner checkout is lost, patch.moi should be able to recreate the
maintenance context from remote Git refs and forge records. JSONL state explains
feed, attempt, and dispatch history; Git and the forge remain the source of
truth for patch contents and review state.

## Codex Workspace State

`codex-flows workspace` commands write operator run state under
`.codex/workspace/<mode>`. Local state under `.codex/workspace/local/` is
ignored by Git. Actions state under `.codex/workspace/actions/` is reserved for
future CI or service use, where committing selected workspace state may be
intentional.
