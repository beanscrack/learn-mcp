import Database from "better-sqlite3";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

const DB_DIR = path.join(os.homedir(), ".learn-mcp");
export const DB_PATH = path.join(DB_DIR, "uwlearn.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const isTest = process.env.NODE_ENV === "test";

  if (!isTest) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(isTest ? ":memory:" : DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      source     TEXT    NOT NULL DEFAULT 'manual',
      source_id  TEXT    UNIQUE,
      course     TEXT,
      due_date   TEXT,
      completed  INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS note_sections USING fts5(
      source_file UNINDEXED,
      chunk_index UNINDEXED,
      content,
      tokenize = 'unicode61'
    );
  `);

  return _db;
}
