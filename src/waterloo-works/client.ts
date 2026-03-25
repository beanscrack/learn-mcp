/**
 * WaterlooWorks scraping client.
 *
 * SCRP-01: All CSS selectors are isolated in the SEL and WW_URLS objects.
 * SCRP-02: Every extraction is wrapped in safeText()/safeAttr() with optional required flag.
 * SCRP-03: Dynamic header mapping handles table variations.
 */

import { chromium, type BrowserContext, type Page, type Locator } from "playwright";
import { getAuthenticatedContext } from "../auth.js";

// ─── URL configuration ───────────────────────────────────────────────────────
const WW_BASE = "https://waterlooworks.uwaterloo.ca";
export const WW_URLS = {
  home:         `${WW_BASE}/myAccount`,
  postings:     `${WW_BASE}/myAccount/co-op/full/co-op/posting`,
  applications: `${WW_BASE}/myAccount/co-op/full/co-op/application`,
  interviews:   `${WW_BASE}/myAccount/co-op/full/co-op/interview`,
  rankings:     `${WW_BASE}/myAccount/co-op/full/co-op/ranking`,
  savedJobs:    `${WW_BASE}/myAccount/co-op/full/co-op/posting/saved`,
};

// ─── CSS selector configuration ───────────────────────────────────────────────
export const SEL = {
  // ── Auth & Validation
  loginForm:           ['form[action*="login"]', 'input[name="j_username"]', '#loginForm', 'text=Sign In'],
  tableContainer:      '.table-responsive, #postingsTable, .posting-table',
  detailContainer:     '.job-details, #job-details, .posting-details',

  // ── Common table elements
  tableHeader:         'thead th, th',
  tableRow:            'tbody tr:has(td)',

  // ── Job detail page
  detailTitle:         ['h1.job-title', 'h1:has-text("Job ID")', '.posting-title h1'],
  detailOrg:           ['.organization-name', '.employer-name'],
  detailDescription:   ['.job-description', '#job-description', '[class*="description"]'],

  // ── Shared markers
  noResults:           ['text=No results found', 'text=No postings', '.alert-info:has-text("None")'],
};

/** Header mapping to handle UI variations */
const HEADER_ALIASES: Record<string, string[]> = {
  id:           ["id", "job id", "work term id", "posting #"],
  title:        ["title", "job title", "posting title"],
  organization: ["organization", "employer", "company"],
  division:     ["division", "unit"],
  location:     ["location", "city", "region"],
  deadline:     ["deadline", "app deadline", "application deadline"],
  status:       ["status", "application status", "ranking status"],
  term:         ["term", "work term"],
  openings:     ["openings", "number of openings"],
  type:         ["type", "job type"],
  rank:         ["rank", "your rank", "rank received"],
  date:         ["date", "interview date"],
  time:         ["time", "interview time"],
};

// ─── Custom Errors ────────────────────────────────────────────────────────────

export class ScraperError extends Error {
  constructor(public code: "LOGIN_REQUIRED" | "LAYOUT_CHANGED" | "NOT_FOUND", message: string) {
    super(message);
    this.name = "ScraperError";
  }
}

// ─── Safe extraction helpers ──────────────────────────────────────────────────

/**
 * Attempts to extract text using a list of selectors.
 */
async function safeText(
  root: Page | Locator,
  selectors: string | string[],
  name: string,
  options?: { required?: boolean; quiet?: boolean }
): Promise<string | null> {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const selector of list) {
    try {
      const locator = root.locator(selector).first();
      const text = await locator.textContent({ timeout: 1500 });
      if (text !== null) return text.trim();
    } catch {
      continue;
    }
  }

  if (options?.required && !options?.quiet) {
    console.error(`[WW] REQUIRED field missing: ${name} (tried: ${list.join(", ")})`);
  }
  return null;
}

// ─── Semantic Details Extraction ───

/**
 * Robustly finds a value based on a label in a detail view (e.g. "Location: Canada")
 */
async function findDetailValue(page: Page, label: string): Promise<string | null> {
  // Constrain search to the detail container if possible
  const root = page.locator(SEL.detailContainer).first();
  
  const strategies = [
    // strategy 1: dt/dd or label/span pattern within root
    root.locator(`text=${label} >> xpath=following-sibling::*`).first(),
    // strategy 2: label with a parent that has a sibling within root
    root.locator(`text=${label}`).locator("xpath=..").locator("xpath=following-sibling::*").first(),
    // strategy 3: text within the same container, strictly within details
    root.locator(`:has-text("${label}")`).first(),
  ];

  for (const loc of strategies) {
    try {
      const text = await loc.textContent({ timeout: 1000 });
      if (text) {
        const cleaned = text.replace(new RegExp(`^${label}\\s*[:\\-]?\\s*`, "i"), "").trim();
        if (cleaned) return cleaned;
      }
    } catch { continue; }
  }
  return null;
}

