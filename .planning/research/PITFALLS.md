# Pitfalls Research

**Domain:** TypeScript MCP server — D2L Brightspace REST API + Playwright ADFS auth + WaterlooWorks scraping
**Researched:** 2026-03-21
**Confidence:** HIGH (based on McMaster a2l-mcp git history analysis + code inspection)

## Critical Pitfalls

### 1. UWaterloo ADFS Form Selectors Differ from McMaster

**Warning signs:** `page.$('input#i0116')` returns null; auth hangs at login page
**Prevention:** UWaterloo uses Shibboleth IdP (`idp.uwaterloo.ca`), not Microsoft Online. Selectors are `input[name="j_username"]` and `input[name="j_password"]`, not `#i0116`/`#i0118`. Test `isLoginPage()` against actual UWaterloo ADFS URL before building any tools.
**Phase:** Phase 2 (Auth)

### 2. WaterlooWorks Blocks Headless Chromium

**Warning signs:** `page.goto('waterlooworks.uwaterloo.ca')` returns 403 or blank page; login redirect loops
**Prevention:** Use `{ headless: false }` in the Playwright launch config for WaterlooWorks scraping (at least for initial testing). Set a realistic viewport (`1280x720`) and user-agent matching a real Chrome version. If headless is required for CI, try `playwright-extra` with stealth plugin — but headed mode is the safe default.
**Phase:** Phase 5 (WaterlooWorks)

### 3. WaterlooWorks HTML Changes Break Selectors

**Warning signs:** `getJobPostings()` returns empty array or throws; `page.$eval()` returns null
**Prevention:** All WaterlooWorks CSS selectors MUST be isolated in `waterloo-works/client.ts` — never inline them in tool handlers. Every `page.$eval()` must be wrapped in try/catch with partial data return: `return partialData ?? []`. Log which selector failed. This makes debugging HTML changes a 5-minute fix instead of a hunt across files.
**Phase:** Phase 5 (WaterlooWorks)

### 4. Duo MFA Breaks Headless First-Login

**Warning signs:** Auth hangs after ADFS password submit; Duo iframe never resolves in headless mode
**Prevention:** `auth-cli.ts` MUST launch in headed mode (`headless: false`). The MCP server itself can run headless on token-cache-hits, but the initial token capture requires a real browser for Duo. Document this clearly in README: "Run `node dist/auth-cli.js` in a terminal with display access before starting MCP server."
**Phase:** Phase 2 (Auth)

### 5. Token Expiry in Long-Running Sessions

**Warning signs:** D2L API returns 401 mid-session; tools start failing after ~22 hours
**Prevention:** Token cache must check expiry on every `getToken()` call, not just at startup. Store token acquisition timestamp alongside the token. Buffer: treat 22h as expired (D2L tokens last ~23h). On 401 response from D2L client, immediately invalidate token cache and re-authenticate — don't surface the 401 to the user.
**Phase:** Phase 2 (Auth) — and audit during Phase 6 (Polish)

### 6. ESM + better-sqlite3 Native Module Issues

**Warning signs:** `Error: require is not defined in ES module scope` or `Cannot use import statement in CommonJS module`
**Prevention:** `better-sqlite3` is a native Node module. With `"module": "NodeNext"` in tsconfig, you MUST use `.js` extensions in all import paths (even for `.ts` source files). If you see import errors, check: (1) all local imports have `.js` extension, (2) `package.json` has `"type": "module"`, (3) `tsconfig.json` has `moduleResolution: "NodeNext"`. Run `npm rebuild better-sqlite3` after Node version changes.
**Phase:** Phase 1 (Scaffolding) — catch early

### 7. pdf-parse v2 API Break

**Warning signs:** `pdf(buffer)` is not a function; TypeError on import
**Prevention:** Pin `pdf-parse@1.1.1` in package.json. The v2 release changed the module export signature. Do NOT run `npm update` without checking this pin. `mammoth` does not have this issue.
**Phase:** Phase 4 (Study Tools)

### 8. SQLite FTS5 Tokenizer Drops Partial Words

