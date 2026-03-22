import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRequire } from "module";
import { execSync } from "child_process";
import { getAuthenticatedContext } from "../auth.js";
import { captureEnforcedContentDownload } from "./content.js";
import mammoth from "mammoth";
import type { Download } from "playwright";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toolHandler } from "../utils/mcp.js";

const D2L_BASE_URL =
  process.env.D2L_BASE_URL?.replace(/\/$/, "") || "https://learn.uwaterloo.ca";

const EXT_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint",
  ".zip": "application/zip",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".json": "application/json",
  ".csv": "text/csv",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
};

async function extractContent(
  data: Buffer,
  ext: string
): Promise<string | null> {
  const lowerExt = ext.toLowerCase();

  // Plain text files
  if (
    [".txt", ".md", ".csv", ".json", ".xml", ".html", ".htm", ".css", ".js", ".ts", ".py", ".java", ".c", ".cpp", ".h"].includes(
      lowerExt
    )
  ) {
    return data.toString("utf-8");
  }

  // .docx — mammoth with macOS textutil fallback
  if (lowerExt === ".docx") {
    // macOS: try textutil first (most reliable)
    if (os.platform() === "darwin") {
      try {
        const tmp = path.join(os.tmpdir(), `docx-${Date.now()}.docx`);
        fs.writeFileSync(tmp, data);
        const out = execSync(`textutil -convert txt -stdout "${tmp}"`, {
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });
        try { fs.unlinkSync(tmp); } catch { }
        if (out.trim()) return out.trim();
      } catch { }
    }

    // mammoth extractRawText
    try {
      const res = await mammoth.extractRawText({ buffer: data });
      if (res.value.trim()) return res.value;
    } catch { }

    // mammoth convertToHtml + strip
    try {
      const html = await mammoth.convertToHtml({ buffer: data });
      if (html.value) {
        const text = html.value
          .replace(/<style[^>]*>.*?<\/style>/gi, " ")
          .replace(/<script[^>]*>.*?<\/script>/gi, " ")
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
          .replace(/\s+/g, " ")
          .trim();
        if (text) return text;
      }
    } catch { }

    return null;
  }

  // PDF — pdf-parse (pinned at 1.1.1)
  if (lowerExt === ".pdf") {
    try {
      const require = createRequire(import.meta.url);
      const pdfParse = require("pdf-parse");
      const parsed = await pdfParse(data);
      return parsed?.text || null;
    } catch (err) {
      console.error("[PDF] Parse error:", err);
      return null;
    }
  }

  return null;
}

function resolveFilePath(filePath: string): string {
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) throw new Error(`Path is a directory: ${filePath}`);
    return filePath;
  }

  if (!path.isAbsolute(filePath)) {
    const inDownloads = path.join(os.homedir(), "Downloads", filePath);
    if (fs.existsSync(inDownloads)) return inDownloads;

    const dlDir = path.join(os.homedir(), "Downloads");
    if (fs.existsSync(dlDir)) {
      const match = fs.readdirSync(dlDir).find(
        (f) => f.toLowerCase().includes(filePath.toLowerCase()) || f === filePath
      );
      if (match) return path.join(dlDir, match);
    }
  }

  throw new Error(`File not found: ${filePath}. Searched current directory and ~/Downloads`);
}

