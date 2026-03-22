import { z } from "zod";
import { client } from "../client.js";
import {
  marshalCalendarEvents,
  type RawCalendarEvent,
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

export const calendarTools = {
  get_upcoming_due_dates: {
    description:
      "Get calendar events and due dates for a course. Default window: 7 days back to 30 days ahead. Returns event title, due date (absolute + relative), course name, and event type. Use to answer: \"What's due this week?\", \"What are my upcoming deadlines?\"",
    schema: {
      orgUnitId: z
        .number()
        .optional()
        .describe("Course org unit ID from get_my_courses. Optional if D2L_COURSE_ID is set."),
      daysBack: z
        .number()
        .optional()
        .describe("Days in the past to include (default: 7)"),
      daysAhead: z
        .number()
        .optional()
        .describe("Days in the future to include (default: 30)"),
    },
    handler: async ({
      orgUnitId,
      daysBack = 7,
      daysAhead = 30,
    }: {
      orgUnitId?: number;
      daysBack?: number;
      daysAhead?: number;
    }): Promise<string> => {
      const now = Date.now();
      const start = new Date(now - daysBack * 86400000).toISOString();
      const end = new Date(now + daysAhead * 86400000).toISOString();

      const events = (await client.getMyCalendarEvents(
        requireOrgUnitId(orgUnitId),
        start,
        end
      )) as { Objects: RawCalendarEvent[] };

      return JSON.stringify(marshalCalendarEvents(events), null, 2);
    },
  },
};
