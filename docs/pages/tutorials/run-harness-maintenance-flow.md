---
title: Run the harness maintenance automation
description: Use the patch.moi harness repos to rehearse an upstream release and maintained fork update.
---

# Run the harness maintenance automation

This tutorial runs the smallest real patch.moi maintenance loop. The upstream
repo is `harness/upstream`. The maintained fork is `harness/fork`. The source
automations mirror the Codex fork structure:

- `automations/patch-moi-harness-bindings` handles upstream release metadata.
- `automations/patch-moi-harness-fork` rebuilds the maintained fork from
  `upstream` plus ordered `patch/*` branches.
- `automations/patch-moi-harness-flows-fork` prepares a downstream fork package
  artifact.

There are two local operator paths:

- run the automation dispatch directly with `bun run harness:automation`
- run the same flow through the repo-native command workspace task

Both paths exercise the harness. The Patch service path still starts with feed
intake, writes `DATA_DIR` records, creates a maintenance attempt, and dispatches
the same kind of event through the workspace backend adapter.

## 1. Check out the harness repos

```bash
git submodule update --init --recursive
git -C harness/fork remote -v
git -C harness/fork status --short --branch
```

The fork should have `origin`, `upstream`, and `jojo` remotes. The automation can add
the configured upstream remote when it is missing, but it will not invent the
fork or service remotes.

## 2. Run the fixture event directly

```bash
bun run harness:automation
```

The fixture event is `v0.1.3`, which the current fork already contains. The
release event fans out to the bindings automation and the fork automation. The fork automation
seeds the local `upstream` and `patch/*` branches when needed, verifies that
`main` already equals `upstream + patches`, runs `npm test` and
`npm run pack:dry-run`, reports `candidateRefs` for the maintained fork branch,
and leaves the fork checkout unchanged.

## 3. Run the fixture through workspace autonomy

The repo also exposes the same fixture as a manual codex-flows workspace task:

```bash
bun run workspace:run:harness
```

That task is defined in `.codex/workspace.toml` as a command task that runs
`bun run harness:automation`. It is intentionally unscheduled, so `bun run
workspace:tick` is safe by default and explicit `workspace run` remains the
operator action.

Use `bun run workspace:doctor` to inspect the repo-native workspace config and
generated local run state. The generated local state is ignored by Git.

## 4. Try the workspace automation smoke task

The experimental workspace automation task dispatches a generated `upstream.release`
event through a running Codex workspace backend:

```bash
cd ../codex-flows
bun run workspace:backend --cwd /home/peezy/meta-workspace/patch.moi
```

Then, from the patch.moi repo:

```bash
CODEX_WORKSPACE_BACKEND_WS_URL=ws://127.0.0.1:3586 \
bun run workspace:run:harness
```

Use this only to exercise workspace-owned automation. It is not the product
path for patch.moi feed intake, and it does not write patch.moi `DATA_DIR`
maintenance-attempt records unless patch.moi itself dispatches the event.

## 5. Rehearse a real upstream release

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

Run the harness automation again without disabling fetch:

```bash
bun run harness:automation <event-file>
```

Use an event file whose `id`, `occurredAt`, `receivedAt`, and `payload.tag`
identify the new upstream tag. The fork automation updates the local `upstream`
branch to that tag, rebuilds `main` by cherry-picking ordered `patch/*` branch
tips, verifies the fork package, reports the local candidate branch, and keeps
pushes off.

## 6. Push only after review

When the local result is the maintained fork state you want:

```bash
bun run harness:automation <event-file>
```

That pushes the rebuilt fork branch to the configured `origin` and `jojo`
remotes with `--force-with-lease` and reports those pushed branch refs as
candidate refs. Public npm publishing remains a separate trusted-publishing
release path.
