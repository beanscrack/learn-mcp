import { z } from "zod";
import { client } from "../client.js";
import {
  marshalAssignments,
  marshalAssignment,
  marshalSubmissions,
  type RawAssignment,
  type RawSubmission,
} from "../utils/marshal.js";

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

export const assignmentTools = {
  get_assignments: {
    description:
      "List all assignments for a course with due dates and instructions. Returns name, dueDate (ISO 8601), instructions, point value, and Id (needed for get_assignment_submissions). Use to answer: \"What assignments do I have?\", \"What's due this week?\"",
    schema: {
      orgUnitId: z
        .number()
        .optional()
        .describe("Course org unit ID from get_my_courses. Optional if D2L_COURSE_ID is set."),
    },
    handler: async ({ orgUnitId }: { orgUnitId?: number }): Promise<string> => {
      const folders = (await client.getDropboxFolders(
        requireOrgUnitId(orgUnitId)
      )) as RawAssignment[];
      return JSON.stringify(marshalAssignments(folders), null, 2);
    },
  },

  get_assignment: {
    description:
      "Get full details about a specific assignment including complete instructions, due date, point value, allowed file types. Use after get_assignments when you need more detail on one assignment.",
    schema: {
      orgUnitId: z
        .number()
        .optional()
        .describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
      assignmentId: z
        .number()
        .describe("The assignment Id from get_assignments."),
    },
    handler: async ({
      orgUnitId,
      assignmentId,
    }: {
      orgUnitId?: number;
      assignmentId: number;
    }): Promise<string> => {
      const folder = (await client.getDropboxFolder(
        requireOrgUnitId(orgUnitId),
        assignmentId
      )) as RawAssignment;
      return JSON.stringify(marshalAssignment(folder), null, 2);
    },
  },

  get_assignment_submissions: {
    description:
      "Get submission status for an assignment. Shows submitted files, timestamps, feedback, and grade received. Use to answer: \"Did I submit this?\", \"What grade did I get?\", \"What feedback did I receive?\"",
    schema: {
      orgUnitId: z
        .number()
        .optional()
        .describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
      assignmentId: z
        .number()
        .describe("The assignment Id from get_assignments."),
    },
    handler: async ({
      orgUnitId,
      assignmentId,
    }: {
      orgUnitId?: number;
      assignmentId: number;
    }): Promise<string> => {
      const subs = (await client.getDropboxSubmissions(
        requireOrgUnitId(orgUnitId),
        assignmentId
      )) as RawSubmission[];
      return JSON.stringify(marshalSubmissions(subs), null, 2);
    },
  },
};
