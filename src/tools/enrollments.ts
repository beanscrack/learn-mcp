import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { client } from "../client.js";
import { marshalEnrollments, type RawEnrollment } from "../utils/marshal.js";
import { toolHandler } from "../utils/mcp.js";

export function registerEnrollmentTools(server: McpServer) {
  server.tool(
    "get_my_courses",
    "List all courses you're enrolled in. Returns course name, course code, org unit ID, access status, and last accessed date.",
    {},
    toolHandler("get_my_courses", async () => {
      const res = (await client.getMyEnrollments()) as {
        Items: RawEnrollment[];
      };
      return JSON.stringify(marshalEnrollments(res), null, 2);
    })
  );
}
