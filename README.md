# learn-mcp

Model Context Protocol (MCP) server for University of Waterloo LEARN (D2L Brightspace) and WaterlooWorks. This tool enables AI assistants to interact with course materials, assignments, grades, co-op job postings, and campus information through a standardized interface.

## Capabilities

| Category | Description | Tools |
|----------|-------------|-------|
| courses | Enrollment and catalog information | `get_my_courses`, `search_course_catalog` |
| assignments | Detail retrieval and submissions | `get_assignments`, `get_assignment`, `get_assignment_submissions` |
| grades | Academic performance tracking | `get_my_grades` |
| schedules | Deadlines and interviews | `get_upcoming_due_dates`, `get_interview_schedule` |
| communications | Official course news | `get_announcements` |
| content | Module and folder navigation | `get_course_content`, `get_course_modules`, `get_course_module` |
| file_management | Asset operations | `download_file`, `read_file`, `delete_file` |
| productivity | Task management and planning | `tasks_list`, `tasks_add`, `tasks_complete`, `plan_week` |
| synchronization | Automated D2L to local sync | `sync_all` |
| notes | Indexing and semantic search | `notes_sync`, `notes_search`, `notes_suggest_for_item` |
| co-op | WaterlooWorks job management | `get_job_postings`, `get_job_details`, `search_jobs`, `get_my_applications` |
| campus | Logistics and navigation | `get_building_info` |

## Prerequisites

- Node.js 20 or later
- An MCP-compatible client (e.g., Claude Desktop)
- Active UWaterloo credentials with LEARN and WaterlooWorks access

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/beanscrack/learn-mcp
   cd learn-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```
   Note: The installation process includes downloading a headless Chromium instance for authentication and scraping. To skip this, set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

3. Build the project:
   ```bash
   npm run build
   ```

## Configuration

1. Initialize the environment configuration:
   ```bash
   cp .env.example .env
   ```

2. (Optional) Provide credentials in `.env` to automate form entry:
   ```env
   D2L_USERNAME=user@uwaterloo.ca
   D2L_PASSWORD=your_password
   ```

3. Perform initial authentication to cache the session:
   ```bash
   npm run auth
   ```
   This will open a browser for UWaterloo SSO and Duo MFA. Sessions typically remain valid for 22 hours.

## Client Integration

### Claude Desktop

Add the following to your configuration file (the key `"learn-mcp"` can be any stable identifier you prefer, such as `"uwlearn"`):
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "learn-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/learn-mcp/dist/index.js"]
    }
  }
}
```

## Example Use Cases

Once connected, you can interact with the server using natural language:

- "What assignments are due this week for CS 341?"
- "Show my grades for ECE 105."
- "Sync my D2L assignments to my local task list."
- "Index my lecture notes from ~/Documents/Notes for searching."
- "Find my notes related to distributed systems."
- "List available co-op jobs in Toronto for software engineering."
- "Do I have any interviews scheduled on WaterlooWorks?"
- "Where is the MC building located?"

## Workflow Integration

### Academic Task Management
1. Execute `sync_all` to import D2L deadline data into the local SQLite database.
2. Use `plan_week` to generate a prioritized study schedule.
3. Add custom obligations using `tasks_add`.
4. Monitor progress and mark completions via `tasks_list` and `tasks_complete`.

### Note Indexing and Search
1. Use `notes_sync` on a directory containing course materials (PDF, DOCX, TXT).
2. Query specific concepts using `notes_search` to find relevant excerpts across all documents.
3. Use `notes_suggest_for_item` to automatically find related readings for a given assignment title.

## Technical Details

### Storage
- **Sessions**: Cached in `~/.learn-session/`
- **Database**: Local SQLite instance at `~/.learn-mcp/uwlearn.db`

### Network and Transport
- Supports `stdio` (default) and `http` transports.
- To start in HTTP mode:
  ```bash
  MCP_TRANSPORT=http PORT=3000 npm start
  ```

## Development and Testing

Verify the environment with the diagnostic tool:
```bash
npm run doctor
```

Execute the test suite:
```bash
npm test
```

## Disclaimer and Responsibility

### Student Responsibility
This software is provided "as is" for educational and productivity purposes. Users are solely responsible for:
- Maintaining the security of their University of Waterloo credentials.
- Adhering to the University's Policy 71 (Student Discipline) regarding the use of automated tools and AI.
- Ensuring their use of this software does not violate any terms of service for D2L Brightspace or WaterlooWorks.

### Limitation of Liability
The developers of this project are not responsible for any academic consequences, account suspensions, or data loss resulting from the use of this tool. Use of this software is at your own risk.

## License

Distributed under the MIT License. See `LICENSE` for more information.
