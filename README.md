# patch.moi

Git-first patch-stack porcelain for custom forks on top of upstream open source
software.

Canonical public host: `https://patch.moi`.

## Repository

This is a Bun monorepo:

- `apps/patch`: the `patch.moi` CLI and local MCP server.
- `docs`: Tome documentation site for patch.moi.

patch.moi treats Git as the durable source of truth. Upstream and fork remotes,
remote-tracking refs, patch branches, tags, commits, candidate branches, forge
checks, forge artifacts, and codex-flows thread metadata describe what happened.
patch.moi does not keep its own durable attempt database, feed cursor, runner
state, HTTP admin service, retry/replay queue, or remote-control surface.

## Codex Plugin

This repo owns the patch.moi Codex plugin source:

- `.codex-plugin/plugin.json` declares the marketplace metadata.
- `.agents/plugins/marketplace.json` exposes the repo-root plugin for direct
  local/product-repo installs.
- `.mcp.json` starts the `patch-moi` MCP server through
  `scripts/patch-moi-mcp-bootstrap.ts`.
- `skills/` contains `patch-moi:` operator workflows.

Codex needs `git` and `bun` on the PATH visible to Codex App. The plugin
bootstrap runs `bun install --frozen-lockfile` in Codex's installed plugin cache
the first time the MCP server starts.

For local development against this product checkout:

```bash
codex plugin marketplace add /home/peezy/repos/patch.moi
codex plugin add patch-moi@patch-moi
```

The MCP server is local only. It inspects Git, uses
`refs/remotes/<upstreamRemote>/<upstreamBranch>` as the canonical upstream base,
and does not require a local branch named `upstream`. Fetch and mutation tools
fail closed unless `.patchmoi.toml` or the matching `PATCH_MOI_ALLOW_*`
environment variable explicitly enables them.

Copy `.patchmoi.example.toml` to `.patchmoi.toml` in a maintained fork only when
the default remote, branch, patch prefix, fetch, or safety policy needs to
change.

## CLI

```text
patch.moi work start feature --title TITLE --repo DIR --branch BRANCH --base REF [--patch-branch patch/NAME] [--create-branch] [--json]
patch.moi patch doctor [--repo DIR] [--json]
patch.moi patch list [--repo DIR] [--prefix patch/] [--json]
patch.moi patch candidates [--repo DIR] [--remote REMOTE] [--pattern candidate/*] [--json]
patch.moi patch capture patch/NAME --from BRANCH [--base BRANCH] [--repo DIR] [--message MSG] [--force] [--json]
patch.moi patch rebuild [--base BRANCH] [--to BRANCH] [--repo DIR] [--prefix patch/] [--json]
patch.moi patch pull --repo DIR --remote REMOTE --branch BRANCH [--ff-only] [--json]
patch.moi setup fork --repo DIR --upstream-url URL [--apply] [--json]
```

`patch pull` is fast-forward only and gated by `PATCH_MOI_ALLOW_PULL=1` or
`[safety].allowPull=true`.

## Boundary

patch.moi does local Git patch-stack work:

- inspect readiness
- fetch upstream when allowed
- start/select feature branches
- capture feature branches into `patch/*`
- rebuild maintained branches from upstream plus patches
- list and fast-forward runner candidate refs from Git

codex-flows and the forge own runner execution, retry/replay, run history,
remote/mobile control, thread transplant, checks, and artifacts. A runner may
call patch.moi as a Git tool, but patch.moi is not the runner controller.

## Development

```bash
bun install
bun run check
bun run docs:build
```

The publishable docs site is a Tome project in `docs/`:

```bash
bun run docs:dev
bun run docs:build
```
