import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import {
  marshalAssignments,
  marshalAssignment,
  marshalSubmissions,
  type RawAssignment,
  type RawSubmission,
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

export function registerAssignmentTools(server: McpServer) {
  server.tool(
    "get_assignments",
    "List all assignments for a course with due dates and instructions.",
    {
      orgUnitId: z.number().optional().describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
    },
    toolHandler("get_assignments", async ({ orgUnitId }) => {
      const folders = (await client.getDropboxFolders(
        requireOrgUnitId(orgUnitId)
      )) as RawAssignment[];
      return JSON.stringify(marshalAssignments(folders), null, 2);
    })
  );

  server.tool(
    "get_assignment",
    "Get full details about a specific assignment including complete instructions.",
    {
      orgUnitId: z.number().optional().describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
      assignmentId: z.number().describe("The assignment Id from get_assignments."),
    },
    toolHandler("get_assignment", async ({ orgUnitId, assignmentId }) => {
      const folder = (await client.getDropboxFolder(
        requireOrgUnitId(orgUnitId),
        assignmentId
      )) as RawAssignment;
      return JSON.stringify(marshalAssignment(folder), null, 2);
    })
  );

  server.tool(
    "get_assignment_submissions",
    "Get submission status for an assignment. Shows submitted files, timestamps, feedback.",
    {
      orgUnitId: z.number().optional().describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
      assignmentId: z.number().describe("The assignment Id from get_assignments."),
    },
    toolHandler("get_assignment_submissions", async ({ orgUnitId, assignmentId }) => {
      const subs = (await client.getDropboxSubmissions(
        requireOrgUnitId(orgUnitId),
        assignmentId
      )) as RawSubmission[];
      return JSON.stringify(marshalSubmissions(subs), null, 2);
    })
  );
}
