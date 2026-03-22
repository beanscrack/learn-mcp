# UWaterloo LEARN MCP Server (uwlearn-mcp)

## What This Is

An MCP (Model Context Protocol) server for University of Waterloo's LEARN platform (D2L Brightspace) that gives AI assistants access to course assignments, grades, content, calendar, and announcements. It also integrates with WaterlooWorks, the co-op job portal, via Playwright-based scraping. Local SQLite replaces Supabase for zero-dependency study tools.

## Core Value

UWaterloo students can ask their AI assistant about their courses, deadlines, grades, and co-op job applications — all through a single MCP server that handles ADFS SSO auth and local study planning.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] UWaterloo ADFS SSO authentication via Playwright (Bearer token capture, Duo MFA support, 23h session cache)
- [ ] D2L Brightspace REST API client (API v1.57: dropbox, grades, content, calendar, news, enrollments, whoami)
- [ ] MCP server with dual transport (stdio + HTTP) and tool registration
- [ ] Assignment tools: get_assignments, get_assignment, get_assignment_submissions
- [ ] Grade tools: get_my_grades
- [ ] Calendar tools: get_upcoming_due_dates (configurable daysBack/daysAhead)
- [ ] Content tools: get_course_content, get_course_modules, get_course_module, get_course_topic
- [ ] Announcement tools: get_announcements
- [ ] Enrollment tools: get_my_courses
- [ ] File tools: download_file, read_file, delete_file
- [ ] Local SQLite study store (better-sqlite3, WAL mode, FTS5 full-text search)
- [ ] Task management tools: tasks_list, tasks_add, tasks_complete, plan_week
- [ ] Note tools: notes_sync (PDF extraction), notes_search (FTS5 + optional OpenAI vector), notes_suggest_for_item
- [ ] Sync tool: sync_all (D2L assignments → local SQLite tasks)
- [ ] WaterlooWorks scraping client (Playwright, shared ADFS session)
- [ ] Co-op tools: get_job_postings, get_job_details, get_my_applications, get_interview_schedule, search_jobs
- [ ] auth-cli.ts standalone script for headed browser initial login
- [ ] Comprehensive .env.example and README with setup instructions

### Out of Scope

- Multi-university abstraction — UWaterloo-specific; D2L client is portable by design but auth is not abstracted
- Supabase or any external database — SQLite only for zero external dependencies
- Mobile app — MCP server only
- Real-time notifications — polling/on-demand only

## Context

- Reference implementation: McMaster's Avenue to Learn MCP (mcpmac/a2l-mcp) — same D2L Brightspace API v1.57, same tool patterns, same dual transport. Auth differs: McMaster uses form-based ADFS, UWaterloo uses standard ADFS SSO redirect.
- WaterlooWorks has no public API — all integration is via Playwright scraping. Selectors isolated in waterloo-works/client.ts. Partial data return on extraction failure.
- SQLite via better-sqlite3 at ~/.uwlearn-mcp/uwlearn.db. FTS5 for keyword search. Optional OpenAI embeddings stored as JSON blobs with JS-side cosine similarity.
- Duo MFA required on first login — headed browser mandatory for auth-cli. Subsequent runs use cached session (~/.uwlearn-session/).
- Target repo: https://github.com/beanscrack/learn-mcp

## Constraints

- **Tech Stack**: TypeScript, ESM modules, ES2020 target — matches McMaster reference
- **Auth**: Playwright-based ADFS SSO — no OAuth, no username/password storage
- **Storage**: better-sqlite3 only — no Supabase, no external DB
- **Scraping**: WaterlooWorks via Playwright — fragile by nature, defensive extraction required
- **API**: D2L Brightspace REST API v1.57 — same as McMaster, just different host

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite over Supabase | Zero external dependencies for study tools | — Pending |
| WaterlooWorks via scraping | No public API exists | — Pending |
| Shared ADFS session for WaterlooWorks | Single login for both LEARN and WaterlooWorks | — Pending |
| Port McMaster D2L tools rather than rebuild | Same Brightspace API v1.57 — only auth and host differ | — Pending |
| No multi-university abstraction | Keep codebase simple; others can fork | — Pending |

---
*Last updated: 2026-03-21 after initialization*
