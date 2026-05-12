# Forgejo Forking Problem Space

Date: 2026-05-12

## Current Setup

Created a jojo.build mirror:

- Repo: https://jojo.build/peezy-tech/jojo
- SSH: `ssh://git@jojo.build/peezy-tech/jojo.git`
- Upstream: `https://codeberg.org/forgejo/forgejo.git`
- Default branch: `forgejo`
- Mirror interval: `8h`

This is currently a mirror, not a working fork branch. That is a good starting
point for source inspection and tracking upstream movement. It is not yet a good
place for custom patches, because mirror updates are expected to follow upstream.

## Executive Summary

Forking Forgejo is feasible, but it is not a small maintenance commitment.
Forgejo is a full Go web application with a substantial frontend build,
database migrations, templates, Actions integration, SSH/HTTP Git serving,
packages, OAuth2, and admin surfaces. A fork is reasonable only if the desired
customization cannot be achieved through supported configuration, OIDC, reverse
proxy auth, static assets, or template overrides.

For SIWE specifically, the preferred order remains:

1. Use SIWE through an external OpenID Connect provider.
2. Use a trusted reverse proxy that performs SIWE and passes identity headers.
3. Fork Forgejo only if we need first-class SIWE UX or native account semantics.

## Upstream Release Cadence

Forgejo stable releases are published quarterly. LTS releases are published in
the first quarter of each year and receive critical bugfix/security support for
one year and three months. The current LTS line is v15.0, released 2026-04-16
and supported until 2027-07-15.

Implication: a fork has to either:

- Track every quarterly release and absorb breaking changes often.
- Track only LTS releases and accept slower access to new Forgejo features.
- Track upstream `forgejo` continuously, which maximizes merge churn.

For a production instance, an LTS-based fork is the most conservative option.

## What A Fork Would Own

At minimum, a maintained fork owns:

- A source branch policy.
- CI for Go, frontend, templates, linting, and tests.
- Binary or container image builds.
- A release/version naming scheme.
- Security patch intake.
- Upgrade rehearsals against jojo.build data.
- Documentation for local patches.
- A rollback path to upstream Forgejo.

The risky areas are not only code conflicts. They are also database migrations,
template changes, auth/session behavior, Actions behavior, and generated assets.

## Build And Test Surface

Forgejo source includes:

- `go.mod` for the backend.
- `package.json` and `webpack.config.js` for frontend assets.
- `Makefile` for build/test targets.
- `Dockerfile` and `Dockerfile.rootless`.
- Published release notes in `release-notes-published/`.

Official build docs require Go, Node.js/npm, and `make`. Older docs mention Go
1.22+ and Node 20+, but we should verify exact versions from the branch we pin
before building production artifacts.

Initial local validation target should be:

```bash
make help
make deps-frontend
make frontend
make test
make build
```

Exact target names need confirmation from the current Makefile before scripting.

## Auth Extension Surface

Forgejo has configurable auth sources:

- Local database auth.
- LDAP via BindDN.
- LDAP simple auth.
- SMTP.
- PAM.
- OAuth2.
- OpenID Connect.
- OpenID.
- Reverse proxy header auth.

From source inspection, auth source types are compiled into the application.
OAuth2 providers are registered in Go during init via an internal Goth provider
registry. That registry is useful for patching Forgejo, but it is not an
external plugin API.

Native SIWE would likely require one of these approaches:

- Add a first-class OAuth2/OIDC provider if SIWE is presented as OIDC.
- Add a custom auth flow and routes for EIP-4361 challenge/signature handling.
- Add account-linking fields for wallet addresses and ENS-derived display data.
- Add admin settings and migration(s) if wallet addresses become persisted
  first-class identities.

The more native the SIWE behavior, the more the fork touches security-critical
surface: sessions, CSRF, account linking, auto-registration, 2FA bypass rules,
and recovery flows.

## SIWE Fork Design Questions

Before writing code, resolve these:

- Is an Ethereum address the canonical Forgejo username, an external account
  identifier, or merely a linked credential?
