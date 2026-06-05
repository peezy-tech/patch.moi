---
title: Upstream
description: Configured remote-tracking base refs for patch ranges and maintained branches.
---

# Upstream

Upstream is the Git base for fork maintenance. patch.moi resolves it from
configuration as `refs/remotes/<upstreamRemote>/<upstreamBranch>` unless a
command receives an explicit base or upstream ref.

The default upstream ref is `refs/remotes/upstream/main`.

## Config

```toml
[git]
upstreamRemote = "upstream"
upstreamBranch = "main"
forkRemote = "origin"
targetBranch = "main"
patchPrefix = "patch/"
```

patch.moi does not require a local branch named `upstream`. It expects the
remote-tracking ref to exist.

## Commands

```bash
bun run patch.moi -- setup fork --repo <fork> --upstream-url <url> --apply --json
bun run patch.moi -- patch doctor --repo <fork> --json
bun run patch.moi -- patch list --repo <fork> --base refs/remotes/upstream/main --json
```

The CLI does not fetch upstream directly. The MCP tool `fetch_upstream` can
fetch when `[fetch].allowFetch=true` or `PATCH_MOI_ALLOW_FETCH=1` is set.

## Boundary

Upstream owns only the base ref patch.moi compares against. Products own which
upstream project, branch, tag, or release branch is considered the base for a
given fork.
