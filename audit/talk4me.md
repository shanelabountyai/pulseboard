# Security audit: talk4me

- **Repo:** `/Users/shanelabounty/Projects/talk4me` (remote `shanelabountyai/talk4me`)
- **Live:** talk4me.labintelligence.co
- **Stack:** Vite 8 + React 19 PWA (vite-plugin-pwa, Workbox precache), Dexie/IndexedDB, and **one Vercel serverless function**, `api/tts.ts`, which proxies ElevenLabs text-to-speech.
- **Exposure summary:** A static, local-first SPA with one public, unauthenticated paid-API proxy. There are no accounts, no server-side user data and no database. The ElevenLabs key stays server-side (correct). The risk is **credit burn on `/api/tts` by anyone**.

Method: read-only review of all 131 tracked files that matter (`api/`, `src/`, `vercel.json`, `vite.config.ts`, `.env.example`, `.gitignore`). Nothing was run.

Facts established:
- **Backend:** only `api/tts.ts`. No other `api/` files are tracked.
- **User data:** boards, phrases, photos, recordings, usage stats and the caregiver PIN all live in the browser's IndexedDB (`src/store/db.ts`, `src/store/index.ts`). Nothing is uploaded except TTS text (below). Export and import are local files.
- **Paid APIs:** ElevenLabs, called only from the server with `process.env.ELEVENLABS_API_KEY` (`api/tts.ts:50,78`). The client calls `/api/tts` (`src/voice/ElevenLabsVoiceProvider.ts:68`).
- **VITE_ vars:** only `VITE_TTS_PROVIDER`, a code-path switch rather than a secret (`src/routes/speakDeps.tsx:25`, `.env.example:17-19`). No key is in the bundle.
- **Auth:** none. The caregiver "edit PIN" is a client-side UX lock (`src/routes/RequireEditPin.tsx:18-35`), not a security boundary, and it is appropriate for a single-device AAC app.
- **Tracked secrets:** none. `git ls-files` shows only `.env.example`, and `.gitignore` covers `.env*`.

## Scorecard

| Key | Score | Evidence |
|---|---|---|
| K1 Sessions | N/A: no accounts or sessions | — |
| K2 MFA | N/A: no privileged users | — |
| K3 Guards | ✗ The single entry point `/api/tts` is public by design and has no gate of any kind | `api/tts.ts:15-26,44` |
| K4 Scoping | N/A: no server-side records | — |
| K5 Rate limit | ✗ no limit on the paid proxy | `api/tts.ts:44-105`. The in-code comment admits it (`:15-26`). |
| K6 Capability links | N/A: no share or token links | — |
| K7 Headers | ✗ `vercel.json` sets no headers; no CSP, XFO, nosniff or Referrer-Policy | `vercel.json:1-9`, `index.html` |
| K8 Secrets | ✔ The key is server-only, fails closed with a 503 when unset, never reaches the client or a query string, and nothing is tracked | `api/tts.ts:50-56,78`, `.env.example:1-19`, `.gitignore` |
| K9 Webhooks | N/A | — |
| K10 Log safety | ✗ minor: the upstream error body is logged, and it can echo the user's spoken text | `api/tts.ts:92` |
| K11 Env validation | ? Only one server var, checked at use (`api/tts.ts:50`). There is no schema, but none is really needed. `.env.example` lists both vars ✔. | `.env.example` |
| K12 Test DB | N/A: no database. Vitest unit tests plus Playwright against `vite preview` (a production build) ✔. | `package.json` `e2e:serve` |
| K13 Audit trail | N/A: no privileged server changes | — |
| K14 Deploy hygiene | ✔ `ignoreCommand` matches the CLAUDE.md form. Port 3800 is set in config. There are no cron routes. | `vercel.json:2`, `vite.config.ts` `server.port`/`preview.port`, `package.json` |

## Gaps

| ID | Sev | Finding | Fix | Acceptance test |
|---|---|---|---|---|
| SEC-01 | **HIGH** | **Open paid-API proxy.** `POST /api/tts` accepts any caller, any text up to **10,000 chars** (`api/tts.ts:39,67`) and any syntactically valid `voiceId` (`:42,66`), with no auth, origin check or rate limit. **Exploit:** `while true; do curl -X POST https://talk4me.labintelligence.co/api/tts -H 'content-type: application/json' -d '{"text":"<10k chars>","voiceId":"21m00Tcm4TlvDq8ikWAM"}'; done` drains the ElevenLabs character quota within minutes. When it runs out, the real user (the AAC speaker) silently falls back to the device voice. This is a cost incident and an availability-of-voice incident for a disability-access app. | Cheapest first: (1) lower `MAX_CHARS` to about 500, since phrases are "a sentence or two" (`:36`); (2) allowlist the two premade `voiceId`s the app uses instead of any id matching the regex; (3) add a Vercel Firewall rate-limit rule on `/api/tts` (for example 30 requests/min per IP); (4) set a hard monthly character cap or usage alert in the ElevenLabs dashboard; (5) optionally check `Origin`/`Sec-Fetch-Site`, which stops drive-by use but not a determined attacker. | `api/tts.test.ts`: 501 chars gives 413, and an unlisted voiceId gives 400. Live: a burst of 40 requests in 60 s from one IP returns 429 after the threshold. |
| SEC-02 | MED | **No security headers.** `vercel.json` has only `ignoreCommand` and the SPA rewrite. **Exploit:** the app can be framed (clickjacking the caregiver settings or import screen), and there is no CSP to contain script injection from an imported bundle. The import renders only local data, so this is UNVERIFIED as exploitable. | Add a `headers` block for `/(.*)`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`, and a CSP (`default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'`). Test the PWA and service worker after adding the CSP. | `curl -sI https://talk4me.labintelligence.co/` shows all of these headers. The e2e offline and speak suites still pass. |
| SEC-03 | LOW | **User speech can reach logs.** When the upstream call fails, `console.error('[api/tts] upstream %s: %s', status, body)` (`api/tts.ts:92`) logs the ElevenLabs error body. The file's own comment says that body "can echo the submitted text", which is private speech from an AAC user and ends up in Vercel logs. | Log `status` plus a truncated error `code` only, never the body. | A unit test with a mocked 400 whose body contains the text shows `console.error` was not called with that text. |
| SEC-04 | LOW (info) | **The caregiver PIN is stored in plaintext in IndexedDB** (`src/store/index.ts:37,56,288`), and the lock is a module-level boolean (`RequireEditPin.tsx:18`). This is by design: it is a UX guard on one family device, not a security control, and it should not be described as security. | None needed. Optionally hash it with SHA-256 so the value isn't shoulder-read from devtools. | — |

## Ops items

| ID | Item |
|---|---|
| OPS-01 | **Now:** set a spend or character cap and a usage alert in the ElevenLabs account. This is the only control that bounds the SEC-01 loss today, with no deploy needed. |
| OPS-02 | Check the ElevenLabs usage history for any unexpected spikes since the proxy went live (UNVERIFIED: I have no access). |
| OPS-03 | `.env.local` holds `ELEVENLABS_API_KEY` and a `VERCEL_OIDC_TOKEN` from `vercel env pull`. It is gitignored and not tracked (verified). Keep it that way, and rotate the ElevenLabs key if the laptop file has ever been shared. |
