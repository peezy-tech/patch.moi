---
title: JSONL state
description: Files written under DATA_DIR.
---

# JSONL state

Patch uses append-only JSONL files for durable service records.

| File | Contents |
| --- | --- |
| `feed-state.json` | Per-source last seen entry and last checked timestamp. |
| `feed-events.jsonl` | Normalized `FeedSignal` records. |
| `feed-jobs.jsonl` | Legacy `fork_sync` jobs emitted from release signals. |
| `flow-events.jsonl` | Generic `FlowEvent` records emitted by flow targets. |
| `flow-dispatches.jsonl` | Dispatch, retry, replay, and failure records. |

Admin endpoints read `flow-events.jsonl` and `flow-dispatches.jsonl`. The feed
poller appends to all relevant files as it accepts new feed entries.
