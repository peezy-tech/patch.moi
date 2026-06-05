# Release Process

patch.moi releases are Git-first and fail closed. The current public product
surface is the Git-backed Codex plugin plus the hosted site/docs. npm publishing
is optional and must use GitHub Actions trusted publishing if a package becomes
public.

## Release Types

| Release | Publishes | Current state |
|---------|-----------|---------------|
| Site/docs | GitHub Pages from `main` | Active |
| Codex plugin | Git-backed plugin source from this repo | Active |
| npm package | A public workspace package through npm trusted publishing | Not active yet; packages are private |

## Version Policy

When a release changes the product surface, keep versions intentional:

- root `package.json`
- `apps/patch/package.json`
- `docs/package.json`
- `site/package.json`
- `.codex-plugin/plugin.json`
- `templates/codex-toys/codex-kit.toml`

The plugin version may include Codex-specific build metadata. npm package
versions must be plain semver and must not be published from private packages.

## Local Preflight

Run from a clean checkout. Preserve unrelated local changes instead of folding
them into a release commit.

```bash
git status --short --branch
bun install --frozen-lockfile
bun run release:check
```

`release:check` runs type checks, tests, docs build, whitespace checks, and
release metadata checks.

## CI

`.github/workflows/ci.yml` runs `bun run release:check` on push, pull request,
and manual dispatch.

`.github/workflows/pages.yml` builds the root site plus Tome docs and deploys
the `dist` artifact to GitHub Pages on push to `main`.

## npm Trusted Publishing

Do not add npm publish tokens to GitHub secrets.

If a workspace package becomes public, configure trusted publishing in that
package's npm settings:

| npm trusted publisher field | Value |
|-----------------------------|-------|
| Provider | GitHub Actions |
| Organization or user | `peezy-tech` |
| Repository | `patch.moi` |
| Workflow filename | `publish-npm.yml` |
| Environment name | `npm-publish` |
| Allowed actions | `npm publish` |

The package's `package.json` must point `repository.url` at
`https://github.com/peezy-tech/patch.moi`. Scoped public packages must set
`publishConfig.access = "public"`.

The workflow `.github/workflows/publish-npm.yml` uses GitHub OIDC with
`id-token: write`, Node 24, npm publish, and no npm token. It refuses to publish
when:

- the package is still private
- `confirm_package` does not match the package name
- the workflow is not running from `main` or a `v*` tag
- repository or scoped-public metadata is missing

Use a dry run first:

```bash
gh workflow run publish-npm.yml \
  -f package_dir=apps/patch \
  -f confirm_package=@peezy.tech/patch \
  -f dry_run=true
```

Publish only after the npm trusted publisher is configured and the dry run is
clean:

```bash
gh workflow run publish-npm.yml \
  -f package_dir=apps/patch \
  -f confirm_package=@peezy.tech/patch \
  -f dry_run=false
```

Verify npm after publish:

```bash
npm dist-tag ls @peezy.tech/patch
npm view @peezy.tech/patch version
```

Trusted publishing requires the public GitHub repository and package settings to
match the workflow. It also generates npm provenance automatically for public
packages published from public repositories.

## Release Steps

1. Confirm `main` is current and the worktree only contains intended release
   changes.
2. Bump versions if the product surface changed.
3. Run `bun run release:check`.
4. Commit release changes.
5. Push to `origin main`.
6. Push to `github main` when GitHub Pages or npm trusted publishing must run.
7. Verify the CI and Pages workflows.
8. If publishing npm, run `publish-npm.yml` dry-run, then the real publish.
9. Verify npm dist-tags and a fresh install when an npm package was published.
10. Verify a fresh Codex plugin install when plugin metadata, skills, MCP, or
    templates changed.

## Plugin Verification

```bash
codex plugin marketplace add /home/peezy/repos/patch.moi
codex plugin add patch-moi@patch-moi
```

Start a new Codex thread after installing or upgrading so the skill and MCP
surfaces reload.

## Release Notes

Release notes should include:

- changed CLI/MCP/plugin surfaces
- changed Git model or safety gates
- docs/site changes
- template or skill changes
- npm package name and version, if published
- verification commands and workflow URLs
