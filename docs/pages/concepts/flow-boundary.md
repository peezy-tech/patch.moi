---
title: Flow boundary
description: What patch.moi owns versus codex-toys and the forge.
---

# Flow boundary

patch.moi is not the runner orchestrator.

| Concern | Owner |
| --- | --- |
| Local patch branch capture | patch.moi |
| Maintained branch rebuild | patch.moi |
| Candidate ref listing and fast-forward pickup | patch.moi |
| Reusable patch-stack automation templates | patch.moi, installed and run by codex-toys |
| Runner dispatch | codex-toys or forge |
| Retry/replay | codex-toys or forge |
| Thread ids and transplant | codex-toys |
| Remote/dashboard surfaces | codex-toys or forge |
| Checks, artifacts, PR review | forge |

The handoff between systems is Git. Runners publish branches, checks, artifacts,
and thread metadata; local operators fetch refs, inspect them with patch.moi,
and continue threads through codex-toys when needed.

The template handoff is also explicit: patch.moi owns the recipe files under
`templates/codex-toys`, while codex-toys owns installing, running, retrying,
and recording the resulting turns.
