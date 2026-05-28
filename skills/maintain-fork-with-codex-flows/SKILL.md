---
name: "patch-moi:maintain-fork-with-codex-flows"
description: "Maintain a patch.moi fork through codex-flows automation templates while patch.moi remains Git-only porcelain."
---

# Maintain Fork With codex-flows

Use this workflow when upkeep should run on codex-flows or a forge runner, but
the actual patch-stack operations are still patch.moi Git commands.

## Workflow

1. Confirm the patch.moi codex-flows templates are installed in the workspace.
2. Run or trigger `patch-moi-maintain-fork` through codex-flows, passing an
   event payload with the repo path, upstream/release details, and optional
   existing `threadId`.
3. The automation starts a Codex turn with the patch.moi fork-maintenance prompt.
4. Inside that turn, inspect Git refs with patch.moi, rebuild only when safety
   gates allow mutation, and publish any candidate refs/checks/artifacts through
   codex-flows or the forge.
5. Use codex-flows for retry/replay, thread metadata, and thread transplant.
   patch.moi should only fetch, inspect, capture, rebuild, and pull Git refs.

Processedness is determined by Git refs, commits, checks, artifacts, and
codex-flows or forge state, not patch.moi JSONL files.
