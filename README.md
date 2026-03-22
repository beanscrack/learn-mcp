# uwlearn-mcp

MCP server for University of Waterloo LEARN (D2L Brightspace) and WaterlooWorks co-op portal. Ask your AI assistant about courses, assignments, grades, deadlines, co-op jobs, and interviews — all from a single tool.

## What it does

| Category | Tools |
|----------|-------|
| **Courses** | `get_my_courses` |
| **Assignments** | `get_assignments`, `get_assignment`, `get_assignment_submissions` |
| **Grades** | `get_my_grades` |
| **Calendar** | `get_upcoming_due_dates` |
| **Announcements** | `get_announcements` |
| **Content** | `get_course_content`, `get_course_modules`, `get_course_module`, `get_course_topic` |
| **Files** | `download_file`, `read_file`, `delete_file` |
| **Study tasks** | `tasks_list`, `tasks_add`, `tasks_complete`, `plan_week` |
| **D2L sync** | `sync_all` (D2L assignments → local task list) |
| **Notes** | `notes_sync`, `notes_search`, `notes_suggest_for_item` |
| **Co-op jobs** | `get_job_postings`, `get_job_details`, `search_jobs` |
| **Applications** | `get_my_applications`, `get_interview_schedule`, `get_ranking_status`, `get_saved_jobs` |

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [Claude Desktop](https://claude.ai/download) (for stdio transport) or any MCP-compatible client
- A UWaterloo account with access to LEARN and WaterlooWorks

## Installation

```bash
git clone https://github.com/beanscrack/learn-mcp
cd uwlearn-mcp
npm install
npm run build
```

> `npm install` automatically runs `playwright install chromium` to download the browser used for authentication and WaterlooWorks scraping.

## Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

The only required setting is `D2L_BASE_URL`, which defaults to `https://learn.uwaterloo.ca` — no change needed for most users. To speed up login, add your credentials so the form is pre-filled (you still approve Duo manually):

```env
D2L_USERNAME=youremail@uwaterloo.ca
D2L_PASSWORD=yourpassword
```

## First-time authentication

Run the auth CLI **once** to log in and cache your session:

```bash
npm run auth
```

This opens a browser window to the UWaterloo ADFS login page. Enter your credentials (pre-filled if you set them in `.env`) and approve the Duo MFA push. The session is saved to `~/.uwlearn-session/` — subsequent server starts reuse it without opening a browser or prompting for Duo again.

The session lasts approximately 22 hours. When it expires, run `npm run auth` again.

## Claude Desktop setup

Add the server to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "uwlearn": {
      "command": "node",
      "args": ["/absolute/path/to/uwlearn-mcp/dist/index.js"],
      "env": {
        "D2L_USERNAME": "youremail@uwaterloo.ca",
        "D2L_PASSWORD": "yourpassword"
      }
    }
  }
}
```

Replace `/absolute/path/to/uwlearn-mcp` with the actual path where you cloned the repo. Restart Claude Desktop after saving.

## HTTP transport (optional)

For remote or API use instead of Claude Desktop:

```bash
MCP_TRANSPORT=http PORT=3000 npm start
```

The server exposes a Streamable HTTP MCP endpoint at `http://localhost:3000/mcp`.

## Usage examples

Once connected, ask Claude:

- *"What courses am I enrolled in?"*
- *"What assignments are due this week for CS 341?"*
- *"Show my grades for ECE 222."*
- *"Sync my D2L assignments to my task list."*
- *"What's my study plan for this week?"*
- *"Index my lecture notes from ~/Documents/CS246 so I can search them."*
- *"Find notes about dynamic programming."*
- *"What co-op jobs are available in Toronto?"*
- *"Show my co-op application statuses."*
- *"Do I have any interviews scheduled?"*

## Study tools

The study tools use a local SQLite database at `~/.uwlearn-mcp/uwlearn.db`. No external services required.

**Typical workflow:**

1. `sync_all` — pulls all D2L assignments into the local task list
2. `plan_week` — shows what's due this week plus any manual tasks
3. `tasks_add` — add your own tasks (readings, office hours, etc.)
4. `tasks_complete` — mark tasks done as you finish them
5. `notes_sync ~/Documents/CS246` — index a folder of PDFs and .docx files
6. `notes_search "binary search tree"` — find relevant lecture notes

## WaterlooWorks tools

WaterlooWorks scraping reuses the ADFS session from the initial auth — no separate login or second Duo MFA prompt. A browser window opens when a WaterlooWorks tool is first called.

> **Note:** WaterlooWorks CSS selectors are configured in `src/waterloo-works/client.ts`. If a tool returns empty results after the page loads, check the console for `[WW] selector failed: SEL.<name>` messages and update the corresponding selector in that file.

## Troubleshooting

**"auth_error: Run 'npm run auth' to refresh your UWaterloo session"**
Your session has expired. Run `npm run auth` in a terminal with display access (headed browser is required for Duo MFA).

**"network_error: fetch failed"**
You're offline or UWaterloo services are unreachable. Check your internet connection.

**WaterlooWorks tool returns empty results**
The page loaded but no table rows matched the CSS selectors. Check the server logs for `[WW] selector failed:` messages. Open `src/waterloo-works/client.ts` and update the `SEL` object to match the current HTML.

**`npm run build` fails with module resolution errors**
Ensure all local imports in `src/` files use `.js` extensions (required by NodeNext module resolution). Run `npm rebuild better-sqlite3` if you changed Node versions.

**Duo MFA times out**
You have 2 minutes to approve the Duo push after `npm run auth` opens the browser. If it times out, run `npm run auth` again.

## Project structure

```
src/
  auth.ts                  — Playwright ADFS SSO + token cache
  auth-cli.ts              — standalone login script (npm run auth)
  client.ts                — D2L Brightspace REST API client
  index.ts                 — MCP server, tool registration, dual transport
  tools/
    enrollments.ts         — get_my_courses
    assign.ts              — get_assignments, get_assignment, get_assignment_submissions
    grades.ts              — get_my_grades
    calendar.ts            — get_upcoming_due_dates
    news.ts                — get_announcements
    content.ts             — get_course_content, get_course_modules, …
    files.ts               — download_file, read_file, delete_file
    coop.ts                — WaterlooWorks MCP tool handlers
  study/
    db.ts                  — SQLite init (WAL + FTS5 schema)
    tasks.ts               — tasks_list, tasks_add, tasks_complete, plan_week
    sync.ts                — sync_all (D2L → SQLite)
    notes.ts               — notes_sync, notes_search, notes_suggest_for_item
  waterloo-works/
    client.ts              — Playwright scraping (all WW selectors isolated here)
  utils/
    marshal.ts             — D2L API response → LLM-friendly format
    dateEvent.ts           — due date classification + deduplication
```
