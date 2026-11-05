# claude-dashboard audit

**Path:** /Users/shanelabounty/Projects/claude-dashboard

**Deployed?** N/A — local-only personal tool, `node server.js` on port 4173, not a hosted web app. Git repo, pushed to a remote (`git status` shows `up to date with origin/main`).

**Stack:** Express 4.22.2, single `server.js` + `lib/{config,git,sessions,agents,runner}.js`, no framework, no database, no auth dependency.

**One-line exposure:** The server binds to **all network interfaces by default** (no host argument passed to `app.listen`), while the README claims it "binds to localhost only" — and several of its unauthenticated endpoints spawn the `claude` CLI (`claude -p <prompt>`) with the full process environment and an attacker-influenced `cwd`, making this effectively unauthenticated remote code execution for anyone on the same network.

## Key question: bind address and reachable capability

**Binding.** `server.js:12,259`:
```js
const PORT = process.env.PORT || 4173;
...
app.listen(PORT, () => { console.log(...) });
```
No host/interface argument is passed. Node's documented default when `host` is omitted is to accept connections on **all available interfaces** (dual-stack `::`, which also accepts IPv4). This is not localhost-only. `start.sh:19` prints `http://localhost:${PORT}` for convenience, but that's just the message shown to the user — it does not restrict what the socket accepts.

**README claim vs. code (README.md:128-131):**
> "No auth/access control. This binds to localhost only and assumes single-user, trusted-machine use — there's no login, and anyone with local network access to the port (if you tunnel or forward it) could hit the API. Don't expose this port publicly."

This is internally inconsistent — it asserts "localhost only" in the same sentence it warns that local-network access could reach the port "if you tunnel or forward it." The code does not implement the localhost-only restriction the first clause describes: no host binding, no middleware IP check, nothing in `lib/` filters by remote address. Anyone on the same LAN/Wi-Fi can reach `http://<host-LAN-ip>:4173/...` directly — no tunnel or port-forward needed.

**What is reachable, unauthenticated, once on the network:**

| Endpoint | Capability | Evidence |
|---|---|---|
| `GET /api/skills/run` | Spawns `claude -p "<configured skill invocation><query-string args>"` with `env: process.env` (full server environment) in a configured `cwd` | `server.js:163-173`, `lib/runner.js:19-25` |
| `GET /api/agents/run` | Spawns `claude` as an arbitrary subagent persona with an attacker-supplied `task` string, in any `projectPath` query param, no validation that `projectPath` is one of the configured paths | `server.js:189-211` — `agentsLib.discoverAgentsInProject(projectPath)` is called directly on the query param |
| `POST /api/config/paths` | Adds any existing directory on the filesystem to `config.projectPaths` (only checks it exists and is a directory, no allowlist) | `lib/config.js:39-51` — becomes a usable `cwd` for the two run endpoints above |
| `GET /api/sessions/:slug/:sessionId` | Reads and returns full Claude Code session transcripts from `~/.claude/projects/**/*.jsonl` for any slug/sessionId | `server.js:249-257`, `lib/sessions.js:7` |
| `GET /api/daily-report`, `GET /api/sessions`, `GET /api/config` | Read-only metadata (commit counts, session titles/turn counts, configured paths) | `server.js:72-148, 217-247, 22-28` |

None of these routes check a request origin, header, token, or IP. `lib/runner.js:24` explicitly passes `env: process.env` to the spawned `claude` process, so any secret exported in the shell that started the dashboard (API keys, tokens) is available to whatever prompt the remote caller supplies.

## Scorecard

Most K1–K14 keys don't apply — this is a single-user local Express tool, not a multi-tenant SaaS app. Scored only where relevant.

| Key | Score | Evidence file:line |
|---|---|---|
| K1–K4, K6, K9, K12, K13 | N/A no multi-user/tenant/DB/webhook surface | single-user local tool, no auth system, no database (`package.json` deps: `express` only) |
| K5 Rate limiting | N/A — but see SEC-01: the real problem here isn't rate limiting, it's the total absence of authentication on RCE-capable routes | `server.js:163-211` |
| K7 Security headers | N/A not a public-facing app | intentional per README's "trusted machine" model |
| K8 Secret handling | ✗ full env passed to spawned process | `lib/runner.js:24` `env: process.env` — combined with the network-reachable bind (SEC-01), this turns "no secret in the dashboard's own code" into "every secret in the shell's env is reachable via a crafted prompt" |
| K10 Message/log safety | ? not deeply checked | `server.js` returns raw `err.message` in several `catch` blocks (e.g. `server.js:26,39,52,146,159,185,245,255`) — fine for a local single-user tool, would leak stack detail if ever network-exposed |
| K11 Env validation | N/A | only env var is `PORT`, defaulted inline |
| K14 Deploy hygiene | ✔ port fixed | `server.js:12` defaults to `4173`, matching the port table's `claude-dashboard` row; `PORT` still overridable per convention |

## Gaps

| ID | Sev | Finding | Fix | Acceptance |
|---|---|---|---|---|
| SEC-01 | HIGH | `app.listen(PORT, ...)` (`server.js:259`) binds to all network interfaces, not localhost — contradicting the README's own "binds to localhost only" claim (`README.md:128`). Combined with unauthenticated `/api/skills/run` and `/api/agents/run` (`server.js:163-211`, `lib/runner.js:19-25`), which spawn the `claude` CLI with the full process environment and an attacker-controllable prompt/cwd, this is unauthenticated remote code execution for anyone who can reach the port on the LAN (no tunnel/forward required, contrary to the doc's hedge). | Bind explicitly to `127.0.0.1` (pass `'127.0.0.1'` as the second arg to `app.listen`) as the minimum fix; add a shared-secret/token check on the run and config-mutation routes as defense in depth if the tool is ever used on a shared network. | `app.listen(PORT, '127.0.0.1', ...)`; verified a connection attempt from another machine on the same LAN is refused. |
| SEC-02 | MED | `POST /api/config/paths` (`lib/config.js:39-51`) accepts any existing directory with no allowlist, and that path becomes a usable `cwd` for the RCE-capable run endpoints (SEC-01) — an attacker who can reach the API can point a subsequent agent run at any directory on disk. | Fold into the SEC-01 fix (binding + auth); no separate action needed once the port isn't network-reachable and/or routes are authenticated. | Covered by SEC-01's acceptance test. |
| OPS-01 | LOW | README's security note (`README.md:128-131`) states the tool "binds to localhost only," which is factually wrong per the code — this could lead a future reader to under-estimate the exposure when deciding whether to run it on a shared machine. | Correct the README wording to state the server binds to all interfaces and should only be run behind a firewall/on a trusted network, or fix the bind and then the claim becomes true. | README accurately describes the actual bind behavior after SEC-01 is fixed. |

## Notes
- This is a well-scoped personal tool for a single trusted user on one machine — the design intent (per its own README) is reasonable. The finding is that the implementation doesn't match the stated threat model: the doc assumes localhost-only, the code doesn't enforce it.
- `config.json` (not `config.example.json`) currently has 1 configured project path and 3 skills — not detailed here since the specific paths aren't security-relevant beyond what's already covered above.
