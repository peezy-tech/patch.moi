# patch.moi

Git-first maintenance control plane for custom patches on top of upstream open
source software.

Canonical public host: `https://patch.moi`.

## Repository

This is a Bun monorepo:

- `apps/patch`: the Patch service, feed poller, JSONL store, Discord output,
  and workspace backend adapter.
- `docs`: Tome documentation site for patch.moi.

patch.moi treats Git as the source of truth for maintained projects. Upstream
and fork remotes, patch branches, tags, and commits describe the patch stack.
Patch records update intake, dispatch attempts, and operational history around
those Git facts.

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

For normal installs, use the shared Peezy Tech marketplace:

1. Open Codex App Plugins.
2. Choose Add marketplace.
3. Enter `peezy-tech/skills` or `https://github.com/peezy-tech/skills`.
4. Install `patch-moi` from the `peezy-tech` marketplace.
5. Start a new thread so the bundled skills and MCP server are loaded.

The same install can be done from a Codex CLI that shares the same `CODEX_HOME`:

```bash
codex plugin marketplace add peezy-tech/skills --ref main
codex plugin add patch-moi@peezy-tech
```

For local development against this product checkout, add the checkout root
instead:

```bash
codex plugin marketplace add /home/peezy/meta-workspace/patch.moi
codex plugin add patch-moi@patch-moi
```

The MCP server defaults to local mode. It inspects Git and `DATA_DIR`, uses
`refs/remotes/<upstreamRemote>/<upstreamBranch>` as the canonical upstream base,
and does not require a local branch named `upstream`. Dry-run tools are safe by
default. Fetch and mutation tools fail closed unless `.patchmoi.toml` or the
matching `PATCH_MOI_ALLOW_*` environment variable explicitly enables them.

Copy `.patchmoi.example.toml` to `.patchmoi.toml` in a maintained fork only when
the default remote, branch, patch prefix, fetch, or safety policy needs to
change.

## Endpoints

```text
GET  /healthz
GET  /flow-events
GET  /flow-events/:id
POST /flow-events/:id/retry
POST /flow-events/:id/replay
GET  /maintenance-attempts
GET  /maintenance-attempts/:id
POST /maintenance-attempts/:id/sync
GET  /workspace-dispatches
GET  /workspace-events
GET  /workspace-runs
```

## Environment

```text
HOST=0.0.0.0
PORT=3000
DATA_DIR=./data
DISCORD_OUTPUT_ENABLED=false
DISCORD_WEBHOOK_URL=
DISCORD_NOTIFY_EVENTS=push,release
FEED_SOURCES_PATH=./feed-sources.json
PATCH_WORKSPACE_BACKEND_URL=
PATCH_WORKSPACE_BACKEND_SECRET=
PATCH_FLOW_BACKEND_URL=
PATCH_FLOW_DISPATCH_URL=
PATCH_FLOW_DISPATCH_SECRET=
PATCH_ADMIN_TOKEN=
CODEX_WORKSPACE_MODE=
```

Discord notifications are off by default. Set `DISCORD_OUTPUT_ENABLED=true`
and `DISCORD_WEBHOOK_URL` to send Discord output. `DISCORD_NOTIFY_EVENTS` is a
comma-separated allow list and defaults to `push,release`.

## Development

```bash
bun install
bun run check
bun run workspace:doctor
bun run dev
```

Feed watcher events are configured by `FEED_SOURCES_PATH`. The bundled
`apps/patch/feed-sources.json` is intentionally empty; real workspace repos
should own their private feed config beside their installed flow capabilities.
The first poll primes `DATA_DIR/feed-state.json`; later polls append upstream
activity to `DATA_DIR/feed-events.jsonl`. Targets using `mode: "fork_sync"`
append legacy work to `DATA_DIR/feed-jobs.jsonl`. Targets using
`mode: "workspace_flow"` append generic flow events to
`DATA_DIR/flow-events.jsonl`, send them to the configured workspace backend or
local adapter, and record dispatch outcomes in
`DATA_DIR/workspace-dispatches.jsonl`. Each dispatch also creates or updates a
patch.moi-owned `DATA_DIR/maintenance-attempts.jsonl` entry that links the
upstream update to workspace run ids, final flow outcome, and candidate refs.

Patch can dispatch through a configured workspace backend, through the
codex-flows Actions/local surface with `CODEX_WORKSPACE_MODE=actions`, or
through synchronous local flow execution for development. The backend does not
need to be running in this checkout unless you are explicitly testing or
operating that surface.

The harness can also be run through the repo-native workspace task:

```bash
CODEX_FLOW_FETCH=0 CODEX_FLOW_PUSH=0 bun run workspace:run:harness
```

That task writes local operator run state under `.codex/workspace/local/`,
which is ignored by Git. Patch service state remains under `DATA_DIR`.

## Documentation

The publishable docs site is a Tome project in `docs/`:

```bash
bun run docs:dev
bun run docs:build
```

Docs source follows the Diataxis framework under `docs/pages/tutorials`,
`docs/pages/guides`, `docs/pages/reference`, and `docs/pages/concepts`.