- Do users need email addresses?
- Can a wallet create a new Forgejo account automatically?
- How are lost wallets handled?
- Can one Forgejo account link multiple wallets?
- Is ENS only display metadata, or does it influence identity?
- Are smart-contract wallets/EIP-1271 required?
- Which chains are accepted?
- Does SIWE bypass local 2FA, complement it, or become a second factor?
- How do Git over HTTPS, SSH keys, access tokens, and API auth map to wallet
  sign-in?

These questions matter more than the login button. Forgejo identity is used by
Git, issues, packages, Actions, API tokens, and admin permissions.

## Fork Strategies

### Strategy A: No Fork

Use config, OIDC, reverse proxy auth, and supported UI customization.

Best for:

- Branding.
- Trusted SIWE/OIDC experiment.
- Avoiding security patch ownership.

Risk:

- Less native UX.
- Identity model constrained by Forgejo's existing auth flows.

### Strategy B: Patch Branch On LTS

Create a branch like `jojo/v15.0` from the current LTS tag, maintain a minimal
patch stack, and periodically rebase or merge v15.0 patch releases.

Best for:

- Production stability.
- Small, well-contained changes.
- Predictable security patch intake.

Risk:

- Larger jumps when moving to the next LTS.
- Backport work if desired features land in newer stable releases.

### Strategy C: Patch Branch On Upstream `forgejo`

Maintain `jojo/forgejo` on top of upstream development.

Best for:

- Contributing changes upstream.
- Early access to Forgejo improvements.

Risk:

- Highest churn.
- Bad fit for production unless we have strong CI and staging.

### Strategy D: Hard Product Fork

Rename/rebrand deeply, ship independent releases, and diverge freely.

Best for:

- Building a distinct forge product.

Risk:

- Largest maintenance burden.
- Security, release, migration, and support responsibilities become ours.

This should be avoided unless jojo.build becomes a product-level Forgejo
distribution.

## Recommended Path

Use the mirror as the upstream intake point. Do not customize the mirror branch.

Next create a working fork branch only when we have a concrete patch to test:

- `jojo/v15.0` from the latest v15.0.x tag for production-minded patches.
- `jojo/forgejo` from upstream `forgejo` for exploratory upstreamable patches.

For SIWE, first prototype without a Forgejo fork:

1. Configure a SIWE OIDC provider against a test Forgejo instance.
2. Test user creation, account linking, logout, API tokens, Git over HTTPS, and
   SSH key management.
3. Separately test reverse proxy header auth with a toy trusted auth service.
4. Only fork if those approaches fail on essential UX or identity semantics.

## Maintenance Checklist For Any Fork

- Track upstream release notes and security announcements.
- Keep a patch inventory with rationale and owner.
- Rebase/merge upstream into a staging branch first.
- Run full build and test suite.
- Run upgrade rehearsal against a copy of production data.
- Smoke test login, repo browsing, Git SSH, Git HTTPS, Actions, packages,
  mirrors, and admin pages.
- Keep a rollback artifact for the previous known-good binary/container.
- Document every app.ini setting required by the fork.

## Open Questions

- Is jojo.build currently installed from binary, container, package manager, or
  local build?
- How is production deployment currently rolled out and rolled back?
- Do we want custom patches to be private indefinitely, or upstreamable?
- Would SIWE be required for all users, optional, or only for selected orgs?
- Is the target experience "login with wallet" or broader onchain identity?
- Are we willing to run an external IdP such as a SIWE OIDC provider?

## Sources Consulted

- Forgejo mirror created from `https://codeberg.org/forgejo/forgejo.git`.
- Forgejo auth docs: https://forgejo.org/docs/v11.0/user/authentication/
- Forgejo OAuth2 provider docs: https://forgejo.org/docs/v13.0/user/oauth2-provider/
- Forgejo customization docs: https://forgejo.org/docs/next/admin/advanced/customization/
- Forgejo config cheat sheet: https://forgejo.org/docs/latest/admin/config-cheat-sheet/
- Forgejo upgrade guide: https://forgejo.org/docs/next/admin/upgrade/
- Forgejo release schedule: https://forgejo.org/docs/v11.0/admin/release-schedule
- Forgejo compile-from-source docs: https://forgejo.org/docs/v7.0/developer/from-source/
- SIWE docs: https://docs.siwe.xyz/
- SIWE hosted OIDC docs: https://docs.login.xyz/servers/oidc-provider/hosted-oidc-provider
