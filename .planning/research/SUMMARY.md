# Project Research Summary

**Project:** uwlearn-mcp — UWaterloo LEARN + WaterlooWorks MCP Server
**Domain:** TypeScript MCP server — D2L Brightspace REST API + Playwright ADFS auth + WaterlooWorks scraping + SQLite study tools
**Researched:** 2026-03-21
**Confidence:** MEDIUM (HIGH on stack/architecture; MEDIUM on features; LOW on WaterlooWorks selector specifics)

## Executive Summary

This project is a TypeScript MCP server that gives Claude authenticated access to two UWaterloo student systems: D2L Brightspace (LEARN) via REST API and WaterlooWorks (co-op portal) via Playwright scraping. A high-quality reference implementation exists (McMaster a2l-mcp) that covers the D2L and study-tools layers almost completely — roughly 70% of this project is a port-and-adapt of that reference. The remaining 30% is UWaterloo-specific: the Shibboleth ADFS auth flow (different selectors from McMaster's Microsoft Online SSO), the WaterlooWorks scraping layer (no public API exists), and co-op-specific tools like job search, application tracking, and interview schedule. The co-op integration is the primary differentiator — no other MCP server covers WaterlooWorks.

The recommended approach is to build in strict dependency order: scaffolding first, then auth (the foundation every other component requires), then D2L tools (which port cleanly from McMaster), then local SQLite study tools (sync_all, tasks, notes, plan_week), and finally WaterlooWorks scraping (the highest-risk layer due to no public API and bot-detection sensitivity). This order mirrors both the architectural dependency graph and the risk profile — getting auth right early eliminates the most critical single point of failure.

The key risks are concentrated in two areas. First, the ADFS auth flow is UWaterloo-specific (Shibboleth, not Microsoft Online) and must be verified against the real login page before any other work proceeds — a wrong selector assumption here blocks every tool. Second, WaterlooWorks has no public API, uses anti-bot measures, and its HTML structure is undocumented — the scraping layer must be built defensively with all selectors isolated in one file and every extraction wrapped in try/catch with partial-data fallback. Treat WaterlooWorks selectors as configuration that will need updating, not stable API contracts.

## Key Findings

### Recommended Stack

The stack is anchored by `@modelcontextprotocol/sdk@1.27.1` (official MCP SDK with dual stdio+HTTP transport), `playwright@1.58.2` (required for both ADFS SSO auth and WaterlooWorks scraping — no public API alternative exists), `better-sqlite3@12.8.0` (synchronous API cleaner for MCP tool handlers; WAL mode + FTS5 support), and `zod@4.3.6` (runtime validation; MCP SDK peer-compatible). The supporting libraries are `pdf-parse@1.1.1` (MUST be pinned — v2 broke the API), `mammoth@1.12.0` for .docx files, and optionally `openai@6.32.0` for semantic embeddings. TypeScript 5.9.3 with `"module": "NodeNext"` ESM throughout is required — mixing CJS will cause import resolution failures.

**Core technologies:**
- `@modelcontextprotocol/sdk@1.27.1`: MCP server + tool registration — official SDK; dual transport built-in
- `playwright@1.58.2`: ADFS SSO auth + WaterlooWorks scraping — only viable option for both use cases
- `better-sqlite3@12.8.0`: Local SQLite storage — synchronous API; WAL mode + FTS5 native support
- `zod@4.3.6`: Runtime validation — TypeScript-native standard; MCP SDK peer-compatible
- `express@4.22.1`: HTTP transport — stay on 4.x (Express 5 async error changes are breaking)
- `pdf-parse@1.1.1`: PDF text extraction — PINNED; v2 broke the extraction API
- `typescript@5.9.3` + `NodeNext`: Type safety with ESM module resolution

### Expected Features

All D2L tools are well-understood and port directly from the McMaster reference. WaterlooWorks tools are the UWaterloo differentiator and have no reference implementation to copy from. The co-op integration (job search, application tracking, interview schedule) is what makes this tool genuinely valuable to a UWaterloo student vs. a generic LEARN MCP.

**Must have (table stakes — v1):**
- `get_my_courses`, `get_assignments`, `get_upcoming_due_dates`, `get_my_grades`, `get_announcements` — core academic workflow; all port from McMaster
- `get_course_content` + `get_course_modules` + `download_file` + `read_file` — course material access
- `sync_all` + `tasks_list` + `tasks_add` + `tasks_complete` + `plan_week` — integration bridge between LEARN data and local planning
- `get_job_postings` + `get_job_details` + `search_jobs` + `get_my_applications` — co-op integration is the UW differentiator; omitting this makes the tool just another LEARN MCP

**Should have (v1.x after core validation):**
- `get_interview_schedule` — high anxiety use case; add once base WaterlooWorks scraping is stable
- `notes_sync` + `notes_search` + `notes_suggest_for_item` — high value; add once core tools are validated
- `notes_embed_missing` — optional semantic search via OpenAI; enhances notes layer without blocking it
- `get_assignment_submissions` — status check; lower urgency than deadlines
- `get_ranking_status` — WaterlooWorks ranking tab; add after base scraping is stable

**Defer to v2+:**
- UW Quest exam schedule and final grades — separate PeopleSoft portal, separate auth, significant scope
- `get_saved_jobs`, `get_work_term_reports` — niche; defer until demand is validated
- Ed Discussion / Piazza integration — UW is mid-transition between platforms; high maintenance

**Anti-features (never build):**
- Assignment submission via MCP — irreversible, high-stakes, academic integrity risk; keep read-only
- Job application via MCP — co-op applications are consequential; Claude recommends, student applies manually
- Polling/webhooks for new postings — MCP is request-response; push notifications are out of scope

### Architecture Approach

The architecture is a layered MCP server: `src/index.ts` registers all tools and manages dual stdio/HTTP transport; tool handlers in `src/tools/*.ts` and `src/tools/coop.ts` delegate to two clients — `src/client.ts` for D2L REST API calls and `src/waterloo-works/client.ts` for Playwright scraping; both clients depend on `src/auth.ts` for the shared Playwright persistent context and Bearer token; `src/study/store.ts` manages SQLite with WAL mode and FTS5. The critical design choice is that auth is shared — one ADFS login session covers both LEARN and WaterlooWorks (same Shibboleth IdP), meaning one Duo MFA prompt covers the entire session.

**Major components:**
1. `src/auth.ts` — Playwright ADFS SSO; shared persistent context; Bearer token capture and cache; `~/.uwlearn-session/`
2. `src/auth-cli.ts` — Headful one-time login script; handles Duo MFA interactively
3. `src/client.ts` — D2L Brightspace REST API v1.57; typed methods; auto-retry on 401
4. `src/waterloo-works/client.ts` — Playwright scraping of WaterlooWorks; ALL selectors isolated here; defensive extraction with try/catch
5. `src/tools/*.ts` + `src/tools/coop.ts` — Tool definitions and handlers per domain
6. `src/study/store.ts` — SQLite schema, WAL mode, FTS5 init, UPSERT patterns
7. `src/study/sync.ts` + `planning.ts` + `notes.ts` — Integration bridge (sync_all), planning (plan_week), notes search
8. `src/utils/marshal.ts` — D2L date normalization (ISO 8601 throughout)

### Critical Pitfalls

1. **UWaterloo ADFS uses Shibboleth, not Microsoft Online** — Selectors are `input[name="j_username"]`/`input[name="j_password"]`, not McMaster's `#i0116`/`#i0118`. Verify `isLoginPage()` detects `idp.uwaterloo.ca` before building anything else. (Phase 2)

2. **WaterlooWorks blocks headless Chromium** — Use `{ headless: false }` with realistic viewport and user-agent for WaterlooWorks. All selectors must be isolated in `waterloo-works/client.ts` with try/catch + partial data fallback. Treat selectors as configuration, not API contracts. (Phase 5)

3. **Duo MFA requires headed browser on first login** — `auth-cli.ts` must always launch headed. The MCP server can run headless on token-cache-hits. Document the `node dist/auth-cli.js` prerequisite prominently in README. (Phase 2)

4. **Token expiry in long-running sessions** — Check token age on every `getToken()` call (22h threshold); auto-invalidate on 401; handle WaterlooWorks session cookies separately (shorter expiry than ADFS token; 302 to `idp.uwaterloo.ca` = session expired). (Phase 2 + Phase 5)

5. **ESM + NodeNext module resolution** — All local imports need `.js` extensions even for `.ts` source files. `package.json` must have `"type": "module"`. Run `npm rebuild better-sqlite3` after Node version changes. Catch this in Phase 1 scaffolding; it cascades badly if discovered late. (Phase 1)

6. **pdf-parse v2 API break** — Pin `pdf-parse@1.1.1` in package.json and never `npm update` without checking. (Phase 4)

7. **sync_all data loss on error** — McMaster reference has a delete-all-then-reinsert bug. Use `INSERT OR REPLACE` (UPSERT) instead; also add 100-200ms delay between course calls to avoid D2L 429 rate limiting. (Phase 4)

## Implications for Roadmap

Based on the research, the architecture's build-order dependency graph maps cleanly to phases. Each phase has a clear "can test this in isolation" milestone which reduces risk. The WaterlooWorks phase must come last because it depends on a proven auth foundation and is the highest-risk component.

### Phase 1: Project Scaffolding
**Rationale:** Catch the ESM/NodeNext module resolution issues early — they cascade badly if discovered during Phase 3 or later. Establish `package.json` with `"type": "module"`, `tsconfig.json` with `NodeNext`, pin `pdf-parse@1.1.1`, and install all dependencies with exact versions.
**Delivers:** Compilable TypeScript project; all deps installed and verified; `npm run build` succeeds
**Addresses:** Project foundation; no tools yet
**Avoids:** ESM + better-sqlite3 native module pitfall (Pitfall #6); pdf-parse v2 pin (Pitfall #7)

### Phase 2: Authentication Foundation
**Rationale:** Auth is the single dependency for every other component. Nothing else can be tested until a valid session exists. Must be verified against the real UWaterloo ADFS/Shibboleth page — training data confidence on selector names is MEDIUM, not HIGH.
**Delivers:** `auth-cli.ts` opens browser, fills UWaterloo ADFS form, completes Duo MFA, captures Bearer token, persists session to `~/.uwlearn-session/`; subsequent starts reuse session
**Uses:** `playwright@1.58.2`; persistent context pattern
**Implements:** `src/auth.ts` + `src/auth-cli.ts`
**Avoids:** Shibboleth vs. Microsoft Online selector confusion (Pitfall #1); headed Duo MFA (Pitfall #3); token expiry handling (Pitfall #4)
**Research flag:** NEEDS VALIDATION — UWaterloo Shibboleth selector names must be confirmed against real login page during implementation; training data is MEDIUM confidence on this.

### Phase 3: D2L Tools
**Rationale:** D2L tools port directly from McMaster reference with high confidence. Delivering them early provides immediate user value and validates the auth foundation before tackling WaterlooWorks.
**Delivers:** Full D2L tool suite — `get_my_courses`, `get_assignments`, `get_upcoming_due_dates`, `get_my_grades`, `get_announcements`, `get_course_content`, `get_course_modules`, `get_course_topic`, `download_file`, `read_file`
**Uses:** `src/client.ts`; D2L Brightspace REST API v1.57
**Implements:** `src/tools/enrollments.ts`, `src/tools/assign.ts`, `src/tools/grades.ts`, `src/tools/calendar.ts`, `src/tools/news.ts`, `src/tools/content.ts`, `src/tools/files.ts`, `src/utils/marshal.ts`
**Avoids:** D2L date normalization mismatch (Pitfall #11); hardcoded orgUnitId anti-pattern

### Phase 4: Local Study Tools
**Rationale:** `sync_all` is the integration bridge between D2L data and local planning — it requires D2L tools to be working. The SQLite layer, notes pipeline, and `plan_week` all depend on this bridge. This phase delivers the "payoff" daily-use tools.
**Delivers:** `sync_all`, `tasks_list`, `tasks_add`, `tasks_complete`, `plan_week`, `notes_sync`, `notes_search`, `notes_suggest_for_item`, `notes_embed_missing` (optional)
**Uses:** `better-sqlite3@12.8.0` with WAL + FTS5; `pdf-parse@1.1.1`; `mammoth@1.12.0`; optionally `openai@6.32.0`
**Implements:** `src/study/store.ts`, `src/study/sync.ts`, `src/study/planning.ts`, `src/study/notes.ts`
**Avoids:** FTS5 tokenizer + prefix search pattern (Pitfall #8); sync_all UPSERT not delete-reinsert (Pitfall #9); D2L rate limiting delay (Pitfall #9)

### Phase 5: WaterlooWorks Scraping
**Rationale:** Highest-risk phase — no public API, bot detection, undocumented HTML. Must come after auth is proven and D2L tools are validated. Shared auth session means WaterlooWorks benefits from the already-working ADFS persistent context.
**Delivers:** `get_job_postings`, `get_job_details`, `search_jobs`, `get_my_applications`, `get_interview_schedule`; co-op integration complete
**Uses:** Shared Playwright context from `src/auth.ts`; headed browser mode
**Implements:** `src/waterloo-works/auth.ts`, `src/waterloo-works/client.ts`, `src/tools/coop.ts`
**Avoids:** Headless bot detection (Pitfall #2); isolated selectors with try/catch (Pitfall #3); WaterlooWorks session expiry on 302 (Pitfall #12); shared context timeout (Pitfall #10)
**Research flag:** NEEDS VALIDATION — WaterlooWorks HTML selectors are LOW confidence from training data; expect iteration on selector names during implementation. Treat selectors as configuration from day one.

### Phase 6: Polish and Hardening
**Rationale:** After all features work individually, audit for long-running session edge cases, error message quality, and documentation completeness. Token refresh behavior and WaterlooWorks session re-auth paths need explicit end-to-end testing.
**Delivers:** README with auth setup instructions, `.env.example`, error handling audit, long-session token refresh verification, rate limiting validation under load
**Avoids:** Token expiry surfacing to users (Pitfall #4 — audit); session invalidation after 30+ min WaterlooWorks use (Pitfall #12)

### Phase Ordering Rationale

- Auth before everything else because every tool call — D2L REST and WaterlooWorks scraping — requires a valid session. Testing any tool without working auth is impossible.
- D2L tools before study tools because `sync_all` calls `getAssignments()` per course; the D2L client must be proven before building the integration bridge.
- Study tools before WaterlooWorks because `plan_week` gains co-op interview awareness in Phase 5. Delivering the planning layer first means Phase 5 only needs to add interview data to an already-working planner.
- WaterlooWorks last because it is the highest-risk component and failure here should not block delivery of the core D2L and study value.

### Research Flags

Phases needing deeper research or real-system validation during planning:
- **Phase 2 (Auth):** UWaterloo Shibboleth selector names (`j_username`, `j_password`) are MEDIUM confidence from training data. Must be confirmed against the live `idp.uwaterloo.ca` page on first implementation attempt. Do not assume selectors match without testing.
- **Phase 5 (WaterlooWorks):** All CSS selectors for job postings table, application status, interview schedule are LOW confidence. Treat selector discovery as an explicit sub-task. The page structure at `waterlooworks.uwaterloo.ca` may have changed since training data cutoff (Aug 2025).

Phases with standard, well-documented patterns (safe to skip research-phase):
- **Phase 1 (Scaffolding):** ESM + NodeNext + better-sqlite3 pattern is well-documented; STACK.md has exact tsconfig and pitfall prevention.
- **Phase 3 (D2L Tools):** D2L Brightspace REST API v1.57 patterns port directly from McMaster reference. HIGH confidence.
- **Phase 4 (Study Tools):** SQLite WAL/FTS5 patterns and notes pipeline are well-documented; McMaster reference is the primary guide; known bug (delete-reinsert) is documented with fix.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm registry 2026-03-21; McMaster reference validates all core packages |
| Features | MEDIUM | D2L feature scope is HIGH (McMaster reference); WaterlooWorks feature scope is MEDIUM (no reference implementation; training data Aug 2025) |
| Architecture | HIGH | McMaster reference provides validated patterns for all D2L + study components; WaterlooWorks architecture is a straightforward extension of the shared-context pattern |
| Pitfalls | HIGH | McMaster git history analysis provided real bug evidence; WaterlooWorks pitfalls are inference from Playwright docs + bot-detection knowledge |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **WaterlooWorks selector names:** Training data (Aug 2025) may not reflect current HTML. Plan for a selector-discovery session against the live site during Phase 5. Budget time for this — it is not a risk that can be mitigated by research; it requires testing.
- **UWaterloo Shibboleth ADFS form:** The `j_username`/`j_password` selector names are widely used by Shibboleth installations but must be confirmed on first Phase 2 auth attempt. Do not build Phase 3+ assuming auth works without actually running `auth-cli.ts`.
- **WaterlooWorks session cookie lifetime:** The actual session expiry duration is unknown. Implement the 302-redirect re-auth handling in Phase 5 and observe real session lifetime during testing.
- **D2L API rate limits:** McMaster reference anecdotally handles <10 courses without rate limiting. UWaterloo students with many semesters of enrollment history may hit limits during `sync_all`. The 100-200ms inter-call delay is a reasonable starting point; adjust based on observed behavior.

## Sources

### Primary (HIGH confidence)
- McMaster a2l-mcp reference implementation (`C:/Users/fortn/mcpmac/`) — all D2L tools, auth patterns, SQLite patterns, marshal.ts, git history bug analysis
- npm registry (2026-03-21) — version verification for all packages in STACK.md
- @modelcontextprotocol/sdk documentation — MCP server and transport patterns
- better-sqlite3 documentation — FTS5, WAL mode, ESM native module behavior

### Secondary (MEDIUM confidence)
- UWaterloo academic systems knowledge (training data, Aug 2025 cutoff) — LEARN structure, WaterlooWorks feature set, co-op cycle mechanics, UW Quest portal existence
- D2L Brightspace REST API v1.57 (implied by McMaster reference) — endpoint capability boundary

### Tertiary (LOW confidence)
- WaterlooWorks HTML structure and CSS selectors — training data only; must validate against live site during Phase 5
- UWaterloo Shibboleth ADFS form selector names — training data; must validate during Phase 2
- WaterlooWorks session cookie expiry duration — unknown; observe during Phase 5 testing

---
*Research completed: 2026-03-21*
*Ready for roadmap: yes*
