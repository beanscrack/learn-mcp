import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { marshalGrades, type RawGrade } from "../utils/marshal.js";
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

export function registerGradeTools(server: McpServer) {
  server.tool(
    "get_my_grades",
    "Get your grades for a course. Returns scores, percentages, and feedback.",
    {
      orgUnitId: z.number().optional().describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
    },
    toolHandler("get_my_grades", async ({ orgUnitId }) => {
      const grades = (await client.getMyGradeValues(
        requireOrgUnitId(orgUnitId)
      )) as RawGrade[];
      return JSON.stringify(marshalGrades(grades), null, 2);
    })
  );
}
