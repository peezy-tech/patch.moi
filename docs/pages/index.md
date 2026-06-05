---
title: patch.moi
description: Primitive-first documentation for Git-native fork maintenance, reusable patch refs, local commands, MCP tools, and codex-toys workflow recipes.
---

# patch.moi

`patch.moi` is Git-first porcelain for maintaining forks on top of upstream
projects. It treats upstream refs, patch refs, maintained branches, candidate
refs, commits, ancestry, and stable patch-ids as the durable product model.

There is no patch registry, manifest, database, feed cursor, runner history, or
patch metadata file. Reusable patches are Git refs under `patch/*`. Maintained
branches are ordered compositions of those refs. Release branches and tags are
snapshots.

## Primitive Map

| Primitive | Owns | Start here |
|-----------|------|------------|
| Upstream | The configured remote-tracking base used for patch ranges and rebuilds. | [Upstream](primitives/upstream) |
| Patch Refs | Reusable local or remote-tracking `patch/*` refs, inferred base, status, and dependencies. | [Patch refs](primitives/patch-refs) |
| Maintained Branches | Product branches assembled from upstream plus patch refs. | [Maintained branches](primitives/maintained-branches) |
| Candidate Refs | Runner-produced branch refs such as `candidate/*`. | [Candidate refs](primitives/candidate-refs) |
| Safety Gates | Fail-closed policy for writes and network fetches. | [Safety gates](primitives/safety-gates) |

## Components

| Component | Owns | Start here |
|-----------|------|------------|
| CLI | Local command porcelain over Git. | [CLI](components/cli) |
| MCP | Local Codex tool server for Git inspection and gated fork mutations. | [MCP](components/mcp) |
| Codex Plugin | Codex-facing skills and MCP bootstrap metadata. | [Codex plugin](components/codex-plugin) |
| Templates | codex-toys workflow recipes shipped as a kit. | [Templates](components/templates) |
| Config | `.patchmoi.toml` defaults and policy overrides. | [Config](components/config) |

## Guides

| Guide | Use it when |
|-------|-------------|
| [Setup fork](guides/setup-fork) | A checkout needs upstream/fork remotes and a known target branch. |
| [Develop feature patch](guides/develop-feature-patch) | Local feature work should become an independent `patch/*` ref. |
| [Share patch](guides/share-patch) | A consumer should inspect, test, or apply one reusable patch ref. |
| [Maintain fork](guides/maintain-fork) | A product branch should be rebuilt from upstream and patch refs. |
| [Pick up candidate](guides/pick-up-candidate) | Runner output should be fast-forwarded from a Git ref. |
| [codex-toys workflows](guides/codex-toys-workflows) | A workbench should install patch.moi workflow recipes. |

## Operations

| Operation | Owns | Start here |
|-----------|------|------------|
| Git Hygiene | Clean worktrees, remote-tracking refs, and no patch.moi state files. | [Git hygiene](operations/git-hygiene) |
| Plugins | Codex plugin install and local development surfaces. | [Plugins](operations/plugins) |

## First Commands

```bash
bun run patch.moi -- patch doctor --repo <fork> --json
bun run patch.moi -- patch list --repo <fork> --json
bun run patch.moi -- patch inspect patch/010-example --repo <fork> --json
bun run patch.moi -- patch test-apply patch/010-example --repo <fork> --to main --json
PATCH_MOI_ALLOW_APPLY=1 bun run patch.moi -- patch apply patch/010-example --repo <fork> --to feature/test --create-branch --json
PATCH_MOI_ALLOW_REBUILD=1 bun run patch.moi -- patch rebuild --repo <fork> --to main --json
bun run patch.moi -- patch explain --repo <fork> --branch main --upstream refs/remotes/upstream/main --json
```

## Runtime Shape

CLI commands run locally against a Git repository. The MCP server exposes the
same local model to Codex through stdio. codex-toys templates can start Codex
turns that call patch.moi, but codex-toys owns workflow execution, thread ids,
retry and replay, feeds, schedules, remote workbenches, dashboards, and
artifacts.

## Boundary

patch.moi owns Git-native fork mechanics:

- discovering upstream and fork readiness
- listing, inspecting, testing, applying, capturing, and rebuilding patch refs
- explaining maintained branches by stable patch-id
- listing and fast-forwarding candidate refs
- shipping Codex plugin guidance and codex-toys workflow recipes

Products own upstream choice, patch naming, release policy, source catalogs,
review criteria, deployment decisions, and public sharing UX.
