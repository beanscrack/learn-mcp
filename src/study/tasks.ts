import { z } from "zod";
import { getDb } from "./db.js";

interface Task {
  id: number;
  title: string;
  source: string;
  course: string | null;
  due_date: string | null;
  completed: number;
  created_at: string;
}

function relativeDate(iso: string): string {
  const diffDays = Math.round(
    (new Date(iso).getTime() - Date.now()) / 86400000
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 0 && diffDays <= 7) return `in ${diffDays} days`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  return iso;
}

function formatTask(t: Task) {
  return {
    id: t.id,
    title: t.title,
    source: t.source,
    ...(t.course && { course: t.course }),
    ...(t.due_date && {
      dueDate: t.due_date,
      dueDateRelative: relativeDate(t.due_date),
    }),
    completed: t.completed === 1,
  };
}

export const taskTools = {
  tasks_list: {
    description:
      'List local study tasks. Optionally filter by completion status. Returns id, title, source (manual/d2l), course, dueDate, and completed. Use to answer: "What do I need to do?", "Show my tasks".',
    schema: {
      completed: z
        .boolean()
        .optional()
        .describe(
          "Filter: true for completed tasks, false for incomplete, omit for all."
        ),
    },
    handler: async ({
      completed,
    }: {
      completed?: boolean;
    }): Promise<string> => {
      const db = getDb();
      let query = "SELECT * FROM tasks";
      if (completed !== undefined) {
        query += ` WHERE completed = ${completed ? 1 : 0}`;
      }
      query +=
        " ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, id ASC";
      const tasks = db.prepare(query).all() as Task[];
      return JSON.stringify(tasks.map(formatTask), null, 2);
    },
  },

  tasks_add: {
    description:
      "Add a new manual task to the local study list. Returns the created task.",
    schema: {
      title: z.string().describe("Task title / description."),
      dueDate: z
        .string()
        .optional()
        .describe(
          "Optional due date in ISO 8601 format (e.g. 2025-03-28T23:59:00)."
        ),
      course: z.string().optional().describe("Optional course name or code."),
    },
    handler: async ({
      title,
      dueDate,
      course,
    }: {
      title: string;
      dueDate?: string;
      course?: string;
    }): Promise<string> => {
      const db = getDb();
      const result = db
        .prepare(
          "INSERT INTO tasks (title, source, course, due_date) VALUES (?, ?, ?, ?)"
        )
        .run(title, "manual", course ?? null, dueDate ?? null);
      return JSON.stringify({
        id: result.lastInsertRowid,
        title,
        created: true,
      });
    },
  },

  tasks_complete: {
    description:
      "Mark a task as complete. Pass the task id from tasks_list.",
    schema: {
      id: z.number().describe("Task id from tasks_list."),
    },
    handler: async ({ id }: { id: number }): Promise<string> => {
      const db = getDb();
      const result = db
        .prepare("UPDATE tasks SET completed = 1 WHERE id = ?")
        .run(id);
      if (result.changes === 0) throw new Error(`Task ${id} not found`);
      return JSON.stringify({ id, completed: true });
    },
  },

  plan_week: {
    description:
      'Get a weekly study plan: overdue items, tasks due in the next 7 days, and tasks with no due date. Use to answer: "What\'s my plan this week?", "What should I focus on?".',
    schema: {},
    handler: async (): Promise<string> => {
      const db = getDb();
      const now = new Date().toISOString();
      const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString();

      const overdue = (
        db
          .prepare(
            "SELECT * FROM tasks WHERE completed = 0 AND due_date IS NOT NULL AND due_date < ? ORDER BY due_date ASC"
          )
          .all(now) as Task[]
      ).map(formatTask);

      const thisWeek = (
        db
          .prepare(
            "SELECT * FROM tasks WHERE completed = 0 AND due_date IS NOT NULL AND due_date >= ? AND due_date <= ? ORDER BY due_date ASC"
          )
          .all(now, weekEnd) as Task[]
      ).map(formatTask);

      const noDueDate = (
        db
          .prepare(
            "SELECT * FROM tasks WHERE completed = 0 AND due_date IS NULL ORDER BY id ASC"
          )
          .all() as Task[]
      ).map(formatTask);

      return JSON.stringify(
        {
          overdue,
          thisWeek,
          noDueDate,
          summary: `${overdue.length} overdue, ${thisWeek.length} due this week, ${noDueDate.length} with no due date`,
        },
        null,
        2
      );
    },
  },
};
