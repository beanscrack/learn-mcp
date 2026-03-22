#!/usr/bin/env node
import "dotenv/config";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { enrollmentTools } from "./tools/enrollments.js";
import { assignmentTools } from "./tools/assign.js";
import { gradeTools } from "./tools/grades.js";
import { calendarTools } from "./tools/calendar.js";
import { newsTools } from "./tools/news.js";
import { contentTools } from "./tools/content.js";
import { downloadFile, readFile, deleteFile } from "./tools/files.js";
import { taskTools } from "./study/tasks.js";
import { syncTools } from "./study/sync.js";
import { noteTools } from "./study/notes.js";
import { coopTools } from "./tools/coop.js";
import { closeContext as closeWwContext } from "./waterloo-works/client.js";

// ─── Tool error formatting (MCP-03) ──────────────────────────────────────────

function formatToolError(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & {
      status?: number;
      isAuthError?: boolean;
      code?: string;
    };

    // Auth errors — 401/403 from D2L or auth timeout
    if (e.isAuthError || e.status === 401 || e.status === 403) {
      return JSON.stringify({
        error: "auth_error",
        message: e.message,
        hint: "Run 'npm run auth' to refresh your UWaterloo session",
      });
    }

    // Network errors — connection refused, DNS failure, timeout
    const isNetworkError =
      e.code === "ECONNREFUSED" ||
      e.code === "ETIMEDOUT" ||
      e.code === "ENOTFOUND" ||
      e.code === "ECONNRESET" ||
      e.message.toLowerCase().includes("fetch failed") ||
      e.message.toLowerCase().includes("network") ||
      e.message.toLowerCase().includes("timed out");

    if (isNetworkError) {
      return JSON.stringify({
        error: "network_error",
        message: e.message,
        hint: "Check your internet connection and that UWaterloo services are reachable",
      });
    }

    // D2L API errors with a known HTTP status code
    if (e.status) {
      return JSON.stringify({
        error: "api_error",
        message: e.message,
        hint: `D2L returned HTTP ${e.status}`,
      });
    }

    return JSON.stringify({ error: "api_error", message: e.message });
  }
  return JSON.stringify({ error: "unknown_error", message: String(err) });
}

