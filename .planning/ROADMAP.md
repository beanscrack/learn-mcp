# Roadmap: uwlearn-mcp

## Overview

Six phases build the UWaterloo LEARN + WaterlooWorks MCP server in strict dependency order: project scaffolding first to catch ESM/NodeNext issues early, then ADFS auth (the single point of failure everything else depends on), then D2L tools ported from the McMaster reference, then local SQLite study tools that bridge D2L data into offline planning, then the high-risk WaterlooWorks scraping layer (no public API, bot detection), and finally a polish pass to harden long-session edge cases and complete documentation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Scaffolding** - TypeScript ESM project foundation with all dependencies pinned
- [ ] **Phase 2: Authentication** - UWaterloo ADFS SSO + Duo MFA + MCP server skeleton
- [ ] **Phase 3: D2L Tools** - Full D2L Brightspace REST API tool suite
- [ ] **Phase 4: Study Tools** - Local SQLite tasks, notes, and sync bridge
- [ ] **Phase 5: WaterlooWorks** - Co-op job portal scraping via shared Playwright session
- [ ] **Phase 6: Polish** - Error handling audit, README, long-session hardening

## Phase Details

### Phase 1: Scaffolding
**Goal**: A compilable TypeScript ESM project with all dependencies installed and verified
**Depends on**: Nothing (first phase)
**Requirements**: SCAF-01, SCAF-02, SCAF-03, SCAF-04
**Success Criteria** (what must be TRUE):
  1. `npm run build` completes with zero errors
  2. All required packages are present in node_modules with pinned versions (pdf-parse@1.1.1, playwright@1.58.2, better-sqlite3@12.8.0)
  3. `.env.example` exists and documents all required and optional environment variables
  4. `.gitignore` excludes dist/, node_modules/, .env, and session directories
**Plans**: TBD

### Phase 2: Authentication
**Goal**: User can authenticate with UWaterloo ADFS SSO and the MCP server skeleton starts with dual transport
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, MCP-01, MCP-02, MCP-03
**Success Criteria** (what must be TRUE):
  1. User runs `node dist/auth-cli.js`, browser opens to UWaterloo ADFS login, Duo MFA completes, and token is cached to `~/.uwlearn-session/`
  2. Starting the MCP server a second time reuses the cached session without launching a browser
  3. A 401 response from D2L triggers automatic token refresh without user intervention
  4. MCP server starts and accepts connections on both stdio and HTTP transports
  5. Tool errors return structured JSON distinguishing auth errors from API errors
**Plans**: TBD

### Phase 3: D2L Tools
**Goal**: Users can query all D2L Brightspace data (courses, assignments, grades, calendar, content, announcements, files) through MCP tools
**Depends on**: Phase 2
**Requirements**: ENRL-01, ASGN-01, ASGN-02, ASGN-03, GRAD-01, CALD-01, CONT-01, CONT-02, CONT-03, CONT-04, NEWS-01, FILE-01, FILE-02, FILE-03
**Success Criteria** (what must be TRUE):
  1. User can call `get_my_courses` and receive a list of currently enrolled courses
  2. User can call `get_upcoming_due_dates` with a daysAhead parameter and receive assignments due in that window
  3. User can call `get_my_grades` for a course and see all grade items
  4. User can call `download_file` and then `read_file` to retrieve and read course file content
  5. User can call `get_announcements` and receive the latest course news items
**Plans**: TBD

### Phase 4: Study Tools
**Goal**: Users can manage a local task list, sync D2L assignments into it, search uploaded notes, and get a weekly plan
**Depends on**: Phase 3
**Requirements**: STDY-01, STDY-02, STDY-03, STDY-04, STDY-05, STDY-06, STDY-07, STDY-08, STDY-09, STDY-10
**Success Criteria** (what must be TRUE):
  1. SQLite database at `~/.uwlearn-mcp/uwlearn.db` initializes on first start with tasks table and FTS5 note_sections table
  2. User can call `sync_all` and have D2L assignments appear as tasks in `tasks_list` without data loss on repeat calls
  3. User can add, complete, and list tasks through `tasks_add`, `tasks_complete`, `tasks_list`
  4. User can call `notes_sync` pointing at a folder of PDFs and then find relevant chunks via `notes_search`
  5. User can call `plan_week` and receive a combined view of tasks and upcoming D2L due dates
**Plans**: TBD

### Phase 5: WaterlooWorks
**Goal**: Users can browse co-op job postings, view application status, and check interview schedule through MCP tools
**Depends on**: Phase 2
**Requirements**: COOP-01, COOP-02, COOP-03, COOP-04, COOP-05, COOP-06, COOP-07, SCRP-01, SCRP-02, SCRP-03
**Success Criteria** (what must be TRUE):
  1. User can call `get_job_postings` and receive a list of co-op postings without a separate WaterlooWorks login
  2. User can call `search_jobs` with a keyword and receive filtered results
  3. User can call `get_my_applications` and see their current co-op application statuses
  4. User can call `get_interview_schedule` and see upcoming interviews
  5. When a WaterlooWorks CSS selector fails, the tool returns partial data instead of throwing an exception
**Plans**: TBD

### Phase 6: Polish
**Goal**: The MCP server handles long-running session edge cases gracefully and users can set it up from the README alone
**Depends on**: Phase 5
**Requirements**: (none — hardening phase; all v1 requirements fulfilled in Phases 1-5)
**Success Criteria** (what must be TRUE):
  1. README contains step-by-step setup instructions that a new user can follow from clone to first tool call
  2. A token that expires mid-session triggers re-auth transparently without surfacing an error to the MCP client
  3. All tool error responses include actionable messages distinguishing auth failures, network errors, and D2L API errors
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffolding | 0/TBD | Not started | - |
| 2. Authentication | 0/TBD | Not started | - |
| 3. D2L Tools | 0/TBD | Not started | - |
| 4. Study Tools | 0/TBD | Not started | - |
| 5. WaterlooWorks | 0/TBD | Not started | - |
| 6. Polish | 0/TBD | Not started | - |
