import { client } from "../client.js";
import { marshalEnrollments, type RawEnrollment } from "../utils/marshal.js";

export const enrollmentTools = {
  get_my_courses: {
    description:
      "List all courses you're enrolled in. Returns course name, course code, org unit ID (needed for all other D2L tools), access status, and last accessed date. Use to answer: \"What courses am I in?\", \"Show my classes\", \"What's the course ID for X?\"",
    schema: {},
    handler: async (): Promise<string> => {
      const res = (await client.getMyEnrollments()) as {
        Items: RawEnrollment[];
      };
      return JSON.stringify(marshalEnrollments(res), null, 2);
    },
  },
};
