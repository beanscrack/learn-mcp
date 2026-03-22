import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import {
  marshalCalendarEvents,
  type RawCalendarEvent,
} from "../utils/marshal.js";
import { toolHandler } from "../utils/mcp.js";

function requireOrgUnitId(provided?: number): number {
  const id =
    provided ??
    (process.env.D2L_COURSE_ID ? parseInt(process.env.D2L_COURSE_ID) : undefined);
  if (!id)
    throw new Error(
      "orgUnitId is required. Provide it or set D2L_COURSE_ID in .env"
    );
  return id;
}

export function registerCalendarTools(server: McpServer) {
  server.tool(
    "get_upcoming_due_dates",
    "Get calendar events and due dates for a course. Returns event title, due date, course name, and event type.",
    {
      orgUnitId: z.number().optional().describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
      daysBack: z.number().optional().describe("Days in the past to include (default: 7)"),
      daysAhead: z.number().optional().describe("Days in the future to include (default: 30)"),
    },
    toolHandler("get_upcoming_due_dates", async ({ orgUnitId, daysBack = 7, daysAhead = 30 }) => {
      const now = Date.now();
      const start = new Date(now - daysBack * 86400000).toISOString();
      const end = new Date(now + daysAhead * 86400000).toISOString();

      const events = (await client.getMyCalendarEvents(
        requireOrgUnitId(orgUnitId),
        start,
        end
      )) as { Objects: RawCalendarEvent[] };

      return JSON.stringify(marshalCalendarEvents(events), null, 2);
    })
  );
}
