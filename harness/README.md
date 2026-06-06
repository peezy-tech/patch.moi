# patch.moi Harnesses

This directory holds small, real repositories used to exercise patch.moi
against upstream/fork maintenance flows.

## Layout

- `upstream`: the public upstream GitHub repository.
- `fork`: a local maintained fork, cloned from a real GitHub fork.

The upstream repository is:

```text
https://github.com/peezy-tech/patch-moi-harness.git
```

The fork repository is:

```text
https://github.com/matamune-peezy/patch-moi-harness.git
```

The fork should also know about the upstream and jojo remotes:

```bash
git -C harness/fork remote get-url upstream >/dev/null 2>&1 || \
  git -C harness/fork remote add upstream https://github.com/peezy-tech/patch-moi-harness.git
git -C harness/fork remote get-url jojo >/dev/null 2>&1 || \
  git -C harness/fork remote add jojo git@jojo.build:peezy-tech/patch-moi-harness.git
git -C harness/fork fetch upstream
git -C harness/fork fetch jojo
```

## Branch Model

- `harness/upstream` `main`: upstream package history and upstream releases.
- `harness/fork` `upstream`: local branch that follows the selected upstream
  release tag or main commit for a maintenance run.
- `harness/fork` `main`: maintained fork rebuilt from `upstream` plus ordered
  `patch/*` branches.
- `harness/fork` `patch/*`: ordered proof patch refs used to exercise
  independent and stacked patch detection. The current seeds are
  `patch/010-maintained-greeting`, `patch/020-shout-mode`,
  `patch/030-package-identity`, and `patch/040-salutation-helper`.
- `harness/fork` `jojo/main`: optional Forgejo mirror of the maintained fork
  branch.

The upstream npm package is `@peezy.tech/patch-moi-harness`. It publishes from
GitHub tags named `v*` through the `npm-publish` GitHub environment.

The fork npm package is `@peezy.tech/patch-moi-harness-fork`. It is configured
to publish from GitHub fork tags named `fork-v*` through the same
`npm-publish` environment, once the npm trusted publisher exists for the fork
package.

## Scenario: Upstream Release

Use this when you want to simulate upstream changing and publishing a new
release.

```bash
cd harness/upstream
npm version patch --no-git-tag-version
npm test
git add package.json package-lock.json
git commit -m "Release 0.1.4"
git tag v0.1.4
git push origin main v0.1.4
```

Expected result: GitHub Actions publishes the upstream package to npm with
trusted publishing.

## Scenario: Fork Feature Patch

Use this when you want to simulate local feature development on top of
upstream.

```bash
cd harness/fork
git fetch upstream
git checkout main
npm test
# edit source files
git add .
git commit -m "Add local fork feature"
git push origin main
git push jojo main
```

Expected result: the GitHub fork and jojo maintained branch both move ahead of
the last upstream commit.

## Scenario: Rebuild Fork Onto Upstream

Use this when upstream has released and the maintained fork needs to carry its
patches forward.

```bash
cd harness/fork
git fetch upstream
git branch -f upstream upstream/main
git checkout --detach upstream
for patch in $(git for-each-ref --format='%(refname:short)' refs/heads/patch | sort); do
  git cherry-pick "$patch"
done
git branch -f main HEAD
git checkout main
npm test
git push --force-with-lease origin main
git push --force-with-lease jojo main
```

Expected result: fork `main` is still patched, but its base is the latest
upstream release or main commit.

The same maintenance path is executable through patch.moi's local Git
porcelain:

```bash
bun run patch.moi -- patch list --repo harness/fork --json
PATCH_MOI_ALLOW_REBUILD=1 bun run patch.moi -- patch rebuild \
  --repo harness/fork \
  --base refs/remotes/upstream/main \
  --to main \
  --json
bun run patch.moi -- patch explain \
  --repo harness/fork \
  --branch main \
  --upstream refs/remotes/upstream/main \
  --json
```

Expected result: patch.moi reads only Git refs, rebuilds the maintained branch
when the safety gate is explicit, and reports which patch refs match the rebuilt
branch. Runner execution, artifacts, retries, and thread state stay outside
patch.moi.

## Scenario: Fork Release

Use this when the maintained fork should do its own release cycle.

```bash
cd harness/fork
npm version prerelease --preid fork --no-git-tag-version
npm test
git add package.json package-lock.json
git commit -m "Release fork package"
version=$(node -p "require('./package.json').version")
git tag "fork-v${version}"
git push origin main "fork-v${version}"
git push jojo main
```

Expected result: GitHub Actions in the fork publishes
`@peezy.tech/patch-moi-harness-fork`, provided npm has a trusted publisher for
`matamune-peezy/patch-moi-harness`, workflow `publish.yml`, environment
`npm-publish`.

## Scenario: Remote Refs

Use this when testing patch.moi against already-fetched remote refs.

- upstream repo: `https://github.com/peezy-tech/patch-moi-harness.git`
- upstream branch: `main`
- fork repo: `https://github.com/matamune-peezy/patch-moi-harness.git`
- fork branch: `main`
- optional Forgejo mirror: `git@jojo.build:peezy-tech/patch-moi-harness.git`

Expected result: patch.moi can inspect remote-tracking refs and candidate refs
from Git alone. It only mutates Git when the operator enables the relevant
safety gate.