export async function downloadFile(url: string, savePath?: string) {
  const fullUrl = url.startsWith("http") ? url : `${D2L_BASE_URL}${url}`;
  const urlFilename = decodeURIComponent(new URL(fullUrl).pathname.split("/").pop() || "download");

  const browser = await getAuthenticatedContext();

  try {
    const page = await browser.newPage();
    const downloadsDir = savePath && fs.existsSync(savePath) && fs.statSync(savePath).isDirectory()
      ? savePath
      : path.join(os.homedir(), "Downloads");

    const saveDownload = async (download: Download) => {
      const suggested = download.suggestedFilename() || urlFilename;
      let dest = savePath && !fs.existsSync(savePath) ? savePath : path.join(downloadsDir, suggested);
      let n = 1;
      const ext = path.extname(dest);
      const base = path.basename(dest, ext);
      const dir = path.dirname(dest);
      while (fs.existsSync(dest)) dest = path.join(dir, `${base} (${n++})${ext}`);

      await download.saveAs(dest);
      const data = fs.readFileSync(dest);
      const contentType = EXT_TO_MIME[path.extname(dest).toLowerCase()] || "application/octet-stream";
      return {
        path: dest,
        filename: path.basename(dest),
        size: data.length,
        contentType,
        content: await extractContent(data, path.extname(dest)),
      };
    };

    try {
      const dl = await captureEnforcedContentDownload(page, fullUrl);
      return await saveDownload(dl);
    } catch { }

    if (page.url() === "about:blank") {
      await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }
    const dlPromise = page.waitForEvent("download", { timeout: 10_000 }).catch(() => null);
    const selectors = ["a[download]", 'a:has-text("Download")', 'button:has-text("Download")'];
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          const dl = await dlPromise;
          if (dl) return await saveDownload(dl);
          break;
        }
      } catch { }
    }

    const resp = await page.request.get(fullUrl);
    const ct = resp.headers()["content-type"] || "";
    if (!ct.includes("text/html") && resp.ok()) {
      const data = await resp.body();
      const cd = resp.headers()["content-disposition"] || "";
      const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      let filename = match ? match[1].replace(/['"]/g, "") : urlFilename;
      let dest = path.join(downloadsDir, filename);
      let n = 1;
      const ext = path.extname(dest);
      const base = path.basename(dest, ext);
      const dir = path.dirname(dest);
      while (fs.existsSync(dest)) dest = path.join(dir, `${base} (${n++})${ext}`);
      fs.writeFileSync(dest, data);

      const buf = Buffer.from(data);
      return {
        path: dest,
        filename: path.basename(dest),
        size: buf.length,
        contentType: ct,
        content: await extractContent(buf, path.extname(dest)),
      };
    }

    throw new Error("Could not trigger file download.");
  } finally {
    await browser.close();
  }
}

export async function readFile(filePath: string) {
  const resolved = resolveFilePath(filePath);
  const data = fs.readFileSync(resolved);
  const ext = path.extname(resolved);
  const contentType = EXT_TO_MIME[ext.toLowerCase()] || "application/octet-stream";
  return {
    path: resolved,
    filename: path.basename(resolved),
    size: data.length,
    contentType,
    content: await extractContent(data, ext),
  };
}

export function registerFileTools(server: McpServer) {
  server.tool(
    "download_file",
    "Download a file from D2L LEARN and save it locally.",
    {
      url: z.string().describe("The D2L file URL or path."),
      savePath: z.string().optional().describe("Optional: custom save path."),
    },
    toolHandler("download_file", async ({ url, savePath }) => {
      const res = await downloadFile(url, savePath);
      const kb = (res.size / 1024).toFixed(1);
      let text = `Downloaded: ${res.filename}\nPath: ${res.path}\nSize: ${kb} KB\nType: ${res.contentType}`;
      if (res.content) text += `\n\n--- Content ---\n${res.content}`;
      return text;
    })
  );

  server.tool(
    "read_file",
    "Read a downloaded file and extract its text content.",
    {
      filePath: z.string().describe("Full path or filename."),
    },
    toolHandler("read_file", async ({ filePath }) => {
      const res = await readFile(filePath);
      const kb = (res.size / 1024).toFixed(1);
      let text = `File: ${res.filename}\nPath: ${res.path}\nSize: ${kb} KB\nType: ${res.contentType}`;
      if (res.content) text += `\n\n--- Content ---\n${res.content}`;
      else text += "\n\nNote: Could not extract text from this file type.";
      return text;
    })
  );

  server.tool(
    "delete_file",
    "Delete a downloaded file from disk.",
    {
      filePath: z.string().describe("Full path or filename to delete."),
    },
    toolHandler("delete_file", async ({ filePath }) => {
      const resolved = resolveFilePath(filePath);
      fs.unlinkSync(resolved);
      return `Deleted: ${path.basename(resolved)}\nPath: ${resolved}`;
    })
  );
}
