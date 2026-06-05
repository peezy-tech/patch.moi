---
title: Release
description: patch.moi release checks, GitHub Pages deployment, plugin verification, and optional npm trusted publishing.
---

# Release

patch.moi has three release surfaces:

| Surface | Publishes |
|---------|-----------|
| Site/docs | GitHub Pages from `main`. |
| Codex plugin | Git-backed plugin source from this repo. |
| npm package | Optional public workspace packages through trusted publishing. |

The current active release surfaces are Pages and the Git-backed Codex plugin.
Workspace packages are private until we intentionally make one publishable.

## Local Check

```bash
git status --short --branch
bun install --frozen-lockfile
bun run release:check
```

`release:check` runs type checks, tests, docs build, whitespace checks, and
release metadata checks.

## Workflows

| Workflow | Purpose |
|----------|---------|
| `.github/workflows/ci.yml` | Runs `bun run release:check`. |
| `.github/workflows/pages.yml` | Builds and deploys the site/docs to GitHub Pages. |
| `.github/workflows/publish-npm.yml` | Publishes public npm packages with trusted publishing. |

## npm Trusted Publishing

Do not use npm publish tokens. If a package becomes public, configure its npm
trusted publisher with:

```text
Provider: GitHub Actions
Organization: peezy-tech
Repository: patch.moi
Workflow filename: publish-npm.yml
Environment: npm-publish
Allowed action: npm publish
```

The publish workflow uses GitHub OIDC and refuses private packages or package
name mismatches.

## Verify

```bash
npm dist-tag ls <package>
npm view <package> version
codex plugin marketplace add /home/peezy/repos/patch.moi
codex plugin add patch-moi@patch-moi
```

Start a new Codex thread after plugin updates so Codex reloads skills and MCP
tools.
