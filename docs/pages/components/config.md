---
title: Config
description: .patchmoi.toml Git defaults, fetch policy, and safety gates.
---

# Config

Config is optional. Defaults are built in, and a fork only needs
`.patchmoi.toml` when remote names, branch names, patch prefix, fetch policy, or
safety gates differ from the defaults.

## Example

```toml
[git]
upstreamRemote = "upstream"
upstreamBranch = "main"
forkRemote = "origin"
targetBranch = "main"
patchPrefix = "patch/"

[fetch]
allowFetch = false
fetchTags = true
prune = true
pruneTags = false

[safety]
allowRebuild = false
allowCapture = false
allowPull = false
allowApply = false
```

## Discovery

patch.moi searches from the repo path upward for `.patchmoi.toml`. CLI flags can
override config values for one command.

## Boundary

Config owns defaults and safety policy. It does not list patches, store patch
order, track feed cursors, record attempts, or define a registry.
