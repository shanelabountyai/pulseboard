# Changelog

Entries prefixed `security:` are mandatory for anything touching an invariant. Clones must take a `security:` release within 7 days.

## 1.0.3 (2026-09-27)

security: (FR-02, K2) A session waiting on TOTP lived 30 days, and the only guess control was 8 tries per 5 minutes: over one session,
about a 19% chance to guess a code for someone holding the inbox. A pending-MFA session now dies 10 minutes after the link
(`PENDING_MFA_MS`). Wrong TOTP and recovery codes are audited (`auth.mfa_failed`) and capped at 20 per user per UTC day
(`LIMITS.mfaFailPerUserDay`); past the cap the pending session is ended and MFA is refused until the day turns. `/login/mfa` has a Sign out button.

security: (FR-03, K5) `createInvite` had no rate limit, so anyone could send unlimited invite mail from the app's domain. It is now
capped per sender (50/day), per org (100/day) and per recipient address (5/day, across orgs).

security: (FR-04, K9, billing) The org's billing row followed any subscription carrying its org id, so a second checkout made a second
subscription whose events overwrote the first. `BillingAccount.stripeSubscriptionId` now binds the org to one subscription; another's
events apply only after the bound one has ended (a re-subscribe), and otherwise log `billing.second_subscription`. Checkout is refused
while the org has a live subscription.

security: (FR-05, K9, billing) `deleteOrg` dropped the billing row but left the Stripe subscription charging. It now cancels a live
subscription first (`cancelOrgSubscription`, called from the new clone-owned `src/app/org-hooks.ts`, whose `// billing` lines go with the module), and refuses to delete if the
cancel fails. A live subscription for an unknown org logs `billing.unknown_org_live_subscription`.

Upgrade: `git merge v1.0.3`, then `npm run db:migrate` (adds `stripeSubscriptionId`). Existing live rows bind on their next
subscription event; until then, deleting such an org is refused. A clone with its own `PaymentProvider` must add `cancel()`.

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
