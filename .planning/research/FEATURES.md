# Feature Research

**Domain:** UWaterloo student MCP server (D2L LEARN + WaterlooWorks co-op)
**Researched:** 2026-03-21
**Confidence:** MEDIUM — UWaterloo platform knowledge from training data (Aug 2025 cutoff); WaterlooWorks scraping specifics are LOW confidence given no public API

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features a UWaterloo student assumes exist when they install this tool. Missing these makes the tool feel broken or incomplete before it gets a fair evaluation.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `get_my_courses` | First thing any student asks: "what am I enrolled in?" | LOW | D2L enrollments API; already planned |
| `get_assignments` | Core academic workflow — deadlines drive student stress | LOW | D2L dropbox API; already planned |
| `get_upcoming_due_dates` | Cross-course deadline view is the primary daily-use case | LOW | D2L calendar API; already planned |
| `get_my_grades` | Students check grades constantly; missing this = not useful | LOW | D2L grades API; already planned |
| `get_announcements` | Prof announcements contain critical info (exam changes, extensions) | LOW | D2L news API; already planned |
| `get_job_postings` | WaterlooWorks job browsing is the entire co-op workflow trigger | HIGH | Playwright scraping; fragile by nature |
| `get_my_applications` | Students track which jobs they applied to — high-anxiety use case | HIGH | Playwright scraping |
| Authentication (ADFS SSO) | Tool is literally unusable without auth | HIGH | Playwright ADFS + Duo MFA; already planned |
| `download_file` + `read_file` | Slides, assignments, rubrics — students need to read course files | MEDIUM | D2L content download; already planned |
| `get_course_content` | Course materials are what students actually need to study | LOW | D2L content API; already planned |

### Differentiators (Competitive Advantage)

Features that make this MCP meaningfully better than a student manually navigating LEARN and WaterlooWorks in a browser. These justify the installation friction.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `search_jobs` with filter parameters | Students browse hundreds of postings per cycle; keyword + city + discipline filters save hours | HIGH | WaterlooWorks search form scraping; must handle pagination |
| `get_interview_schedule` | Interview times, locations, and formats are high-anxiety; having Claude read them out is genuinely useful | HIGH | WaterlooWorks scraping; format may vary by interview type (in-person vs virtual) |
| `sync_all` (D2L → SQLite tasks) | Automatically imports all assignment deadlines into local task store; bridges LEARN and the planning layer | MEDIUM | Already planned; key integration glue |
| `plan_week` with co-op awareness | A weekly plan that says "you have 3 interviews Mon/Tue AND assignments due Wed/Thu" is uniquely valuable for co-op terms | MEDIUM | Requires tasks + interview schedule to be loaded; Claude does the reasoning |
| `notes_search` + `notes_suggest_for_item` | Searching your own notes by topic ("find what I wrote about dynamic programming") is impossible manually across PDFs | HIGH | FTS5 + optional OpenAI embeddings; already planned |
| `get_job_details` | Full JD text piped to Claude for "does this job match my skills?" analysis | HIGH | WaterlooWorks scraping; must handle varying JD formats |
| Co-op application status summary | "Show me all jobs where I'm ranked/in interview stage" — Claude can reason over `get_my_applications` output | LOW (tool exists) | Value is in how Claude prompts the tool, not new implementation |
| `notes_embed_missing` (semantic search) | Vector similarity finds notes related to an assignment even without exact keyword matches | HIGH | Optional OpenAI dependency; worth adding even if deferred |

### UWaterloo-Specific Features Not Yet Planned

These are UWaterloo-specific features the planned tool set is missing. Assessed against what UW students actually need.

