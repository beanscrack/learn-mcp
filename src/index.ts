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

import { registerEnrollmentTools } from "./tools/enrollments.js";
import { registerAssignmentTools } from "./tools/assign.js";
import { registerGradeTools } from "./tools/grades.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { registerNewsTools } from "./tools/news.js";
import { registerContentTools } from "./tools/content.js";
import { registerFileTools } from "./tools/files.js";
import { registerTasksTools } from "./study/tasks.js";
import { registerSyncTools } from "./study/sync.js";
import { registerNotesTools } from "./study/notes.js";
import { registerCoopTools } from "./tools/coop.js";
import { registerCampusTools } from "./tools/campus.js";
import { registerCourseTools } from "./tools/courses.js";
import { closeContext as closeWwContext } from "./waterloo-works/client.js";

function createServer(): McpServer {
  const server = new McpServer({ name: "learn-mcp", version: "0.1.0" });

  // Register all tool modules
  registerEnrollmentTools(server);
  registerAssignmentTools(server);
  registerGradeTools(server);
  registerCalendarTools(server);
  registerNewsTools(server);
  registerContentTools(server);
  registerFileTools(server);
  registerTasksTools(server);
  registerSyncTools(server);
  registerNotesTools(server);
  registerCoopTools(server);
  registerCampusTools(server);
  registerCourseTools(server);

  return server;
}

// ─── Stdio transport ──────────────────────────────────────────────────────────

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[learn-mcp] Running on stdio");

  async function shutdown() {
    try { await closeWwContext(); } catch { }
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

  app.use("/mcp", (req: express.Request, _res: express.Response, next: express.NextFunction) => {
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
    } catch { }
  }

  await loadSessions();

  app.post("/mcp", async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (sessionId && validSessionIds.has(sessionId)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
          onsessioninitialized: (sid: string) => { transports[sid] = transport; },
          onsessionclosed: (sid: string) => {
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
          onsessioninitialized: (sid: string) => {
            console.error(`[MCP] Session initialized: ${sid}`);
            transports[sid] = transport;
            validSessionIds.add(sid);
            void saveSessions();
          },
          onsessionclosed: (sid: string) => {
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

  app.get("/mcp", async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete("/mcp", async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (err) {
      console.error("[MCP] DELETE error:", err);
      if (!res.headersSent) res.status(500).send("Error terminating session");
    }
  });

  app.listen(port, () => {
    console.error(`[learn-mcp] HTTP — http://localhost:${port}/mcp`);
  });

  async function shutdown() {
    for (const sid of Object.keys(transports)) {
      try { await transports[sid].close(); } catch { }
      delete transports[sid];
    }
    try { await closeWwContext(); } catch { }
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
    console.error(`[learn-mcp] Unknown MCP_TRANSPORT "${transport}". Use "stdio" or "http".`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[learn-mcp] Fatal error:", err);
  process.exit(1);
});