// ─── Page Validation & Column discovery ──────────────────────────────────────

/**
 * Checks if the current page is an authentication or SSO landing page.
 */
export async function isAuthPage(page: Page): Promise<boolean> {
  const url = page.url();
  
  // 1. Domain/URL based checks (Strongest)
  const authDomains = [
    "idp.uwaterloo.ca",
    "adfs.uwaterloo.ca",
    "microsoftonline.com",
    "duosecurity.com",
    "/d2l/login",
    "shibboleth"
  ];
  if (authDomains.some(d => url.includes(d))) return true;

  // 2. Specific form/element checks (High confidence)
  for (const selector of SEL.loginForm) {
    if (await page.locator(selector).isVisible().catch(() => false)) return true;
  }

  return false;
}

/**
 * Multi-signal validation to ensure we are on the expected page.
 */
async function ensureOnPage(page: Page, pageName: string, options?: {
  urlPattern?: RegExp;
  anchorSelector?: string;
  requiredText?: string;
}): Promise<void> {
  // 1. Auth check
  if (await isAuthPage(page)) {
    throw new ScraperError("LOGIN_REQUIRED", `Redirected to login while accessing ${pageName}.`);
  }

  const url = page.url();

  // 2. URL check
  if (options?.urlPattern && !options.urlPattern.test(url)) {
    throw new ScraperError("LAYOUT_CHANGED", `Unexpected URL for ${pageName}: ${url}`);
  }

  // 3. Anchor check
  if (options?.anchorSelector) {
    try {
      await page.waitForSelector(options.anchorSelector, { timeout: 5000 });
    } catch {
      // Check for "No results" as a valid empty state
      for (const marker of SEL.noResults) {
        if (await page.locator(marker).isVisible()) return;
      }
      throw new ScraperError("LAYOUT_CHANGED", `Expected element (${options.anchorSelector}) missing on ${pageName}.`);
    }
  }

  // 4. Critical text check
  if (options?.requiredText) {
    const textFound = await page.locator(`text=${options.requiredText}`).isVisible();
    if (!textFound) throw new ScraperError("LAYOUT_CHANGED", `Required text "${options.requiredText}" missing on ${pageName}.`);
  }
}

/**
 * Normalizes header strings into canonical field names.
 */
export function normalizeHeader(raw: string): string | null {
  const cleaned = raw.toLowerCase().trim();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(cleaned)) return key;
    if (aliases.some(a => cleaned.includes(a))) return key; // Partial fallback
  }
  return null;
}

/**
 * Maps table header text to column indices.
 */
async function getColumnMap(page: Page | Locator, requiredHeaders: string[]): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  const headerLocators = await page.locator(SEL.tableHeader).all();

  for (let i = 0; i < headerLocators.length; i++) {
    const rawText = (await headerLocators[i].textContent()) || "";
    const canonical = normalizeHeader(rawText);
    if (canonical) map[canonical] = i + 1;
  }

  // Validation
  const missing = requiredHeaders.filter(h => !map[h]);
  if (missing.length === requiredHeaders.length) { // Fail if NO required headers found
    throw new ScraperError("LAYOUT_CHANGED", `Table layout is unrecognizable. Missing all headers: ${requiredHeaders.join(", ")}`);
  }

  return map;
}

// ─── Session management ───────────────────────────────────────────────────────

let _context: BrowserContext | null = null;
async function getContext(): Promise<BrowserContext> {
  if (_context) return _context;
  _context = await getAuthenticatedContext();
  return _context;
}

async function navigateTo(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  
  // Wait until we are no longer on an auth page (max 2 mins)
  const start = Date.now();
  while (await isAuthPage(page)) {
    if (Date.now() - start > 120000) {
      throw new ScraperError("LOGIN_REQUIRED", "Timed out waiting for SSO/Login to complete.");
    }
    await page.waitForTimeout(2000);
  }
}

async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try { return await fn(page); } finally { await page.close(); }
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface JobPosting {
  jobId: string | null;
  title: string | null;
  organization: string | null;
  division: string | null;
  location: string | null;
  deadline: string | null;
  openings: string | null;
  jobType: string | null;
}