| Feature | Why UW-Specific | Complexity | Recommendation |
|---------|-----------------|------------|----------------|
| **WaterlooWorks co-op ranking status** | WaterlooWorks uses a specific "Continuous Ranking" (CR) and "Ranked" matching system — students obsessively check their rank during ranking periods | HIGH | Add `get_ranking_status` tool; scrape the Rankings tab on WaterlooWorks |
| **WaterlooWorks application deadline awareness** | Co-op job postings have application open/close windows (typically 5-business-day cycles); students need to know "when does this posting close?" | MEDIUM | Include `application_deadline` field in `get_job_postings` and `get_job_details` responses |
| **UW Quest integration (exam schedule)** | Final exams at UWaterloo are posted on UW Quest (not LEARN); students need "when are my exams?" | HIGH | UW Quest is a separate PeopleSoft portal with no public API — requires Playwright scraping. Flag as v2. |
| **UW Quest grade check** | Final course grades post to Quest, not LEARN (LEARN grades are midterm/assignment grades only) | HIGH | Same Quest portal — separate auth session likely required. Flag as v2. |
| **Academic calendar / term dates** | UWaterloo's academic calendar (reading week, last day of classes, exam period) is on the UW website, not LEARN | LOW | Could be static data or scraped from uwaterloo.ca/registrar. Lower priority — dates don't change often. |
| **WaterlooWorks saved jobs / watchlist** | Students save interesting postings during browsing; a `get_saved_jobs` tool mirrors real workflow | MEDIUM | WaterlooWorks has a saved jobs feature; worth scraping if selector is stable |
| **Co-op work term report tracking** | WaterlooWorks tracks work report submissions; co-op students must submit mid-term and final reports | MEDIUM | Available on WaterlooWorks — `get_work_term_reports` would surface status and deadlines |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Submitting assignments via MCP** | "I want Claude to submit my assignment" sounds convenient | D2L submission is consequential and irreversible; mistakes (wrong file, wrong assignment) are high-stakes; liability and academic integrity concerns; Brightspace submission UX has confirmation steps for good reason | Keep tool as read-only for submissions; let `get_assignment_submissions` confirm what was submitted manually |
| **Applying to jobs via MCP** | Automating WaterlooWorks applications sounds like a time-saver | WaterlooWorks applies have cover letter selection, custom fields, and application limits per cycle; an automated apply could burn an application on the wrong job posting; co-op applications are high-stakes (affects 4-month employment) | `get_job_details` + Claude's analysis is the right value; student applies manually after Claude's recommendation |
| **WaterlooWorks scraping with aggressive polling** | Students want real-time job alerts | WaterlooWorks is scraping-sensitive (no public API) and the session is shared with LEARN auth; aggressive polling risks session invalidation, IP blocking, or account flags | On-demand tool calls only; no polling loop; users ask Claude to check when they want to |
| **Piazza / Ed Discussion integration** | McMaster reference includes Piazza; students use course forums | UWaterloo is mid-transition from Piazza to Ed Discussion (varies by course/prof); building scrapers for both is high maintenance for low marginal value over LEARN announcements | Out of scope for v1; LEARN announcements cover most critical prof communications; can add Ed Discussion in v2 if demand is clear |
| **Grade prediction / GPA calculator** | Students want "what do I need on the final to get an X?" | This is arithmetic Claude can already do with `get_my_grades` output; building a dedicated tool adds no value | Let Claude reason over `get_my_grades` output; no separate tool needed |
| **Real-time notifications / webhooks** | Students want push alerts for new job postings | MCP is a request-response protocol; push notifications require a separate daemon process outside MCP scope; adds operational complexity with no MCP precedent | Out of scope; tool is on-demand by design |
| **Multi-account support** | "I want to use someone else's session / manage multiple students" | Authentication is intentionally personal (ADFS SSO tied to WatID); multi-account creates credential management complexity and potential ToS violations | One session per install; single-user by design |

---

## Feature Dependencies

