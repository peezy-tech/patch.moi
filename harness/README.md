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
- `harness/fork` `upstream/main`: fetched copy of upstream `main`.
- `harness/fork` `main`: maintained fork with patch commits applied.
- `harness/fork` `jojo/main`: service-style maintained fork remote.

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

## Scenario: Rebase Fork Onto Upstream

Use this when upstream has released and the maintained fork needs to carry its
patches forward.

```bash
cd harness/fork
git fetch upstream
git fetch origin
git checkout main
git rebase upstream/main
npm test
git push --force-with-lease origin main
git push --force-with-lease jojo main
```

Expected result: fork `main` is still patched, but its base is the latest
upstream release.

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

## Scenario: Remote-Only Service

Use this when testing patch.moi service behavior without relying on local
working trees.

```text
upstream repo: https://github.com/peezy-tech/patch-moi-harness.git
upstream branch: main
fork repo: https://github.com/matamune-peezy/patch-moi-harness.git
fork branch: main
service mirror: git@jojo.build:peezy-tech/patch-moi-harness.git
service branch: main
```

Expected result: patch.moi can reason from remote refs alone, then create a
workspace only when it needs to apply or validate the patch stack.