**Warning signs:** `notes_search("dynamic prog")` returns nothing; exact-phrase search works but partial fails
**Prevention:** FTS5 default tokenizer (`simple`) may not handle partial word queries. Use `unicode61` tokenizer and append `*` for prefix matching in queries: `SELECT * FROM note_sections_fts WHERE note_sections_fts MATCH 'dynamic*'`. Expose this as an option in `notes_search` — default to prefix matching so users don't need to know FTS5 syntax.
**Phase:** Phase 4 (Study Tools)

### 9. D2L API Rate Limiting on Bulk Enrollment Fetch

**Warning signs:** `sync_all` works for students with <10 courses but hangs or 429s for students with many courses or semesters
**Prevention:** `sync_all` iterates over all active enrollments and calls `getAssignments()` per course. Add a small delay (100-200ms) between course calls. Only sync active enrollments (filter by enrollment.Access.IsActive). The McMaster reference has a subtle cleanup bug in notes_sync that deletes all then re-inserts — this causes data loss on error. Use UPSERT (`INSERT OR REPLACE`) instead.
**Phase:** Phase 4 (Study Tools)

### 10. Shared Playwright Context Timeout in WaterlooWorks

**Warning signs:** `get_job_postings` hangs indefinitely; no error thrown
**Prevention:** Set explicit timeouts on all WaterlooWorks page operations: `page.goto(url, { timeout: 30000 })` and `page.waitForSelector(selector, { timeout: 10000 })`. A hung WaterlooWorks scrape should fail loudly after 30s, not silently block the MCP server. The shared Playwright context must not be locked — use a mutex or queue if concurrent tool calls are possible.
**Phase:** Phase 5 (WaterlooWorks)

### 11. MCP Tool Schema vs D2L Response Mismatch

**Warning signs:** Claude receives tool result but misinterprets fields; dates appear as epoch integers instead of ISO strings
**Prevention:** D2L returns dates in multiple formats depending on endpoint: ISO 8601 strings, Unix timestamps, and custom D2L date objects. `marshal.ts` must normalize all dates to ISO 8601. The McMaster reference implementation has `formatDate()` and `formatRelativeDate()` — port these exactly and add unit tests.
**Phase:** Phase 3 (D2L Tools)

### 12. WaterlooWorks Session Invalidation During Long Browse

**Warning signs:** WaterlooWorks tools work at start, return 302/auth-redirect after 30+ minutes of MCP server uptime
**Prevention:** WaterlooWorks session cookies have a shorter expiry than the ADFS token. The `waterloo-works/client.ts` must handle 302 redirects to `idp.uwaterloo.ca` as a session-expiry signal and trigger re-authentication (navigate back through ADFS SSO flow using the existing Playwright context). Log session refreshes so the user knows why a tool call was slow.
**Phase:** Phase 5 (WaterlooWorks)

## Phase-by-Phase Pitfall Checklist

| Phase | Key Pitfalls to Address |
|-------|------------------------|
| Phase 1: Scaffolding | ESM + NodeNext module resolution; pdf-parse pin |
| Phase 2: Auth | ADFS selector verification (j_username); headed Duo MFA; token expiry handling |
| Phase 3: D2L Tools | Date normalization in marshal.ts; orgUnitId handling |
| Phase 4: Study Tools | FTS5 tokenizer + prefix search; sync_all UPSERT pattern; D2L rate limiting |
| Phase 5: WaterlooWorks | Headed browser; isolated selectors; defensive extraction; session timeout |
| Phase 6: Polish | Long-running session token refresh audit; error message clarity |

## Sources

- McMaster a2l-mcp reference implementation git history (C:/Users/fortn/mcpmac/) — bugs found: auth flow fix (ac4d986), download handling refactor (aafa3f4)
- Code analysis: auth.ts, files.ts, content.ts, notes.ts in McMaster reference
- Playwright documentation — headless detection avoidance, persistent context patterns
- better-sqlite3 documentation — FTS5, WAL mode, native module ESM compatibility

---
*Pitfalls research for: UWaterloo LEARN MCP server (uwlearn-mcp)*
*Researched: 2026-03-21*