```
Authentication (ADFS SSO)
    └──required by──> ALL D2L tools
    └──required by──> ALL WaterlooWorks tools
    └──shared session──> WaterlooWorks Playwright client

get_my_courses
    └──enables──> get_assignments (provides orgUnitId list)
    └──enables──> get_my_grades (provides orgUnitId list)
    └──enables──> get_announcements (provides orgUnitId list)
    └──enables──> get_course_content (provides orgUnitId list)
    └──enables──> get_upcoming_due_dates (provides orgUnitId list)

get_assignments
    └──required by──> get_assignment (needs assignmentId)
    └──required by──> get_assignment_submissions (needs assignmentId)
    └──feeds──> sync_all (imports assignments as tasks)

sync_all
    └──required by──> tasks_list (populates local SQLite)
    └──required by──> plan_week (needs tasks in DB to plan)
    └──depends on──> get_assignments (pulls from D2L)
    └──depends on──> SQLite DB init

notes_sync
    └──required by──> notes_search
    └──required by──> notes_suggest_for_item
    └──required by──> notes_embed_missing

notes_embed_missing (optional)
    └──enhances──> notes_search (enables semantic search)
    └──enhances──> notes_suggest_for_item (better relevance)
    └──requires──> OPENAI_API_KEY env var

get_job_postings
    └──enables──> get_job_details (provides job IDs)
    └──enables──> search_jobs (context for result interpretation)

get_my_applications
    └──enables──> get_interview_schedule (applications with interview status)

plan_week
    └──enhanced by──> get_interview_schedule (co-op interview awareness)
    └──depends on──> tasks_list (reads from SQLite)
```

### Dependency Notes

- **All D2L tools require auth:** The ADFS token capture must succeed before any D2L API call. Auth failure returns auth-required error, not empty data.
- **All WaterlooWorks tools require shared auth session:** WaterlooWorks uses the same ADFS login as LEARN; a shared Playwright session means one Duo MFA prompt covers both.
- **sync_all is the integration bridge:** It is the only tool that connects the D2L layer to the local study layer. Without it, `plan_week` and `tasks_list` have nothing to work with unless tasks are added manually.
- **notes_embed_missing enhances but doesn't gate notes_search:** FTS5 keyword search works without OpenAI embeddings. Semantic search is an optional enhancement, not a requirement.
- **get_course_modules vs get_course_content:** `get_course_content` is a broad overview; `get_course_modules` + `get_course_module` + `get_course_topic` are the drill-down path. Claude should call content first, then drill down to specific topics.

---

## MVP Definition

### Launch With (v1)

Minimum viable product for a UWaterloo student to get genuine daily value.

- [ ] `get_my_courses` — without course list, nothing else works
- [ ] `get_assignments` + `get_upcoming_due_dates` — deadline awareness is the #1 use case
- [ ] `get_my_grades` — second most-checked thing after deadlines
- [ ] `get_announcements` — prof communications, critical for co-op terms when profs announce changes
- [ ] `get_course_content` + `get_course_modules` + `get_course_topic` — course material access
- [ ] `download_file` + `read_file` — needed to actually read slides/assignments
- [ ] `sync_all` + `tasks_list` + `tasks_add` + `tasks_complete` — local task management that bridges LEARN data
- [ ] `plan_week` — the payoff tool that makes the whole stack useful daily
- [ ] `get_job_postings` + `get_job_details` + `search_jobs` — co-op integration is the UW differentiator; missing this makes the tool just another LEARN MCP
- [ ] `get_my_applications` — co-op students live in their applications list

### Add After Validation (v1.x)

- [ ] `get_interview_schedule` — add once basic co-op tools work and selectors are stable; interview data is more volatile to scrape
- [ ] `notes_sync` + `notes_search` + `notes_suggest_for_item` — high value but requires user to have notes organized; add once core tools are validated
- [ ] `notes_embed_missing` — add when notes_sync is working; semantic search upgrades the notes layer but keyword search ships first
- [ ] `get_assignment_submissions` — useful for checking submission status; lower urgency than deadlines and grades
- [ ] `get_ranking_status` (WaterlooWorks) — add once base WaterlooWorks scraping is stable; ranking page has different selectors

### Future Consideration (v2+)

