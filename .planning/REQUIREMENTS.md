# Requirements: uwlearn-mcp

**Defined:** 2026-03-21
**Core Value:** UWaterloo students can ask their AI assistant about courses, deadlines, grades, and co-op jobs — handled by a single MCP server with ADFS SSO and local study planning.

## v1 Requirements

### Scaffolding

- [ ] **SCAF-01**: Project initializes with TypeScript ESM modules, NodeNext resolution, and ES2022 target
- [ ] **SCAF-02**: package.json includes all required dependencies with pinned versions (pdf-parse@1.1.1, playwright@1.58.2, better-sqlite3@12.8.0)
- [ ] **SCAF-03**: .env.example documents all required and optional environment variables
- [ ] **SCAF-04**: .gitignore excludes dist/, node_modules/, .env, ~/.uwlearn-session/

### Authentication

- [ ] **AUTH-01**: User can run auth-cli.ts in headed browser to complete UWaterloo ADFS SSO and Duo MFA
- [ ] **AUTH-02**: Bearer token captured from D2L API requests and cached to ~/.uwlearn-session/
- [ ] **AUTH-03**: Token cache expires after 22 hours (23h D2L token minus 1h buffer)
- [ ] **AUTH-04**: MCP server reuses cached session without re-launching browser on subsequent starts
- [ ] **AUTH-05**: 401 response from D2L API triggers automatic token refresh
- [ ] **AUTH-06**: WaterlooWorks auth reuses the same ADFS Playwright session as LEARN (no separate login)

### D2L — Enrollments

- [ ] **ENRL-01**: User can retrieve list of enrolled courses (get_my_courses)

### D2L — Assignments

- [ ] **ASGN-01**: User can retrieve all assignments for a course (get_assignments)
- [ ] **ASGN-02**: User can retrieve details for a specific assignment (get_assignment)
- [ ] **ASGN-03**: User can check submission status for an assignment (get_assignment_submissions)

### D2L — Grades

- [ ] **GRAD-01**: User can retrieve all grades for a course (get_my_grades)

### D2L — Calendar

- [ ] **CALD-01**: User can retrieve upcoming due dates with configurable daysBack/daysAhead window (get_upcoming_due_dates)

### D2L — Content

- [ ] **CONT-01**: User can retrieve course content overview (get_course_content)
- [ ] **CONT-02**: User can retrieve course module list (get_course_modules)
- [ ] **CONT-03**: User can retrieve a specific module (get_course_module)
- [ ] **CONT-04**: User can retrieve a specific topic (get_course_topic)

### D2L — Announcements

- [ ] **NEWS-01**: User can retrieve course announcements (get_announcements)

### D2L — Files

- [ ] **FILE-01**: User can download a file from D2L (download_file)
- [ ] **FILE-02**: User can read a downloaded file's content (read_file)
- [ ] **FILE-03**: User can delete a downloaded file (delete_file)

### MCP Server

- [ ] **MCP-01**: MCP server supports stdio transport (Claude Desktop)
- [ ] **MCP-02**: MCP server supports HTTP transport (remote/API use)
- [ ] **MCP-03**: All tool errors return structured JSON error responses distinguishing auth errors from API errors

### Study Tools — Storage

- [ ] **STDY-01**: SQLite database initialized at ~/.uwlearn-mcp/uwlearn.db with WAL mode and FTS5 virtual table
- [ ] **STDY-02**: Database schema includes tasks table and note_sections table with unicode61 FTS5 tokenizer

### Study Tools — Task Management

- [ ] **STDY-03**: User can list all tasks with optional filter by completion status (tasks_list)
- [ ] **STDY-04**: User can add a task with title and optional due date (tasks_add)
- [ ] **STDY-05**: User can mark a task as complete (tasks_complete)
- [ ] **STDY-06**: User can get a weekly plan combining tasks and upcoming due dates (plan_week)

### Study Tools — Sync

- [ ] **STDY-07**: User can sync all D2L assignments to local SQLite tasks (sync_all) using UPSERT to avoid data loss

### Study Tools — Notes

- [ ] **STDY-08**: User can sync PDF and .docx files from a folder into SQLite note chunks (notes_sync)
- [ ] **STDY-09**: User can search notes by keyword with FTS5 prefix matching (notes_search)
- [ ] **STDY-10**: User can get note suggestions relevant to a task or assignment (notes_suggest_for_item)

### WaterlooWorks — Co-op Jobs

- [ ] **COOP-01**: User can retrieve job postings with optional filters for term, jobType, location, limit (get_job_postings)
- [ ] **COOP-02**: User can retrieve full job description for a specific posting (get_job_details)
- [ ] **COOP-03**: User can search job postings by keyword with optional filters (search_jobs)
- [ ] **COOP-04**: User can retrieve all their co-op applications (get_my_applications)
- [ ] **COOP-05**: User can retrieve their interview schedule (get_interview_schedule)
- [ ] **COOP-06**: User can retrieve their co-op ranking status (get_ranking_status)
- [ ] **COOP-07**: User can retrieve their saved/watchlisted job postings (get_saved_jobs)

### WaterlooWorks — Scraping Reliability

- [ ] **SCRP-01**: All WaterlooWorks CSS selectors are isolated in waterloo-works/client.ts
- [ ] **SCRP-02**: All selector failures return partial data (not exceptions) with logged selector names
- [ ] **SCRP-03**: All page operations have explicit timeouts (30s for navigation, 10s for selectors)

## v2 Requirements

### UW Quest

- **QUEST-01**: User can retrieve exam schedule from UW Quest
- **QUEST-02**: User can retrieve final course grades from UW Quest
- *Note: Requires separate Playwright session; Quest uses PeopleSoft — different auth flow from LEARN*

### Extended Notes

- **NOTES-01**: User can generate OpenAI embeddings for notes (notes_embed_missing)
- *Note: Deferred — requires OPENAI_API_KEY; FTS5 keyword search ships in v1*

### Extended WaterlooWorks

- **COOP-08**: User can retrieve work term report status (get_work_term_reports)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Assignment submission via MCP | Irreversible, high-stakes academic action; read-only is intentional |
| Job application submission via MCP | Co-op applications are high-stakes; automate discovery, not submission |
| Piazza / Ed Discussion integration | UWaterloo mid-transition Piazza → Ed Discussion; high maintenance for low marginal value |
| Multi-university abstraction | Keep UWaterloo-specific; others fork |
| Real-time notifications / webhooks | MCP is request-response; no push mechanism |
| Multi-account support | Single-user personal tool; multi-account = ToS risk |
| WaterlooWorks aggressive polling | Session invalidation risk; on-demand only |
| Mobile app | MCP server only |
| GPA calculator tool | Claude reasons over get_my_grades output directly |

## Traceability

*Populated during roadmap creation*

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCAF-01 – SCAF-04 | Phase 1 | Pending |
| AUTH-01 – AUTH-06 | Phase 2 | Pending |
| ENRL-01, ASGN-01–03, GRAD-01, CALD-01 | Phase 3 | Pending |
| CONT-01–04, NEWS-01, FILE-01–03 | Phase 3 | Pending |
| MCP-01–03 | Phase 2–3 | Pending |
| STDY-01–10 | Phase 4 | Pending |
| COOP-01–07, SCRP-01–03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 41 total
- Mapped to phases: 41
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 after initial definition*
