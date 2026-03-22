import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getDb } from "./db.js";
import { readFile } from "../tools/files.js";

const CHUNK_WORDS = 400;

function expandPath(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_WORDS) {
    chunks.push(words.slice(i, i + CHUNK_WORDS).join(" "));
  }
  return chunks.length > 0 ? chunks : [];
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "is", "are", "was", "were", "be", "been", "have",
  "has", "do", "does", "did", "will", "would", "could", "should", "may",
  "might", "can", "this", "that", "these", "those", "it", "its", "from",
  "as", "not", "no", "so", "if", "than", "then", "when", "which", "who",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .slice(0, 8);
}

function buildFtsQuery(terms: string[]): string {
  return terms.map((t) => `${t.replace(/[^a-z0-9]/gi, "")}*`).join(" OR ");
}

export const noteTools = {
  notes_sync: {
    description:
      "Index PDF and .docx files from a folder into the local SQLite notes database for fast keyword search. Re-running the command updates existing entries. Run notes_search afterwards.",
    schema: {
      folder: z
        .string()
        .describe(
          "Path to folder containing PDF and/or .docx files (e.g. ~/Documents/CS246)."
        ),
    },
    handler: async ({ folder }: { folder: string }): Promise<string> => {
      const db = getDb();
      const dir = expandPath(folder);
      if (!fs.existsSync(dir)) throw new Error(`Folder not found: ${dir}`);

      const files = fs
        .readdirSync(dir)
        .filter((f) => /\.(pdf|docx)$/i.test(f));

      let indexed = 0;
      let skipped = 0;
      const errors: string[] = [];

      const deleteChunks = db.prepare(
        "DELETE FROM note_sections WHERE source_file = ?"
      );
      const insertChunk = db.prepare(
        "INSERT INTO note_sections (source_file, chunk_index, content) VALUES (?, ?, ?)"
      );

      const syncFile = db.transaction(
        (fileName: string, chunks: string[]) => {
          deleteChunks.run(fileName);
          for (let i = 0; i < chunks.length; i++) {
            insertChunk.run(fileName, i, chunks[i]);
          }
        }
      );

      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const result = await readFile(filePath);
          if (!result.content) {
            skipped++;
            continue;
          }
          const chunks = chunkText(result.content);
          if (chunks.length === 0) {
            skipped++;
            continue;
          }
          syncFile(file, chunks);
          indexed++;
        } catch (err) {
          errors.push(
            `${file}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      return JSON.stringify({
        indexed,
        skipped,
        total: files.length,
        ...(errors.length > 0 && { errors }),
      });
    },
  },

  notes_search: {
    description:
      "Search indexed notes by keyword using full-text search. Returns matching text excerpts with source file. Run notes_sync first to index your PDF/.docx files.",
    schema: {
      query: z
        .string()
        .describe(
          'Search terms (e.g. "binary search tree", "dynamic programming recurrence").'
        ),
      limit: z
        .number()
        .optional()
        .describe("Max results to return (default: 5)."),
    },
    handler: async ({
      query,
      limit = 5,
    }: {
      query: string;
      limit?: number;
    }): Promise<string> => {
      const db = getDb();
      const keywords = extractKeywords(query);
      if (keywords.length === 0)
        return JSON.stringify(
          { results: [], hint: "No searchable keywords found in query." },
          null,
          2
        );

      const ftsQuery = buildFtsQuery(keywords);
      const rows = db
        .prepare(
          "SELECT source_file, chunk_index, content FROM note_sections WHERE content MATCH ? ORDER BY rank LIMIT ?"
        )
        .all(ftsQuery, limit) as Array<{
        source_file: string;
        chunk_index: number;
        content: string;
      }>;

      return JSON.stringify(
        rows.map((r) => ({
          file: r.source_file,
          chunk: r.chunk_index,
          excerpt: r.content.slice(0, 500),
        })),
        null,
        2
      );
    },
  },

  notes_suggest_for_item: {
    description:
      "Find note chunks relevant to a task or assignment title. Extracts keywords from the title and searches indexed notes. Run notes_sync first.",
    schema: {
      title: z
        .string()
        .describe("Task title or assignment name to find relevant notes for."),
      limit: z
        .number()
        .optional()
        .describe("Max suggestions to return (default: 3)."),
    },
    handler: async ({
      title,
      limit = 3,
    }: {
      title: string;
      limit?: number;
    }): Promise<string> => {
      const db = getDb();
      const keywords = extractKeywords(title);
      if (keywords.length === 0)
        return JSON.stringify(
          { suggestions: [], hint: "No keywords extracted from title." },
          null,
          2
        );

      const ftsQuery = buildFtsQuery(keywords);
      const rows = db
        .prepare(
          "SELECT source_file, chunk_index, content FROM note_sections WHERE content MATCH ? ORDER BY rank LIMIT ?"
        )
        .all(ftsQuery, limit) as Array<{
        source_file: string;
        chunk_index: number;
        content: string;
      }>;

      return JSON.stringify(
        rows.map((r) => ({
          file: r.source_file,
          chunk: r.chunk_index,
          excerpt: r.content.slice(0, 400),
        })),
        null,
        2
      );
    },
  },
};
