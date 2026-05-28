---
title: Develop a feature as patch work
description: Start feature work, capture it into a patch branch, and rebuild the maintained branch.
---

# Develop A Feature As Patch Work

This tutorial uses the bundled harness fork as the example workspace. The goal
is to turn an ordinary feature branch into a logical `patch/*` branch while
patch.moi records the work and attempt state.

## 1. Start feature work

```bash
bun run --silent patch.moi -- work start feature \
  --title "Add harness salutation helper" \
  --repo harness/fork \
  --branch feature/salutation-helper \
  --base main \
  --patch-branch patch/040-salutation-helper \
  --create-branch \
  --data-dir data \
  --json
```

This writes `data/patch-work.jsonl` and creates the feature branch in
`harness/fork`.

## 2. Commit the feature

Make the feature changes in the harness fork, then commit them on the feature
branch:

```bash
cd harness/fork
npm test
git add src/index.js test/harness.test.js
git commit -m "Add salutation helper"
cd ../..
```

## 3. Capture the patch branch

Use the `work.id` from step 1:

```bash
bun run --silent patch.moi -- patch capture patch/040-salutation-helper \
  --repo harness/fork \
  --from feature/salutation-helper \
  --base main \
  --message "patch: salutation helper" \
  --work-id '<work-id>' \
  --data-dir data \
  --json
```

This appends a capture attempt to `data/patch-attempts.jsonl` and updates the
patch work record to `captured` with `patch/040-salutation-helper` as a
candidate ref.

## 4. Rebuild and inspect

```bash
bun run --silent patch.moi -- patch rebuild --repo harness/fork --to main --data-dir data --json
(cd harness/fork && npm test)
bun run --silent patch.moi -- work show '<work-id>' --data-dir data --json
bun run --silent patch.moi -- attempts --work-id '<work-id>' --data-dir data --json
```

The maintained `main` branch should rebuild from the upstream base plus the
ordered `patch/*` branches, including the new feature patch.
