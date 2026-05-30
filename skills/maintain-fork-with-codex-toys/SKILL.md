---
name: "patch-moi:maintain-fork-with-codex-toys"
description: "Maintain a patch.moi fork through codex-toys automation templates while patch.moi remains Git-only porcelain."
---

# Maintain Fork With codex-toys

Use this workflow when upkeep should run on codex-toys or a forge runner, but
the actual patch-stack operations are still patch.moi Git commands.

## Workflow

1. Confirm the patch.moi codex-toys templates are installed in the workspace.
2. Run or trigger `patch-moi-maintain-fork` through codex-toys, passing an
   event payload with the repo path, upstream/release details, and optional
   existing `threadId`.
3. The automation starts a Codex turn with the patch.moi fork-maintenance prompt.
4. Inside that turn, inspect Git refs with patch.moi, rebuild only when safety
   gates allow mutation, and publish any candidate refs/checks/artifacts through
   codex-toys or the forge.
5. Use codex-toys for retry/replay, thread metadata, and thread transplant.
   patch.moi should only fetch, inspect, capture, rebuild, and pull Git refs.

Processedness is determined by Git refs, commits, checks, artifacts, and
codex-toys or forge state, not patch.moi JSONL files.
