# Architecture Research

**Domain:** TypeScript MCP server — D2L Brightspace REST API + Playwright ADFS auth + WaterlooWorks scraping + SQLite
**Researched:** 2026-03-21
**Confidence:** HIGH (based on McMaster reference implementation analysis)

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Client (Claude)                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ stdio / HTTP
┌───────────────────────────▼─────────────────────────────────────┐
│                     src/index.ts (MCP Server)                    │
│           Tool registration + dual transport (stdio + HTTP)      │
└──┬──────────┬──────────┬──────────┬──────────┬──────────────────┘
   │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼
tools/     tools/     tools/     tools/   tools/coop.ts
assign.ts  grades.ts  content.ts study/   (WaterlooWorks)
calendar   news.ts    files.ts   planning
enrollments
   │                                │          │
   └──────────────┬─────────────────┘          │
                  ▼                            ▼
          src/client.ts              waterloo-works/client.ts
       (D2L REST API client)         (Playwright scraping client)
                  │                            │
                  └──────────┬─────────────────┘
                             ▼
                      src/auth.ts
              (Playwright ADFS SSO + token cache)
              ~/.uwlearn-session/ (persistent context)
                             │
                             ▼
                    learn.uwaterloo.ca
                    waterlooworks.uwaterloo.ca
```

## Components

### 1. `src/auth.ts` — Authentication Core

**Responsibility:** Single entry point for authenticated Playwright context. Captures Bearer token from D2L API requests. Manages session persistence and token refresh.

**Key functions:**
- `getAuthenticatedContext()` — Returns Playwright browser context. Reuses cached session if token valid (23h - 1h buffer). Launches headed browser if Duo MFA required.
- `isLoginPage(page)` — Detects ADFS login page by URL (`idp.uwaterloo.ca`) or DOM selector
- `performLogin(page)` — Fills `j_username` / `j_password`, submits ADFS form, handles Duo redirect
- `captureToken(context)` — Intercepts network requests matching `/d2l/api/*` with `Authorization: Bearer` header

**Session storage:** `~/.uwlearn-session/` — Playwright persistent context directory. Survives process restarts.

**Token cache:** In-memory + file (`~/.uwlearn-session/token.json`). Invalidated if token age > 22h.

### 2. `src/auth-cli.ts` — Standalone Login Script

**Responsibility:** Headful login for initial auth and Duo MFA. Run once manually; subsequent MCP server starts reuse the session.

```bash
node dist/auth-cli.js
# Opens browser → ADFS form → Duo MFA → captures token → exits
```

### 3. `src/client.ts` — D2L REST API Client

**Responsibility:** Wraps fetch with auth headers. Maps D2L Brightspace v1.57 endpoints to typed methods.

**Key methods:** `getEnrollments()`, `getAssignments(orgUnitId)`, `getGrades(orgUnitId)`, `getCalendar(orgUnitId, params)`, `getContent(orgUnitId)`, `getAnnouncements(orgUnitId)`, `downloadFile(url)`

**Auth integration:** Calls `getToken()` from auth.ts before each request. Auto-retries on 401 with token refresh.

### 4. `src/waterloo-works/auth.ts` — WaterlooWorks Session

**Responsibility:** Reuse the ADFS session from auth.ts to authenticate on waterlooworks.uwaterloo.ca. No separate login if ADFS session is active.

**Pattern:** `getAuthenticatedContext()` from auth.ts returns a persistent Playwright context. Navigate to WaterlooWorks — ADFS SSO redirect completes automatically if session cookie is valid.

### 5. `src/waterloo-works/client.ts` — WaterlooWorks Scraping

**Responsibility:** Playwright scraping of WaterlooWorks pages. All CSS selectors isolated here — any WaterlooWorks HTML change only requires edits in this file.

**Key methods:** `getJobPostings(filters)`, `getJobDetails(jobId)`, `getApplications()`, `getInterviews()`, `searchJobs(query, filters)`

**Defensive extraction:** Every `page.$eval()` wrapped in try/catch. Returns partial data on selector failure. Logs which selectors failed.

### 6. `src/tools/*.ts` — D2L Tool Implementations

**Responsibility:** One file per domain. Each exports tool definitions (name, description, inputSchema) and handler functions.

**Pattern:**
```typescript
export const assignments_tools = [
  { name: 'get_assignments', description: '...', inputSchema: GetAssignmentsSchema }
];
export async function handle_get_assignments(args, client) { ... }
```

### 7. `src/tools/coop.ts` — WaterlooWorks Tool Implementations

**Responsibility:** MCP tools for WaterlooWorks data. Uses waterloo-works/client.ts for all scraping.

### 8. `src/study/store.ts` — SQLite Storage Layer

**Responsibility:** Database initialization, schema migration, typed query methods. Single source of truth for SQLite access.

**Schema:**
```sql
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  due_date TEXT,
  source TEXT DEFAULT 'manual', -- 'manual' | 'd2l'
  d2l_id TEXT,
  completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE note_sections (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  chunk_index INTEGER,
  content TEXT NOT NULL,
  embedding TEXT -- JSON array, nullable
);

CREATE VIRTUAL TABLE note_sections_fts
  USING fts5(content, note_id UNINDEXED, tokenize='unicode61');
```

### 9. `src/index.ts` — MCP Server Entry Point

**Responsibility:** Instantiate McpServer, register all tools, start dual transport.

**Dual transport pattern:**
```typescript
const server = new McpServer({ name: 'uwlearn-mcp', version: '1.0.0' });
// Register all tools
registerTool(server, assignments_tools, handle_get_assignments, client);
// ...

// stdio transport (for Claude Desktop)
const stdioTransport = new StdioServerTransport();
await server.connect(stdioTransport);

// HTTP transport (for remote/API use)
const app = express();
// ... StreamableHTTP transport setup
```

**Important:** One McpServer instance per server process. Do NOT create one per connection — this is a common MCP SDK mistake.

## Data Flow

### D2L Tool Call Flow
```
Claude → MCP tool call (e.g., get_assignments {orgUnitId: "123"})
  → index.ts handler
  → client.ts.getAssignments("123")
    → auth.ts.getToken() [cache hit: ~1ms | cache miss: Playwright re-auth ~5s]
    → fetch(`https://learn.uwaterloo.ca/d2l/api/le/1.57/123/dropbox/folders/`)
      with Authorization: Bearer <token>
    → parse JSON response
    → marshal.ts formatting
  → return MCP tool result
```

### WaterlooWorks Scraping Flow
```
Claude → MCP tool call (e.g., get_job_postings {term: "Winter 2026"})
  → coop.ts handler
  → waterloo-works/client.ts.getJobPostings({term: "Winter 2026"})
    → waterloo-works/auth.ts.getAuthenticatedPage()
      → auth.ts.getAuthenticatedContext() [shared session]
      → navigate to waterlooworks.uwaterloo.ca
      → [ADFS SSO auto-completes if session valid]
    → page.goto("/myAccount/co-op/coop-postings")
    → extract job table rows (isolated selectors)
    → return [{jobId, title, employer, location, deadline}, ...]
  → return MCP tool result
```

### sync_all Flow (D2L → SQLite)
```
Claude → sync_all tool call
  → sync.ts handler
  → client.ts.getEnrollments() → [course list]
  → for each course:
    → client.ts.getAssignments(orgUnitId) → [assignments]
    → store.ts.upsertTask({title, due_date, d2l_id, source: 'd2l'})
  → return {synced: N, new: M, updated: K}
```

## Build Order (Phase Dependencies)

```
Phase 1: Scaffolding
  package.json, tsconfig.json, .env.example
  (no deps)

Phase 2: Auth + Client + Server skeleton
  src/auth.ts           ← foundation for everything
  src/auth-cli.ts       ← depends on auth.ts
  src/client.ts         ← depends on auth.ts (getToken)
  src/index.ts          ← depends on MCP SDK (no tools yet, just server init)
  (test: auth-cli opens browser, prints token)

Phase 3: D2L Tools
  src/tools/*.ts        ← depend on client.ts
  src/utils/marshal.ts  ← no deps
  register tools in index.ts
  (test: get_my_courses returns enrollments)

Phase 4: Local Study Tools
  src/study/store.ts    ← depends on better-sqlite3
  src/study/planning.ts ← depends on store.ts
  src/study/notes.ts    ← depends on store.ts, pdf-parse, mammoth
  src/study/sync.ts     ← depends on store.ts + client.ts
  (test: sync_all populates SQLite, tasks_list returns results)

Phase 5: WaterlooWorks
  src/waterloo-works/auth.ts    ← depends on auth.ts (shared context)
  src/waterloo-works/client.ts  ← depends on waterloo-works/auth.ts
  src/tools/coop.ts             ← depends on waterloo-works/client.ts
  (test: get_job_postings returns listings)

Phase 6: Polish
  README, .env.example, error handling audit
```

## Anti-Patterns to Avoid

1. **New Playwright context per WaterlooWorks request** — Creates multiple browser instances, triggers bot detection. Use the shared persistent context from auth.ts.

2. **McpServer instance per connection** — MCP SDK creates one server; connections are transports. Creating multiple McpServer instances causes tool registration duplication.

3. **Hardcoding D2L orgUnitId** — Each student has different course IDs. Always call `getEnrollments()` first to get course IDs dynamically.

4. **Synchronous file reads in tool handlers** — better-sqlite3 is sync (correct); but file I/O in notes tools should use Node's `fs/promises` for PDF reading.

5. **Storing Bearer token in environment variables** — Token is ephemeral (22h max); store in memory + `~/.uwlearn-session/token.json`, not `.env`.

## Sources

- McMaster a2l-mcp reference implementation (C:/Users/fortn/mcpmac/) — HIGH confidence for all component patterns
- @modelcontextprotocol/sdk documentation — MCP server + transport patterns
- Project context: C:/Users/fortn/uwlearn-mcp/.planning/PROJECT.md

---
*Architecture research for: UWaterloo LEARN MCP server (uwlearn-mcp)*
*Researched: 2026-03-21*
