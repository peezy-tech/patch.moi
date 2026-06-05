---
title: Codex Plugin
description: Codex-facing skills, MCP server metadata, and local install paths.
---

# Codex Plugin

The patch.moi plugin installs Codex-facing skills and the MCP server definition.
It does not start a background service.

## Source Layout

```text
.codex-plugin/plugin.json
.mcp.json
skills/*/SKILL.md
.agents/plugins/marketplace.json
```

## Local Development Install

```bash
codex plugin marketplace add /home/peezy/repos/patch.moi
codex plugin add patch-moi@patch-moi
```

Start a new Codex thread after installing or upgrading the plugin so Codex
reloads the skills and tools.

## Skills

| Skill | Use it for |
|-------|------------|
| `develop-feature` | Create or select a feature branch, capture it into `patch/*`, and rebuild the maintained branch. |
| `inspect-upstream-release` | Inspect upstream release movement without mutating fork state. |
| `maintain-fork` | Maintain a Git-first fork with patch.moi commands. |
| `maintain-fork-with-codex-toys` | Run maintenance through codex-toys workflow recipes. |
| `pickup-runner-candidate` | Fast-forward runner-produced candidate refs. |
| `install-codex-toys-templates` | Install patch.moi workflow templates into a workbench. |

## Boundary

The plugin owns Codex-facing guidance and MCP startup. The CLI owns Git
operations. codex-toys owns durable workflow execution.
