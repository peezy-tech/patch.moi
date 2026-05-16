---
title: Run the harness maintenance flow
description: Use the patch.moi harness repos to rehearse an upstream release and maintained fork update.
---

# Run the harness maintenance flow

This tutorial runs the smallest real patch.moi maintenance loop. The upstream
repo is `harness/upstream`. The maintained fork is `harness/fork`. The flow
package is `flows/patch-moi-harness`. It is the local version of the same work
a configured workspace backend would run after Patch accepts an upstream update
event.

## 1. Check out the harness repos

```bash
git submodule update --init --recursive
git -C harness/fork remote -v
git -C harness/fork status --short --branch
```

The fork should have `origin`, `upstream`, and `jojo` remotes. The flow can add
the configured upstream remote when it is missing, but it will not invent the
fork or service remotes.

## 2. Run the fixture event

```bash
CODEX_FLOW_FETCH=0 \
CODEX_FLOW_PUSH=0 \
bun run harness:flow
```

The fixture event is `v0.1.3`, which the current fork already contains. The
flow should skip rebase work, run `npm test` and `npm run pack:dry-run` in the
fork, report `candidateRefs` for the maintained fork branch, and leave the fork
checkout unchanged.

## 3. Rehearse a real upstream release

Create a new upstream release in `harness/upstream`, then point the fixture or a
feed event at the new tag:

```bash
cd harness/upstream
npm version patch --no-git-tag-version
npm test
git add package.json package-lock.json
git commit -m "Release harness package"
version=$(node -p "require('./package.json').version")
git tag "v${version}"
git push origin main "v${version}"
```

Run the harness flow again without disabling fetch:

```bash
bun run harness:flow <event-file>
```

Use an event file whose `payload.tag` is the new upstream tag. The flow rebases
`harness/fork` onto that tag, verifies the fork package, reports the local
candidate branch, and keeps pushes off.

## 4. Push only after review

When the local result is the maintained fork state you want:

```bash
CODEX_FLOW_PUSH=1 bun run harness:flow <event-file>
```

That pushes the rebased fork branch to the configured `origin` and `jojo`
remotes with `--force-with-lease` and reports those pushed branch refs as
candidate refs. Public npm publishing remains a separate trusted-publishing
release path.
