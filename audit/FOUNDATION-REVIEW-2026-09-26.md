# Foundation review, 2026-09-26

Three read-only reviews of v1.0.1: adversarial K1/K2/K5/K6 (Opus), adversarial K3/K4/K8/K9/K13 (Opus, 48 entry
points), clone tooling (Sonnet, run against tradepost, pulseboard and callboard). **No HIGH.** Every MED below was
confirmed by reading the cited lines, except where marked. These ship to all three clones, so each fix is a template
release, and each clone picks it up in its own session.

## MED

| Id | Key | Where | Defect | Fix |
|---|---|---|---|---|
| FR-01 ✅ v1.0.2 | K13/ops | `src/modules/notifications/outbox.ts:30-52` | The provider send runs **inside** an interactive `$transaction` (default 5s timeout; fetch has no timeout). A send slower than 5s is delivered, then both updates fail on the closed tx, `drainOutbox` throws, `attempts` never increments: the row is re-sent on every cron run and blocks the queue. Callboard runs cron every 5 min. | Claim with a lease in a short tx (attempts+1, sendAfter=now+N), send outside any tx with `AbortSignal.timeout`, mark `sentAt` after; catch per row. Test with a stub slower than the tx timeout. |
| FR-02 | K2 | `src/core/auth/session.ts:14,37`; `totp.ts:98-102` | A pending-MFA session (`mfaAt` null) lives the full 30 days; the only brute-force control is 8 tries / 5 min. Over one session that is ≈19% to guess a TOTP code, given inbox access (the threat MFA exists for). | Pending-MFA sessions expire after ~10 min; a daily per-user failure cap that forces a new link; audit failed attempts. Let a pending session sign out (LOW, `login/mfa`). |
| FR-03 | K5 | `src/core/tenancy/invites.ts:21-44` | `createInvite` has no rate limit (the file's only `hit` is on accept). Anyone can create an org named like a phishing lure and send unlimited invite mail from the app's domain. | `hit` per org and per recipient email; per-user daily cap. |
| FR-04 | K9 | `src/modules/billing/webhook.ts:42-61`; `settings/billing/actions.ts` | One billing row per org keyed only by `metadata.orgId`; no stored subscription id, no customer match. Two checkouts make two subscriptions, and events for either overwrite the org's status/customer (cancel one → org loses access while the other keeps charging). Not confirmed by me beyond reading the webhook. | Store `stripeSubscriptionId`; apply only matching events; refuse a second checkout while one is pending or a customer exists. |
| FR-05 | K9 | `src/core/tenancy/delete.ts:10-17` | `deleteOrg` cascades the billing row but never cancels the Stripe subscription; later events log `billing.unknown_org` and the card keeps being charged. | Cancel through the provider (idempotently) or refuse deletion while a subscription is live; alert on `unknown_org` with an active status. |
| FR-06 | K3 | `FOUNDATION_SPEC.md` rule 1; `tests/invariants/harness.ts` | Nothing enforces that every page, layout and route handler guards itself; the harness only sees `'use server'` exports. All 17 pages and 6 routes are guarded today by hand; a clone's new page is not checked, and a client-side navigation does not re-run the layout guard. | Invariant test over `src/app/**/{page,layout,route}.tsx?`: first awaited call is `requireOrg`/`requireUser`, or the file is on a public allowlist. |
| FR-07 | K3 | `tests/invariants/harness.ts:20,24` | The harness globs `src/{app,modules}/**`. It misses `'use server'` files elsewhere and inline `'use server'` functions inside components, and Next registers both as endpoints. | Glob all of `src/`; fail on any `'use server'` that is not a file's first directive. |
| FR-08 | K4 | `tests/invariants/harness.ts:115-116,171` | Only `ref()`-tagged fields get the cross-org swap; an id typed `z.string()`/`z.cuid()` is filled with `'x'`, and INV-02/03/04 is skipped for that action. | Throw on untagged fields named like ids (`/id$|Id$|slug|token/`) unless marked non-id. |
| FR-09 | tooling | `scripts/foundation-drift.ts:24` | A path listed once in `FOUNDATION_PATCHES.md` is excused from drift **forever**, whatever later edits it gets. Tradepost already has `src/core/authz/guards.ts` listed. | Record the patched diff's hash per path; drift fails when the current diff for that path differs. |
| FR-10 | tooling | `scripts/foundation-modules.ts:15`; `src/app/o/[org]/layout.tsx` | Module removal does not strip the Billing nav link (it lives in `layout.tsx`, not in `MARKED_FILES`); after removal it 404s and every check stays green. | Marker comment on the link, add `layout.tsx` to `MARKED_FILES`. |
| FR-11 | tooling | `scripts/new-project.ts:30` | Port checked only against 4100, not the port table; a second run corrupts the README banner and leaves scripts on the first port. | Refuse a port already in `~/.claude/CLAUDE.md`'s table; refuse to run when `package.json` name is no longer `saas-foundation`. |

## LOW

- K1 `session.ts:82-84`, `link.ts:92-107`: sign-out-everywhere and email change leave unused login links valid; `redeemLink` does not check the email still matches.
- K1 `session.ts:13,44`: cookie named `session`, not `__Host-session`; `Secure` derived from `APP_URL`.
- K2 `totp.ts:64-82`: `confirmTotp` skips `assertFresh`; two concurrent confirms can leave 20 recovery codes.
- K5 `src/core/http.ts:4`: first `x-forwarded-for` trusted (safe on Vercel only); IPv6 keyed per address, not /64; everyone shares `'unknown'` when absent.
- K6 `share/links.ts:31-48`: share links survive their creator's removal from the org.
- K13 migration `audit_append_only`: trigger blocks UPDATE/DELETE but the app role owns the table (TRUNCATE, DISABLE TRIGGER).
- K13 `projects/actions.ts`, `share/links.ts`, `invites.ts:48-50`: some audited writes commit apart from their audit row.
- Tooling: module env keys linger in `.env.example`; drift ignores untracked files (documented, D-19d).

## Checked clean (summary)

Hashed sessions with per-request revocation; magic link spent only on POST; MFA enforced on every guarded path with
no alternate sign-in bypass; TOTP replay blocked atomically; recovery codes HMAC-keyed and single use; atomic rate-limit
increment; email change, invite accept and deletion flows; share tokens hashed with an allowlisted projection and
no-referrer/no-store; every current action, page and route guarded; org scoping on every by-id path including share
revoke and invite revoke; webhook HMAC over the raw body with event-id claim under row lock; cron fails closed with a
constant-time compare; no `NEXT_PUBLIC_` secrets; core never imports modules (lint-enforced). All three clones: no
template leftovers, ports consistent, local-DB and pool conventions followed.
