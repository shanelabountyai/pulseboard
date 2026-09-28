# Changelog

Entries prefixed `security:` are mandatory for anything touching an invariant. Clones must take a `security:` release within 7 days.

## 1.0.2 (2026-09-27)

Fix (FR-01, notifications): `drainOutbox` sent inside the claim's interactive transaction (5s timeout). A send slower than that
was delivered but never recorded, then re-sent on every cron run and blocked the queue. The claim is now a short transaction that
counts the attempt and leases the row (`LEASE_MS`, 2 min); the send runs outside it and is marked after. The Resend and Twilio
fetches time out at 15s (this also covers the sign-in and invite mail). Take it promptly if your cron drains often.
Upgrade: `git merge v1.0.2`; no migration.

## 1.0.1 (2026-09-25)

Fix: the clone steps in README and plan §3.1 used `git checkout -b main`, which fails because a fresh clone already has `main`; now `-B`. Docs only.

## 1.0.0 (2026-09-25)

First release. Core (env, db with cloud guard, auth with magic link, sessions, TOTP and recovery codes, tenancy, authz, audit, share links, cron),
the `billing` and `notifications` modules, demo sign-in (`/demo`, `DEMO_MODE=1`), `seed:demo`, clone tooling
(`new-project`, `db:setup`, `foundation:drift`, `foundation:status`, `foundation:check-modules`), and invariants INV-01 to INV-28.
