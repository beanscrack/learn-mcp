import { z } from "zod";
import { client } from "../client.js";
import { marshalGrades, type RawGrade } from "../utils/marshal.js";

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

export const gradeTools = {
  get_my_grades: {
    description:
      "Get your grades for a course. Returns all grade items with scores, percentages, and feedback comments. Use to answer: \"What are my grades?\", \"How did I do on the assignment?\", \"What's my current standing?\"",
    schema: {
      orgUnitId: z
        .number()
        .optional()
        .describe("Course org unit ID from get_my_courses. Optional if D2L_COURSE_ID is set."),
    },
    handler: async ({ orgUnitId }: { orgUnitId?: number }): Promise<string> => {
      const grades = (await client.getMyGradeValues(
        requireOrgUnitId(orgUnitId)
      )) as RawGrade[];
      return JSON.stringify(marshalGrades(grades), null, 2);
    },
  },
};
