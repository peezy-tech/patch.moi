# patch-moi-harness Flow

This flow is the first executable patch.moi maintenance harness. It consumes a
generic `upstream.release` event for `peezy-tech/patch-moi-harness`, then uses
Git state in `harness/fork` to keep the maintained fork on top of the upstream
release tag.

The default behavior is local and reviewable:

- fetch the configured upstream remote
- switch to the maintained fork branch
- rebase onto the release tag when the tag is not already an ancestor
- run the configured package checks
- leave pushes disabled unless `CODEX_FLOW_PUSH=1` is set

Useful overrides:

```bash
CODEX_FLOW_FETCH=0 bun run harness:flow
CODEX_FLOW_PUSH=1 bun run harness:flow
```

The fixture event is `fixtures/upstream-release-v0.1.3.json`. It should be a
no-op rebase against the current harness fork while still verifying the package
surface.
