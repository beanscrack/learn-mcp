import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { marshalAnnouncements, type RawAnnouncement } from "../utils/marshal.js";
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

export function registerNewsTools(server: McpServer) {
  server.tool(
    "get_announcements",
    "Get course announcements from instructors. Returns title, body, date, and attachments.",
    {
      orgUnitId: z.number().optional().describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
    },
    toolHandler("get_announcements", async ({ orgUnitId }) => {
      const news = (await client.getNews(
        requireOrgUnitId(orgUnitId)
      )) as RawAnnouncement[];
      return JSON.stringify(marshalAnnouncements(news), null, 2);
    })
  );
}
