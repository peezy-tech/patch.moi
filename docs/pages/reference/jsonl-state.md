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
| `flow-events.jsonl` | Generic `FlowEvent` records emitted by flow targets. |
| `flow-dispatches.jsonl` | Dispatch, retry, replay, and failure records. |

Admin endpoints read `flow-events.jsonl` and `flow-dispatches.jsonl`. The feed
poller appends to all relevant files as it accepts new feed entries.

If a runner checkout is lost, patch.moi should be able to recreate the
maintenance context from remote Git refs and forge records. JSONL state explains
feed and dispatch history; Git and the forge remain the source of truth for
patch contents and review state.
