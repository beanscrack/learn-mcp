import { client } from "../client.js";
import { getDb } from "./db.js";
import type { RawEnrollment, RawAssignment } from "../utils/marshal.js";

export const syncTools = {
  sync_all: {
    description:
      "Sync all D2L assignments from all active courses into the local task list. Uses UPSERT so existing tasks are updated without data loss. Run this before plan_week to get fresh D2L data.",
    schema: {},
    handler: async (): Promise<string> => {
      const db = getDb();

      const upsert = db.prepare(`
        INSERT INTO tasks (title, source, source_id, course, due_date, completed)
        VALUES (?, 'd2l', ?, ?, ?, 0)
        ON CONFLICT(source_id) DO UPDATE SET
          title    = excluded.title,
          course   = excluded.course,
          due_date = excluded.due_date
      `);

      const enrollRes = (await client.getMyEnrollments()) as {
        Items: RawEnrollment[];
      };
      const courses = enrollRes.Items.filter(
        (e) =>
          e.OrgUnit.Type.Code === "Course Offering" && e.Access.IsActive
      );

      let synced = 0;
      const errors: string[] = [];

      for (const course of courses) {
        const orgUnitId = course.OrgUnit.Id;
        const courseName = course.OrgUnit.Name;
        try {
          const folders = (await client.getDropboxFolders(
            orgUnitId
          )) as RawAssignment[];
          for (const a of folders) {
            upsert.run(
              a.Name,
              `${orgUnitId}-${a.Id}`,
              courseName,
              a.DueDate ?? null
            );
            synced++;
          }
        } catch (err) {
          errors.push(
            `${courseName}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      return JSON.stringify({
        synced,
        courses: courses.length,
        ...(errors.length > 0 && { errors }),
      });
    },
  },
};