- [ ] UW Quest exam schedule scraping — separate portal, separate auth session, separate Playwright flow; high value but significant implementation scope
- [ ] UW Quest final grades — same reasons as exam schedule; defer until Quest Playwright session is proven
- [ ] `get_saved_jobs` (WaterlooWorks) — lower urgency than active application workflow; add if users report wanting it
- [ ] `get_work_term_reports` — relevant only during active work terms; niche enough to defer
- [ ] Ed Discussion / Piazza integration — course forum access; value is real but maintenance is high; defer until LEARN core is stable

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `get_my_courses` | HIGH | LOW | P1 |
| `get_assignments` | HIGH | LOW | P1 |
| `get_upcoming_due_dates` | HIGH | LOW | P1 |
| `get_my_grades` | HIGH | LOW | P1 |
| `get_announcements` | HIGH | LOW | P1 |
| `get_course_content` / `get_course_modules` | HIGH | LOW | P1 |
| `download_file` + `read_file` | HIGH | MEDIUM | P1 |
| `sync_all` | HIGH | MEDIUM | P1 |
| `tasks_list` / `tasks_add` / `tasks_complete` | HIGH | MEDIUM | P1 |
| `plan_week` | HIGH | MEDIUM | P1 |
| `get_job_postings` | HIGH | HIGH | P1 |
| `get_job_details` | HIGH | HIGH | P1 |
| `search_jobs` | HIGH | HIGH | P1 |
| `get_my_applications` | HIGH | HIGH | P1 |
| `get_interview_schedule` | HIGH | HIGH | P2 |
| `get_assignment_submissions` | MEDIUM | LOW | P2 |
| `notes_sync` + `notes_search` | HIGH | HIGH | P2 |
| `notes_suggest_for_item` | MEDIUM | MEDIUM | P2 |
| `notes_embed_missing` | MEDIUM | HIGH | P2 |
| `get_ranking_status` | HIGH | HIGH | P2 |
| UW Quest exam schedule | HIGH | HIGH | P3 |
| UW Quest final grades | HIGH | HIGH | P3 |
| `get_saved_jobs` | MEDIUM | MEDIUM | P3 |
| `get_work_term_reports` | LOW | MEDIUM | P3 |
| Academic calendar (static) | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch (core value + co-op integration)
- P2: Should have, adds meaningful depth; add in v1.x iteration
- P3: Nice to have; defer to v2 or until user demand validates

---

## Competitor Feature Analysis

There are no direct competitors — no other MCP server covers UWaterloo LEARN + WaterlooWorks. The relevant comparison is against manual workflows and adjacent tools.

| Feature | Manual Browser Workflow | McMaster a2l-mcp (Reference) | This MCP |
|---------|------------------------|------------------------------|----------|
| Course deadline overview | Navigate each LEARN course individually | `get_upcoming_due_dates` across all courses | Same as McMaster; port directly |
| Co-op job search | Click through WaterlooWorks; no AI analysis | N/A (McMaster has no co-op portal) | `search_jobs` + Claude analysis = genuine differentiator |
| Interview tracking | WaterlooWorks calendar tab; no synthesis | N/A | `get_interview_schedule` returns structured data for Claude to reason over |
| Notes search | macOS Spotlight or manual grep of PDFs | `notes_search` with FTS5 + optional vector | Same as McMaster; port directly |
| Weekly planning | Mental arithmetic over multiple tabs | `plan_week` with D2L-synced tasks | Same as McMaster; enhanced with co-op interview layer |
| Forum Q&A | Navigate to Piazza / Ed Discussion | Piazza scraping (McMaster) | Out of scope v1; UW is mid-transition to Ed Discussion |

---

## Sources

- McMaster a2l-mcp reference implementation (C:/Users/fortn/mcpmac/a2l-mcp/src/) — HIGH confidence for D2L tool patterns
- D2L Brightspace REST API v1.57 (implied by reference implementation) — HIGH confidence for API capability boundary
- UWaterloo academic systems knowledge (training data, Aug 2025 cutoff): LEARN (D2L), WaterlooWorks, UW Quest, co-op ranking cycle — MEDIUM confidence; WaterlooWorks UI details LOW confidence (scraping targets may have changed)
- Project context: C:/Users/fortn/uwlearn-mcp/.planning/PROJECT.md

---
*Feature research for: UWaterloo LEARN MCP Server (uwlearn-mcp)*
*Researched: 2026-03-21*
