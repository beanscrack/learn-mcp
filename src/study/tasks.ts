import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "./db.js";
import { toolHandler } from "../utils/mcp.js";

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

// Exported handlers for testing
export const taskHandlers = {
  async tasks_list({ completed }: { completed?: boolean }) {
    const db = getDb();
    let query = "SELECT * FROM tasks";
    if (completed !== undefined) {
      query += ` WHERE completed = ${completed ? 1 : 0}`;
    }
    query += " ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, id ASC";
    const tasks = db.prepare(query).all() as Task[];
    return JSON.stringify(tasks.map(formatTask), null, 2);
  },

  async tasks_add({ title, dueDate, course }: { title: string; dueDate?: string; course?: string }) {
    const db = getDb();
    const result = db
      .prepare("INSERT INTO tasks (title, source, course, due_date) VALUES (?, ?, ?, ?)")
      .run(title, "manual", course ?? null, dueDate ?? null);
    return JSON.stringify({ id: result.lastInsertRowid, title, created: true }, null, 2);
  },

  async tasks_complete({ id }: { id: number }) {
    const db = getDb();
    const result = db.prepare("UPDATE tasks SET completed = 1 WHERE id = ?").run(id);
    if (result.changes === 0) throw new Error(`Task ${id} not found`);
    return JSON.stringify({ id, completed: true }, null, 2);
  },

  async plan_week() {
    const db = getDb();
    const now = new Date().toISOString();
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString();

    const overdue = (db.prepare(
      "SELECT * FROM tasks WHERE completed = 0 AND due_date IS NOT NULL AND due_date < ? ORDER BY due_date ASC"
    ).all(now) as Task[]).map(formatTask);

    const thisWeek = (db.prepare(
      "SELECT * FROM tasks WHERE completed = 0 AND due_date IS NOT NULL AND due_date >= ? AND due_date <= ? ORDER BY due_date ASC"
    ).all(now, weekEnd) as Task[]).map(formatTask);

    const noDueDate = (db.prepare(
      "SELECT * FROM tasks WHERE completed = 0 AND due_date IS NULL ORDER BY id ASC"
    ).all() as Task[]).map(formatTask);

    return JSON.stringify({
      overdue,
      thisWeek,
      noDueDate,
      summary: `${overdue.length} overdue, ${thisWeek.length} due this week, ${noDueDate.length} with no due date`,
    }, null, 2);
  }
};

export function registerTasksTools(server: McpServer) {
  server.tool(
    "tasks_list",
    'List local study tasks. Optionally filter by completion status.',
    {
      completed: z.boolean().optional().describe("Filter: true for completed, false for incomplete."),
    },
    toolHandler("tasks_list", taskHandlers.tasks_list)
  );

  server.tool(
    "tasks_add",
    "Add a new manual task to the local study list.",
    {
      title: z.string().describe("Task title."),
      dueDate: z.string().optional().describe("ISO 8601 due date."),
      course: z.string().optional().describe("Course name or code."),
    },
    toolHandler("tasks_add", taskHandlers.tasks_add)
  );

  server.tool(
    "tasks_complete",
    "Mark a task as complete.",
    {
      id: z.number().describe("Task id."),
    },
    toolHandler("tasks_complete", taskHandlers.tasks_complete)
  );

  server.tool(
    "plan_week",
    'Get a weekly study plan.',
    {},
    toolHandler("plan_week", taskHandlers.plan_week)
  );
}
