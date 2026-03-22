import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRequire } from "module";
import { execSync } from "child_process";
import { getAuthenticatedContext } from "../auth.js";
import { captureEnforcedContentDownload } from "./content.js";
import mammoth from "mammoth";
import type { Download } from "playwright";

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
        try { fs.unlinkSync(tmp); } catch {}
        if (out.trim()) return out.trim();
      } catch {}
    }

    // mammoth extractRawText
    try {
      const res = await mammoth.extractRawText({ buffer: data });
      if (res.value.trim()) return res.value;
    } catch {}

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
    } catch {}

    return null;
  }

  // .doc (old format — not supported by mammoth)
  if (lowerExt === ".doc") return null;

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

    // Fuzzy search in Downloads
    const dlDir = path.join(os.homedir(), "Downloads");
    if (fs.existsSync(dlDir)) {
      const match = fs.readdirSync(dlDir).find(
        (f) => f.toLowerCase().includes(filePath.toLowerCase()) || f === filePath
      );
      if (match) return path.join(dlDir, match);
    }
  }

  throw new Error(
    `File not found: ${filePath}. Searched current directory and ~/Downloads`
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function downloadFile(
  url: string,
  savePath?: string
): Promise<{
  path: string;
  filename: string;
  size: number;
  contentType: string;
  content: string | null;
}> {
  const fullUrl = url.startsWith("http") ? url : `${D2L_BASE_URL}${url}`;
  const urlFilename = decodeURIComponent(
    new URL(fullUrl).pathname.split("/").pop() || "download"
  );

  const browser = await getAuthenticatedContext();

  try {
    const page = await browser.newPage();
    const downloadsDir =
      savePath && fs.existsSync(savePath) && fs.statSync(savePath).isDirectory()
        ? savePath
        : path.join(os.homedir(), "Downloads");

    const saveDownload = async (download: Download) => {
      const suggested = download.suggestedFilename() || urlFilename;
      let dest =
        savePath && !fs.existsSync(savePath)
          ? savePath
          : path.join(downloadsDir, suggested);

      // Avoid overwriting — append counter
      let n = 1;
      const ext = path.extname(dest);
      const base = path.basename(dest, ext);
      const dir = path.dirname(dest);
      while (fs.existsSync(dest)) {
        dest = path.join(dir, `${base} (${n++})${ext}`);
      }

      await download.saveAs(dest);
      const data = fs.readFileSync(dest);
      const contentType =
        EXT_TO_MIME[path.extname(dest).toLowerCase()] || "application/octet-stream";
      return {
        path: dest,
        filename: path.basename(dest),
        size: data.length,
        contentType,
        content: await extractContent(data, path.extname(dest)),
      };
    };

    // Strategy 1: enforced-content download (fires during navigation)
    try {
      const dl = await captureEnforcedContentDownload(page, fullUrl);
      return await saveDownload(dl);
    } catch {
      console.error("[DOWNLOAD] Enforced-content strategy failed — trying fallbacks");
    }

    // Strategy 2: click a download button/link on the loaded page
    if (page.url() === "about:blank") {
      await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }
    const dlPromise = page.waitForEvent("download", { timeout: 10_000 }).catch(() => null) as Promise<Download | null>;
    const selectors = [
      "a[download]", 'a:has-text("Download")', 'button:has-text("Download")',
      'a[href*="download"]', 'a[href*="ViewFile"]', 'a[href*="FileDownload"]',
    ];
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          const dl = await dlPromise;
          if (dl) return await saveDownload(dl);
          break;
        }
      } catch {}
    }

    // Strategy 3: direct HTTP fetch
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
      return {
        path: dest,
        filename: path.basename(dest),
        size: data.length,
        contentType: ct.includes("octet-stream")
          ? EXT_TO_MIME[path.extname(dest).toLowerCase()] || ct
          : ct,
        content: await extractContent(Buffer.from(data), path.extname(dest)),
      };
    }

    throw new Error(
      "Could not trigger file download. The file may require enforced-content access."
    );
  } finally {
    await browser.close();
  }
}

export async function readFile(filePath: string): Promise<{
  path: string;
  filename: string;
  size: number;
  contentType: string;
  content: string | null;
}> {
  const resolved = resolveFilePath(filePath);
  const data = fs.readFileSync(resolved);
  const ext = path.extname(resolved);
  return {
    path: resolved,
    filename: path.basename(resolved),
    size: data.length,
    contentType: EXT_TO_MIME[ext.toLowerCase()] || "application/octet-stream",
    content: await extractContent(data, ext),
  };
}

export function deleteFile(filePath: string): {
  path: string;
  filename: string;
} {
  const resolved = resolveFilePath(filePath);
  fs.unlinkSync(resolved);
  return { path: resolved, filename: path.basename(resolved) };
}