// ─── Server factory ───────────────────────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({ name: "uwlearn-mcp", version: "0.1.0" });

  // Wraps a handler: logs timing, formats errors as structured JSON
  function wrap<A extends Record<string, unknown>>(
    name: string,
    handler: (args: A) => Promise<string>
  ) {
    return async (args: A) => {
      const t = Date.now();
      console.error(`[TOOL] ${name} start`);
      try {
        const text = await handler(args);
        console.error(`[TOOL] ${name} ok (${Date.now() - t}ms)`);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        console.error(`[TOOL] ${name} error (${Date.now() - t}ms)`, err);
        return {
          content: [{ type: "text" as const, text: formatToolError(err) }],
          isError: true,
        };
      }
    };
  }

  // ── Enrollments ────────────────────────────────────────────────────────────
  server.tool(
    "get_my_courses",
    enrollmentTools.get_my_courses.description,
    {},
    wrap("get_my_courses", enrollmentTools.get_my_courses.handler)
  );

  // ── Assignments ────────────────────────────────────────────────────────────
  server.tool(
    "get_assignments",
    assignmentTools.get_assignments.description,
    assignmentTools.get_assignments.schema,
    wrap("get_assignments", assignmentTools.get_assignments.handler)
  );
  server.tool(
    "get_assignment",
    assignmentTools.get_assignment.description,
    assignmentTools.get_assignment.schema,
    wrap("get_assignment", assignmentTools.get_assignment.handler)
  );
  server.tool(
    "get_assignment_submissions",
    assignmentTools.get_assignment_submissions.description,
    assignmentTools.get_assignment_submissions.schema,
    wrap(
      "get_assignment_submissions",
      assignmentTools.get_assignment_submissions.handler
    )
  );

  // ── Grades ─────────────────────────────────────────────────────────────────
  server.tool(
    "get_my_grades",
    gradeTools.get_my_grades.description,
    gradeTools.get_my_grades.schema,
    wrap("get_my_grades", gradeTools.get_my_grades.handler)
  );

  // ── Calendar ───────────────────────────────────────────────────────────────
  server.tool(
    "get_upcoming_due_dates",
    calendarTools.get_upcoming_due_dates.description,
    calendarTools.get_upcoming_due_dates.schema,
    wrap(
      "get_upcoming_due_dates",
      calendarTools.get_upcoming_due_dates.handler
    )
  );

  // ── Announcements ──────────────────────────────────────────────────────────
  server.tool(
    "get_announcements",
    newsTools.get_announcements.description,
    newsTools.get_announcements.schema,
    wrap("get_announcements", newsTools.get_announcements.handler)
  );

  // ── Content ────────────────────────────────────────────────────────────────
  server.tool(
    "get_course_content",
    contentTools.get_course_content.description,
    contentTools.get_course_content.schema,
    wrap("get_course_content", contentTools.get_course_content.handler)
  );
  server.tool(
    "get_course_modules",
    contentTools.get_course_modules.description,
    contentTools.get_course_modules.schema,
    wrap("get_course_modules", contentTools.get_course_modules.handler)
  );
  server.tool(
    "get_course_module",
    contentTools.get_course_module.description,
    contentTools.get_course_module.schema,
    wrap("get_course_module", contentTools.get_course_module.handler)
  );
  server.tool(
    "get_course_topic",
    contentTools.get_course_topic.description,
    contentTools.get_course_topic.schema,
    wrap("get_course_topic", contentTools.get_course_topic.handler)
  );

  // ── Files ──────────────────────────────────────────────────────────────────
  server.tool(
    "download_file",
    "Download a file from D2L LEARN. Provide a D2L content URL (full URL or path starting with /). The file is saved to ~/Downloads by default. Returns path, filename, size, content type, and extracted text (for PDF/DOCX/TXT).",
    {
      url: z
        .string()
        .describe("The D2L file URL or path to download."),
      savePath: z
        .string()
        .optional()
        .describe("Optional: custom save path (directory or full path). Defaults to ~/Downloads."),
    },
    wrap("download_file", async ({ url, savePath }) => {
      const result = await downloadFile(url as string, savePath as string | undefined);
      const kb = (result.size / 1024).toFixed(1);
      let text = `Downloaded: ${result.filename}\nPath: ${result.path}\nSize: ${kb} KB\nType: ${result.contentType}`;
      if (result.content) text += `\n\n--- Content ---\n${result.content}`;
      return text;
    })
  );

  server.tool(
    "read_file",
    "Read a downloaded file and extract its text content. Supports PDF, DOCX, TXT, MD, and other text formats. Pass a full path or just a filename (searches ~/Downloads).",
    {
      filePath: z
        .string()
        .describe("Full path or filename (e.g., lecture-slides.pdf)."),
    },
    wrap("read_file", async ({ filePath }) => {
      const result = await readFile(filePath as string);
      const kb = (result.size / 1024).toFixed(1);
      let text = `File: ${result.filename}\nPath: ${result.path}\nSize: ${kb} KB\nType: ${result.contentType}`;
      if (result.content) text += `\n\n--- Content ---\n${result.content}`;
      else text += "\n\nNote: Could not extract text from this file type.";
      return text;
    })
  );

  server.tool(
    "delete_file",
    "Delete a downloaded file from disk. Pass a full path or just a filename (searches ~/Downloads).",
    {
      filePath: z
        .string()
        .describe("Full path or filename to delete."),
    },
    wrap("delete_file", async ({ filePath }) => {
      const result = deleteFile(filePath as string);
      return `Deleted: ${result.filename}\nPath: ${result.path}`;
    })
  );

  // ── Study Tools (Phase 4) ──────────────────────────────────────────────────
  server.tool(
    "tasks_list",
    taskTools.tasks_list.description,
    taskTools.tasks_list.schema,
    wrap("tasks_list", taskTools.tasks_list.handler)
  );
  server.tool(
    "tasks_add",
    taskTools.tasks_add.description,
    taskTools.tasks_add.schema,
    wrap("tasks_add", taskTools.tasks_add.handler)
  );
  server.tool(
    "tasks_complete",
    taskTools.tasks_complete.description,
    taskTools.tasks_complete.schema,
    wrap("tasks_complete", taskTools.tasks_complete.handler)
  );
  server.tool(
    "plan_week",
    taskTools.plan_week.description,
    taskTools.plan_week.schema,
    wrap("plan_week", taskTools.plan_week.handler)
  );
  server.tool(
    "sync_all",
    syncTools.sync_all.description,
    syncTools.sync_all.schema,
    wrap("sync_all", syncTools.sync_all.handler)
  );
  server.tool(
    "notes_sync",
    noteTools.notes_sync.description,
    noteTools.notes_sync.schema,
    wrap("notes_sync", noteTools.notes_sync.handler)
  );
  server.tool(
    "notes_search",
    noteTools.notes_search.description,
    noteTools.notes_search.schema,
    wrap("notes_search", noteTools.notes_search.handler)
  );
  server.tool(
    "notes_suggest_for_item",
    noteTools.notes_suggest_for_item.description,
    noteTools.notes_suggest_for_item.schema,
    wrap("notes_suggest_for_item", noteTools.notes_suggest_for_item.handler)
  );

  // ── WaterlooWorks Tools (Phase 5) ──────────────────────────────────────────
  server.tool(
    "get_job_postings",
    coopTools.get_job_postings.description,
    coopTools.get_job_postings.schema,
    wrap("get_job_postings", coopTools.get_job_postings.handler)
  );
  server.tool(
    "get_job_details",
    coopTools.get_job_details.description,
    coopTools.get_job_details.schema,
    wrap("get_job_details", coopTools.get_job_details.handler)
  );
  server.tool(
    "search_jobs",
    coopTools.search_jobs.description,
    coopTools.search_jobs.schema,
    wrap("search_jobs", coopTools.search_jobs.handler)
  );
  server.tool(
    "get_my_applications",
    coopTools.get_my_applications.description,
    coopTools.get_my_applications.schema,
    wrap("get_my_applications", coopTools.get_my_applications.handler)
  );
  server.tool(
    "get_interview_schedule",
    coopTools.get_interview_schedule.description,
    coopTools.get_interview_schedule.schema,
    wrap("get_interview_schedule", coopTools.get_interview_schedule.handler)
  );
  server.tool(
    "get_ranking_status",
    coopTools.get_ranking_status.description,
    coopTools.get_ranking_status.schema,
    wrap("get_ranking_status", coopTools.get_ranking_status.handler)
  );
  server.tool(
    "get_saved_jobs",
    coopTools.get_saved_jobs.description,
    coopTools.get_saved_jobs.schema,
    wrap("get_saved_jobs", coopTools.get_saved_jobs.handler)
  );

  return server;
}

