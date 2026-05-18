---
title: Git source of truth
description: Why patch.moi uses remotes, branches, tags, and commits as the project model.
---

# Git Source Of Truth

patch.moi should not invent a second project format for patch stacks. The
maintained repository and its forge records are already the best source of
truth:

- remotes say where upstream and the maintained fork live
- branches say which patch stack is being maintained
- tags say which upstream or downstream release point is being targeted
- commits are the patch inventory
- worktrees, local workspaces, and runner checkouts are disposable execution
  surfaces

This matters because patch.moi is meant to maintain open source forks, not hide
them behind an application database.

## Required Facts

A maintained project needs these facts to be discoverable from Git:

| Fact | Typical expression |
| --- | --- |
| Upstream project | `upstream` remote |
| Maintained fork | `origin` remote |
| Upstream release point | upstream tag or branch |
| Maintained output | local or remote `main` branch |
| Upstream branch mirror | local or remote `upstream` branch |
| Patch inventory | ordered `patch/*` branch tips |
| Candidate output | downstream branch, tag, check, or artifact |

Names can be configured by the operator or service, but the facts should still
resolve to Git refs.

## What patch.moi Stores

patch.moi stores operational state:

- feed cursors
- normalized upstream signals
- dispatched flow events
- dispatch outcomes
- workspace run status
- retry and replay history
- operator-facing notes or intervention state

That state explains what happened. It is not the patch stack itself, and it
does not replace workspace backend run state or forge records.

## Local Mode

When patch.moi runs locally, the current checkout can be the project model. The
service, harness flow, or repo-native workspace command should inspect remotes
and branches, then add missing remotes only when the operator confirms or
supplied enough information.

The default happy path is:

```bash
git remote get-url upstream
git remote get-url origin
git branch --show-current
git fetch upstream --tags --prune
```

If the upstream remote is missing, patch.moi can help add it. If the fork remote
is missing, patch.moi can help point `origin` or another chosen remote at the
maintained fork.

A cloned GitHub fork commonly starts with only `origin` set to the user's fork.
That is a valid initial shape. patch.moi can use provider metadata to discover
the parent repository, then materialize that discovery into Git by adding an
`upstream` remote and fetching tags.

The neighboring Codex fork used to demonstrate this initial setup case. It now
has `origin` set to `https://github.com/peezy-tech/codex` and `upstream` set to
`https://github.com/openai/codex.git`, but it still needs to move from the old
single maintained branch into the `main`, `upstream`, and `patch/*` workspace
shape.

In that shape, `main` is rebuildable maintained output, `upstream` follows the
canonical upstream branch, and each `patch/*` branch tip is one logical patch.
Rebuilding `main` means checking out the upstream point and cherry-picking the
ordered patch branch tips onto it.

See [Codex fork model](codex-fork-model) for the concrete topology.

## Service Mode

When patch.moi runs as a service, the remote forge becomes the durable
coordination surface. The service should talk to remote repositories, branches,
pull requests, issues, workflow runs, checks, and artifacts.

Runner checkouts are disposable. A workflow can clone the fork, fetch upstream,
rebase the patch stack, build artifacts, push a candidate branch, and disappear.

The important rule stays the same: pushed refs and forge records are durable
truth; runner workspace state is temporary execution state.

See [Forge service mode](forge-service-mode).

## Policy That Is Not In Git

Some policy cannot be inferred from refs alone:

- which feed to watch
- which branch should receive patch-stack updates
- which checks are required before a candidate is usable
- which ref supplies the internal build/link workflow
- which forge workflow or runner should apply patches
- whether public release uses GitHub trusted publishing

That policy can live in service configuration, environment, codex-flow config,
or existing repo-native files such as `package.json`, `.codex/workspace.toml`,
CI workflows, `Makefile`, or release docs. It should not obscure where the
patch stack actually lives.
