---
title: Flow boundary
description: What patch.moi owns versus codex-flows and the forge.
---

# Flow boundary

patch.moi is not the runner orchestrator.

| Concern | Owner |
| --- | --- |
| Local patch branch capture | patch.moi |
| Maintained branch rebuild | patch.moi |
| Candidate ref listing and fast-forward pickup | patch.moi |
| Runner dispatch | codex-flows or forge |
| Retry/replay | codex-flows or forge |
| Thread ids and transplant | codex-flows |
| Remote/mobile control | Codex app-server or codex-flows |
| Checks, artifacts, PR review | forge |

The handoff between systems is Git. Runners publish branches, checks, artifacts,
and thread metadata; local operators fetch refs, inspect them with patch.moi,
and continue threads through codex-flows when needed.