export interface JobDetail extends JobPosting {
  description: string | null;
  salary: string | null;
  term: string | null;
}

export interface Application {
  jobId: string | null;
  title: string | null;
  organization: string | null;
  status: string | null;
  deadline: string | null;
  term: string | null;
}

export interface Interview {
  title: string | null;
  organization: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  type: string | null;
  status: string | null;
}

export interface Ranking {
  title: string | null;
  organization: string | null;
  rankReceived: string | null;
  status: string | null;
  term: string | null;
}

export interface SavedJob {
  jobId: string | null;
  title: string | null;
  organization: string | null;
  deadline: string | null;
  term: string | null;
}

// ─── Scraping functions ───────────────────────────────────────────────────────

export async function getJobPostings(filters?: {
  term?: string;
  jobType?: string;
  location?: string;
  limit?: number;
}): Promise<JobPosting[]> {
  return withPage(async (page) => {
    await navigateTo(page, WW_URLS.postings);
    await ensureOnPage(page, "Job Postings", {
      urlPattern: /posting/,
      anchorSelector: SEL.tableContainer
    });

    const colMap = await getColumnMap(page, ["id", "title", "organization"]);
    const rows = await page.locator(SEL.tableRow).all();
    const results: JobPosting[] = [];
    const limit = filters?.limit ?? 50;

    for (const row of rows.slice(0, limit)) {
      const posting: JobPosting = {
        jobId:        colMap["id"] ? await safeText(row, `td:nth-child(${colMap["id"]})`, "id") : null,
        title:        colMap["title"] ? await safeText(row, `td:nth-child(${colMap["title"]})`, "title", { required: true }) : null,
        organization: colMap["organization"] ? await safeText(row, `td:nth-child(${colMap["organization"]})`, "org") : null,
        division:     colMap["division"] ? await safeText(row, `td:nth-child(${colMap["division"]})`, "division") : null,
        location:     colMap["location"] ? await safeText(row, `td:nth-child(${colMap["location"]})`, "location") : null,
        deadline:     colMap["deadline"] ? await safeText(row, `td:nth-child(${colMap["deadline"]})`, "deadline") : null,
        openings:     colMap["openings"] ? await safeText(row, `td:nth-child(${colMap["openings"]})`, "openings") : null,
        jobType:      colMap["type"] ? await safeText(row, `td:nth-child(${colMap["type"]})`, "type") : null,
      };

      if (!posting.title) continue;
      results.push(posting);
    }
    return results;
  });
}

export async function getJobDetails(jobId: string): Promise<JobDetail> {
  return withPage(async (page) => {
    const url = `${WW_URLS.postings}/${jobId}`;
    await navigateTo(page, url);
    await ensureOnPage(page, "Job Details", { anchorSelector: SEL.detailContainer });

    return {
      jobId,
      title:        await safeText(page, SEL.detailTitle, "title", { required: true }),
      organization: await safeText(page, SEL.detailOrg, "org"),
      division:     await findDetailValue(page, "Division"),
      location:     await findDetailValue(page, "Location"),
      deadline:     await findDetailValue(page, "Deadline"),
      openings:     await findDetailValue(page, "Openings"),
      jobType:      await findDetailValue(page, "Type"),
      description:  await safeText(page, SEL.detailDescription, "desc", { quiet: true }),
      salary:       await findDetailValue(page, "Salary"),
      term:         await findDetailValue(page, "Term"),
    };
  });
}

export async function getMyApplications(): Promise<Application[]> {
  return withPage(async (page) => {
    await navigateTo(page, WW_URLS.applications);
    await ensureOnPage(page, "Applications", { anchorSelector: SEL.tableContainer });

    const colMap = await getColumnMap(page, ["id", "title", "status"]);
    const rows = await page.locator(SEL.tableRow).all();
    const results: Application[] = [];

    for (const row of rows) {
      const app = {
        jobId:        colMap["id"] ? await safeText(row, `td:nth-child(${colMap["id"]})`, "id") : null,
        title:        colMap["title"] ? await safeText(row, `td:nth-child(${colMap["title"]})`, "title", { required: true }) : null,
        organization: colMap["organization"] ? await safeText(row, `td:nth-child(${colMap["organization"]})`, "org") : null,
        status:       colMap["status"] ? await safeText(row, `td:nth-child(${colMap["status"]})`, "status", { required: true }) : null,
        deadline:     colMap["deadline"] ? await safeText(row, `td:nth-child(${colMap["deadline"]})`, "deadline") : null,
        term:         colMap["term"] ? await safeText(row, `td:nth-child(${colMap["term"]})`, "term") : null,
      };
      if (app.title) results.push(app);
    }
    return results;
  });
}

