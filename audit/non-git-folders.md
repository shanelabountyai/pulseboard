# Non-git folders — secrets-only check

**Paths:**
- /Users/shanelabounty/Projects/Europe 2026 vacation
- /Users/shanelabounty/Projects/FIgma to sitecore

**Deployed?** N/A — neither is a web app; both are local working folders (a personal trip-itinerary generator and a Figma→Sitecore integration prototype/skill package).

**Git backup:** Confirmed **neither is a git repository** (`git rev-parse --is-inside-work-tree` fails with "not a git repository" in both). No commit history, no remote — the only copy of anything in these folders is on this laptop.

**One-line exposure:** No real secrets found in either folder. All credential-shaped content is either a placeholder (`.env.example` with `figd_xxxx...`, `{YOUR-API-KEY-GUID}`, `your-bearer-token`) or a `process.env.*` reference in source, never a literal key/token/password.

## Scope of the check

Read-only grep across both folders (excluding `node_modules`) for:
- Key/token/secret/password/bearer patterns with an assigned literal value (`key\s*[:=]\s*<8+ chars>`)
- Known provider key prefixes: `sk-`, `ghp_`, `AKIA`, `xox[baprs]-`, `AIza`
- `.env`/config/secret/credential-named files
- Contents of the two zip archives found (`Figma-to-Sitecore-Package.zip`, and an oddly-named `zi4sUa53` which is itself a zip)

## Findings

**Europe 2026 vacation** — itinerary documents (`.docx`), spreadsheets (`.xlsx`, restrictive `600` perms), a PDF booking confirmation, and two Node scripts (`build_friday.js`, `build_itinerary_ext.js`) that use only the `docx` npm package to generate Word documents — no network calls, no API keys, no `.env` file present. Grep for key/token/secret patterns returned zero real hits (the one match was a `color:GOLD` styling constant, a false positive on "GOLD"/"bold" text). **Clean.**

**FIgma to sitecore** — a Figma→Sitecore MCP server (`mcp-server/`) and a second bridge-API option (`figma-build-to-sitecore/bridge-api/`), each with a `.env.example` documenting variable names only (`FIGMA_API_KEY=figd_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`, `SITECORE_MANAGEMENT_TOKEN=your-bearer-token`, etc. — all placeholder values). No `.env` (real) file exists in either. Source (`bridge-api/src/server.ts:367`) reads the token via `Authorization: Bearer ${ENV.sitecoreManagementToken}` — pulled from environment, not hardcoded. The two zip archives (`Figma-to-Sitecore-Package.zip` and `zi4sUa53`, both plain zips despite the latter's extensionless name) contain only `.pptx`/`.docx`/`.md`/`.skill`/`.json` deliverable files — no `.env` or credential files inside either archive. **Clean.**

No `SEC-nn` or `OPS-nn` gaps to report — the only note is structural, below.

## Note (not a security gap, but relevant to "no backup")

Both folders hold real work (a paid trip's itinerary/bookings; a client integration prototype) with **no git history and no remote** — a disk failure or accidental deletion loses it outright, which is a different risk category than "secrets leaked" but worth flagging since it was already being checked. Not scored as SEC/OPS per the audit's scope (secrets-only), noted for awareness only.
