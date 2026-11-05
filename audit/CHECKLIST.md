# Foundation scorecard checklist (K1–K14)

Each key piece maps to spec invariants. Score per repo: `✔` compliant · `✗ <short text>` not compliant · `N/A <why>` does not apply · `? <why>` could not verify.

| Key | Piece | Compliant means | Spec |
|---|---|---|---|
| K1 | Sessions | Server-side revocable (DB rows or watermark); session/link tokens stored hashed only; sign-in links spent by POST not GET | INV-05, 07, 17 |
| K2 | MFA for privileged users | Admin/owner roles require a second factor, enforced in the server guard (not a layout) | INV-22–26 |
| K3 | Guard on every entry point | Every page, server action, route handler that touches private data checks auth server-side; every `'use server'` export is guarded | INV-01 |
| K4 | Tenant / owner scoping | Every read and write by id is scoped to the caller's tenant/owner; secondary ids too; not-found == not-yours | INV-02, 03, 04 |
| K5 | Rate limiting | Unauthenticated writes (sign-in, public forms, token reads) limited in a shared store (DB/Redis), not memory | INV-09 |
| K6 | Capability links | Public token links: hashed at rest, expiry, revocable, allowlisted projection, no-referrer/no-store/noindex | INV-07, 08 |
| K7 | Security headers | Global Referrer-Policy, nosniff, frame-ancestors/X-Frame-Options, HSTS | INV-15 |
| K8 | Secret handling | Constant-time compares; fail closed when unset; never in query strings; no secret NEXT_PUBLIC_/VITE_ vars; no tracked secrets | INV-10, 11, 16, 20 |
| K9 | Webhooks | Signature on raw body + timestamp window; idempotent claim; failed events re-applied | INV-12 |
| K10 | Message/log safety | No tokens or bodies logged in production; missing provider in prod fails loudly | INV-13 |
| K11 | Env validation | Schema-validated env at boot; `.env.example` lists every used var (names only) | INV-14 |
| K12 | Test DB discipline | Tests on local Postgres; code-level guard refusing cloud DB URLs; e2e on a production build | INV-18 |
| K13 | Audit trail | Append-only log of privileged changes, enforced in the DB | INV-19 |
| K14 | Deploy hygiene | `ignoreCommand` per CLAUDE.md; own port in config; cron routes constant-time + fail closed | CLAUDE.md |
