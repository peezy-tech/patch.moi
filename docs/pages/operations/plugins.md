---
title: Plugins
description: Install and refresh patch.moi Codex-facing guidance.
---

# Plugins

The patch.moi plugin installs local skills and the MCP server definition for
Codex. The npm/Bun workspace installs the CLI and test runtime.

## Local Marketplace

```bash
codex plugin marketplace add /home/peezy/repos/patch.moi
codex plugin add patch-moi@patch-moi
```

Start a new Codex thread after installing or upgrading the plugin.

## Runtime Requirements

Codex needs `git` and `bun` on the PATH visible to Codex App. The MCP bootstrap
runs `bun install --frozen-lockfile` in the installed plugin cache the first
time the server starts.

## Updating

After changing plugin metadata, MCP tools, or skills:

```bash
codex plugin marketplace add /home/peezy/repos/patch.moi
codex plugin add patch-moi@patch-moi
```

Then start a new thread so Codex reloads available skills and tools.

## Boundary

Plugin install does not start a service. It gives Codex local guidance and a
stdio MCP server. patch.moi commands still run against explicit Git repos.
