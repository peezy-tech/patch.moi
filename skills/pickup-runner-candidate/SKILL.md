---
name: "patch-moi:pickup-runner-candidate"
description: "Pick up runner-produced candidate refs with patch.moi while leaving run and thread state in codex-toys or the forge."
---

# Pick Up Runner Candidate

Use this workflow when a runner has published a Git candidate branch or tag and
the local operator wants to inspect or fast-forward it.

## Workflow

1. Fetch the relevant remote through normal Git or workspace policy.
2. List local and remote-tracking candidates with `patch_candidates`.
3. Inspect the candidate with Git comparison commands and forge checks.
4. Pull only with explicit policy:
   `PATCH_MOI_ALLOW_PULL=1 patch.moi patch pull --repo DIR --remote REMOTE --branch BRANCH --json`
5. If the runner produced a Codex thread id or rollout artifact, use
   codex-toys `threads inspect`, `threads transplant`, or related thread tools.

patch.moi does not infer runner history, query runner APIs, or store thread ids.
The Git ref is the handoff artifact for patch.moi.
