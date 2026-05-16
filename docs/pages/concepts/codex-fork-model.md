---
title: Codex fork model
description: The concrete Git topology patch.moi should learn from the neighboring Codex fork.
---

# Codex Fork Model

The neighboring `../codex` checkout is the concrete model for patch.moi concept
development. It shows why patch.moi should treat Git as the project source of
truth and keep Patch state focused on orchestration.

## Observed Repository

Observed on 2026-05-16:

| Fact | Value |
| --- | --- |
| Checkout | `../codex` |
| Current branch | `code-mode-exec-hooks` |
| Fork remote | `origin` -> `https://github.com/peezy-tech/codex` |
| Branch tracking | `origin/code-mode-exec-hooks` |
| Comparison branch | `origin/main` |
| Patch branch head | `f8594cf39` |
| Candidate tag at head | `rust-v0.130.0` |
| Local working tree | untracked `codex-rs/code-mode/TYPECHECK_PLAN.md` |

There is no `upstream` remote configured in this checkout. That is an important
setup case for patch.moi: the CLI or service should detect it and offer to add
`https://github.com/openai/codex.git` as the upstream remote before running a
release maintenance workflow.

## Patch Stack

The maintained patch stack is the commits on `code-mode-exec-hooks` ahead of
`origin/main`:

```text
5e0d6c54e Expose Code Mode exec to hooks
d715d5829 Add native code mode replay action
a2fb3e6c9 Publish peezy codex npm packages
bc03f1afa Use fork-friendly Peezy npm release workflow
74e1540e1 Increase release build timeout
f8594cf39 Use peezy.tech npm scope
```

Those commits are the patch inventory. patch.moi should not duplicate them in a
project file. It should read them from Git and record the runs that attempted to
carry them forward.

## What This Teaches patch.moi

The Codex fork makes the desired model concrete:

- `origin/main` is a useful local comparison baseline, but a real upstream
  remote is still needed for canonical release tags.
- `code-mode-exec-hooks` is the maintained patch branch, but internal use is
  not simply "run from this branch."
- `rust-v0.130.0` at the branch head is a downstream candidate or release tag.
- the npm package rename to `@peezy.tech/*` is part of the patch stack, not a
  Patch service setting.
- the public release path is encoded in `.github/workflows/rust-release.yml`.
- the internal release surface should build the native binary, place it in the
  npm wrapper's local vendor layout, and use a Bun link workflow so the local
  `codex` command exercises the same JavaScript launcher path as a release.
- a dirty or untracked working tree should block automated rebases until the
  operator decides whether that local work belongs in the patch stack.

## Maintenance Workspace

A patch application workspace for this repo should do the normal Git work:

```bash
cd ../codex
git status --short --branch
git remote get-url origin
git remote get-url upstream || git remote add upstream https://github.com/openai/codex.git
git fetch upstream --tags --prune
git fetch origin --prune
git rev-list --oneline origin/main..code-mode-exec-hooks
```

For an upstream release event, the workspace can resolve the upstream tag,
rebase `code-mode-exec-hooks`, run Codex-specific checks, and push a candidate
branch or tag when policy allows.

In service mode, that work should be triggered through the remote fork host. For
example, patch.moi can create or update a maintenance branch on GitHub, trigger
a runner, and let that runner perform the checkout, rebase, build, and push. The
local `../codex` checkout is a model for topology and local validation, not the
service's durable execution surface.

## Feature Workspace

Feature development should happen in a separate workspace or branch. A new
custom feature starts from the current maintained branch, produces commits, and
only becomes part of the maintained patch stack after it is intentionally merged
or rebased into `code-mode-exec-hooks`.

## Channel Split

The same candidate ref can serve different channels:

| Channel | Codex fork example |
| --- | --- |
| Internal use | build the local native binary, stage it into the npm wrapper/vendor shape, and link that package with Bun |
| Public release | push `rust-v*` tags and let GitHub Actions publish `@peezy.tech/*` packages |

Internal use should be close to the actual release surface without requiring the
full multiplatform CI release. The useful local loop is:

```bash
cd ../codex
# Codex's Rust workspace lives under codex-rs.
(cd codex-rs && cargo build -p codex-cli --bin codex)
mkdir -p codex-cli/vendor/x86_64-unknown-linux-musl/codex
cp codex-rs/target/debug/codex codex-cli/vendor/x86_64-unknown-linux-musl/codex/codex
(cd codex-cli && bun link)
bun link @peezy.tech/codex
codex --version
```

This example shows the x64 Linux wrapper path. The exact target directory,
target triple, and global-versus-project link choice can vary by host and
validation target, but the principle is stable: test the npm wrapper plus native
binary handoff locally, then leave multiplatform artifacts and trusted npm
publishing to CI.
