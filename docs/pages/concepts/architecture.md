---
title: Architecture
description: How feeds, targets, state, and flow dispatch fit together.
---

# Architecture

Patch has three runtime pieces:

- The HTTP server exposes health and admin flow endpoints.
- The feed poller reads configured upstream feeds on an interval.
- The JSONL store keeps feed signals, fork-sync jobs, flow events, and dispatch
  outcomes under `DATA_DIR`.

The poller does not know how to complete product-specific work. It only turns a
feed entry into a normalized signal and follows the target configured for that
source.

Flow targets create a generic `FlowEvent` and use the shared flow client. That
client gives Patch the same contract in local development and in HTTP-backed
service mode.
