---
title: MCP
description: Local Codex tool server for patch.moi Git inspection and gated mutations.
---

# MCP

The MCP server exposes patch.moi to Codex as local tools. It starts through
`scripts/patch-moi-mcp-bootstrap.ts` from the Codex plugin manifest.

## Tools

| Tool | Mode |
|------|------|
| `git_discover` | Read |
| `fetch_upstream` | Gated fetch |
| `work_start_feature` | Gated by clean Git state through the helper it calls |
| `patch_doctor` | Read |
| `patch_list` | Read |
| `patch_candidates` | Read |
| `patch_capture` | Gated mutation |
| `patch_rebuild` | Gated mutation |
| `patch_pull` | Gated mutation |

`patch_list` returns local and remote-tracking patch refs with inferred base,
independent or stacked status, and dependencies.

## Runtime

```bash
bun run mcp
```

Codex usually starts the server through the installed plugin. Direct local runs
are useful during development.

## Boundary

MCP owns Codex tool access to patch.moi. It does not add patch.moi state. Runner
history, thread movement, retry and replay, and remote workbench control stay in
codex-toys or the forge.