export async function getInterviewSchedule(): Promise<Interview[]> {
  return withPage(async (page) => {
    await navigateTo(page, WW_URLS.interviews);
    await ensureOnPage(page, "Interviews", { anchorSelector: SEL.tableContainer });

    const colMap = await getColumnMap(page, ["title", "organization", "date"]);
    const rows = await page.locator(SEL.tableRow).all();
    const results: Interview[] = [];

    for (const row of rows) {
      const intv = {
        title:        colMap["title"] ? await safeText(row, `td:nth-child(${colMap["title"]})`, "title", { required: true }) : null,
        organization: colMap["organization"] ? await safeText(row, `td:nth-child(${colMap["organization"]})`, "org") : null,
        date:         colMap["date"] ? await safeText(row, `td:nth-child(${colMap["date"]})`, "date") : null,
        time:         colMap["time"] ? await safeText(row, `td:nth-child(${colMap["time"]})`, "time") : null,
        location:     colMap["location"] ? await safeText(row, `td:nth-child(${colMap["location"]})`, "loc") : null,
        type:         colMap["type"] ? await safeText(row, `td:nth-child(${colMap["type"]})`, "type") : null,
        status:       colMap["status"] ? await safeText(row, `td:nth-child(${colMap["status"]})`, "status") : null,
      };
      if (intv.title) results.push(intv);
    }
    return results;
  });
}

export async function getRankingStatus(): Promise<Ranking[]> {
  return withPage(async (page) => {
    await navigateTo(page, WW_URLS.rankings);
    await ensureOnPage(page, "Rankings", { anchorSelector: SEL.tableContainer });

    const colMap = await getColumnMap(page, ["title", "rank"]);
    const rows = await page.locator(SEL.tableRow).all();
    const results: Ranking[] = [];

    for (const row of rows) {
      const rank = {
        title:        colMap["title"] ? await safeText(row, `td:nth-child(${colMap["title"]})`, "title", { required: true }) : null,
        organization: colMap["organization"] ? await safeText(row, `td:nth-child(${colMap["organization"]})`, "org") : null,
        rankReceived: colMap["rank"] ? await safeText(row, `td:nth-child(${colMap["rank"]})`, "rank") : null,
        status:       colMap["status"] ? await safeText(row, `td:nth-child(${colMap["status"]})`, "status") : null,
        term:         colMap["term"] ? await safeText(row, `td:nth-child(${colMap["term"]})`, "term") : null,
      };
      if (rank.title) results.push(rank);
    }
    return results;
  });
}

export async function getSavedJobs(): Promise<SavedJob[]> {
  return withPage(async (page) => {
    await navigateTo(page, WW_URLS.savedJobs);
    await ensureOnPage(page, "Saved Jobs", { anchorSelector: SEL.tableContainer });

    const colMap = await getColumnMap(page, ["id", "title"]);
    const rows = await page.locator(SEL.tableRow).all();
    const results: SavedJob[] = [];

    for (const row of rows) {
      const saved = {
        jobId:        colMap["id"] ? await safeText(row, `td:nth-child(${colMap["id"]})`, "id") : null,
        title:        colMap["title"] ? await safeText(row, `td:nth-child(${colMap["title"]})`, "title", { required: true }) : null,
        organization: colMap["organization"] ? await safeText(row, `td:nth-child(${colMap["organization"]})`, "org") : null,
        deadline:     colMap["deadline"] ? await safeText(row, `td:nth-child(${colMap["deadline"]})`, "deadline") : null,
        term:         colMap["term"] ? await safeText(row, `td:nth-child(${colMap["term"]})`, "term") : null,
      };
      if (saved.title) results.push(saved);
    }
    return results;
  });
}

export async function searchJobs(
  query: string,
  filters?: { term?: string; jobType?: string; location?: string; limit?: number }
): Promise<JobPosting[]> {
  const all = await getJobPostings({ ...filters, limit: filters?.limit ?? 200 });
  const q = query.toLowerCase();
  return all.filter((p) =>
    JSON.stringify(p).toLowerCase().includes(q)
  ).slice(0, filters?.limit ?? 20);
}

export async function closeContext(): Promise<void> {
  if (_context) {
    await _context.close();
    _context = null;
  }
}
