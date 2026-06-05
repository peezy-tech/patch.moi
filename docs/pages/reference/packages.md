---
title: Packages
description: patch.moi workspace package map.
---

# Packages

This repository is a Bun workspace.

| Package | Purpose |
|---------|---------|
| `@peezy.tech/patch` | CLI and MCP server implementation in `apps/patch`. |
| `@peezy.tech/patch-docs` | Tome documentation site in `docs`. |
| `patch-moi` | Root workspace scripts and local development entrypoint. |

## Scripts

```bash
bun install
bun run patch.moi -- patch doctor --repo <fork> --json
bun run mcp
bun run check
bun run release:check
bun run docs:build
```

## Plugin Files

```text
.codex-plugin/plugin.json
.mcp.json
skills/
templates/codex-toys/
```

## Boundary

The workspace packages are local development surfaces. Public plugin metadata
and marketplace entries define how Codex installs patch.moi guidance.