// ─── Stdio transport ──────────────────────────────────────────────────────────

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[uwlearn-mcp] Running on stdio");

  async function shutdown() {
    try { await closeWwContext(); } catch {}
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ─── HTTP transport ───────────────────────────────────────────────────────────

async function runHttp(port: number): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: "*", exposedHeaders: ["Mcp-Session-Id"] }));

  app.use("/mcp", (req, _res, next) => {
    const accept = req.headers["accept"] || "";
    if (!accept.includes("text/event-stream")) {
      req.headers["accept"] = accept
        ? `${accept}, text/event-stream`
        : "application/json, text/event-stream";
    }
    next();
  });

  const transports: Record<string, StreamableHTTPServerTransport> = {};
  const SESSION_FILE = path.join(process.cwd(), ".mcp-sessions.json");
  const validSessionIds = new Set<string>();

  async function loadSessions() {
    try {
      const data = await fs.readFile(SESSION_FILE, "utf-8");
      (JSON.parse(data) as string[]).forEach((id) => validSessionIds.add(id));
      console.error(`[MCP] Loaded ${validSessionIds.size} session(s)`);
    } catch {
      console.error("[MCP] No session file — starting fresh");
    }
  }

  async function saveSessions() {
    try {
      await fs.writeFile(SESSION_FILE, JSON.stringify([...validSessionIds], null, 2));
    } catch {}
  }

  await loadSessions();

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (sessionId && validSessionIds.has(sessionId)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
          onsessioninitialized: (sid) => { transports[sid] = transport; },
          onsessionclosed: (sid) => {
            delete transports[sid];
            validSessionIds.delete(sid);
            void saveSessions();
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) delete transports[transport.sessionId];
        };
        const srv = createServer();
        await srv.connect(transport);
        (transport as unknown as Record<string, unknown>).sessionId = sessionId;
        (transport as unknown as Record<string, unknown>)._initialized = true;
        transports[sessionId] = transport;
        await transport.handleRequest(req, res, req.body);
        return;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            console.error(`[MCP] Session initialized: ${sid}`);
            transports[sid] = transport;
            validSessionIds.add(sid);
            void saveSessions();
          },
          onsessionclosed: (sid) => {
            delete transports[sid];
            validSessionIds.delete(sid);
            void saveSessions();
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) delete transports[transport.sessionId];
        };
        const srv = createServer();
        await srv.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: no valid session ID" },
          id: null,
        });
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[MCP] POST error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) res.status(500).send("Error terminating session");
    }
  });

  app.listen(port, () => {
    console.error(`[uwlearn-mcp] HTTP — http://localhost:${port}/mcp`);
  });

  async function shutdown() {
    for (const sid of Object.keys(transports)) {
      try { await transports[sid].close(); } catch {}
      delete transports[sid];
    }
    try { await closeWwContext(); } catch {}
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
  if (transport === "stdio") {
    await runStdio();
  } else if (transport === "http" || transport === "https") {
    await runHttp(process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
  } else {
    console.error(`[uwlearn-mcp] Unknown MCP_TRANSPORT "${transport}". Use "stdio" or "http".`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[uwlearn-mcp] Fatal error:", err);
  process.exit(1);
});
