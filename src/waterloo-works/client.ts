/**
 * WaterlooWorks scraping client.
 *
 * SCRP-01: All CSS selectors are isolated in the SELECTORS and URLS objects
 *          below. When the site changes, only edit those two objects.
 * SCRP-02: Every page.$eval() is wrapped in safeText()/safeAttr().
 *          Selector failures log the selector name and return null — callers
 *          return partial data, never throw.
 * SCRP-03: All page.goto() calls use timeout: 30_000 ms.
 *          All page.waitForSelector() calls use timeout: 10_000 ms.
 *
 * LOW CONFIDENCE NOTICE:
 * CSS selectors and URLs below were inferred from public WaterlooWorks
 * documentation and common SPA patterns. Verify each against the live site
 * before relying on them. Failed selectors are logged with their constant
 * name so you can find and fix them here quickly.
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { getAuthenticatedContext } from "../auth.js";

// ─── URL configuration (LOW CONFIDENCE — verify against live site) ────────
const WW_BASE = "https://waterlooworks.uwaterloo.ca";
export const WW_URLS = {
  home:         `${WW_BASE}/myAccount`,
  postings:     `${WW_BASE}/myAccount/co-op/full/co-op/posting`,
  applications: `${WW_BASE}/myAccount/co-op/full/co-op/application`,
  interviews:   `${WW_BASE}/myAccount/co-op/full/co-op/interview`,
  rankings:     `${WW_BASE}/myAccount/co-op/full/co-op/ranking`,
  savedJobs:    `${WW_BASE}/myAccount/co-op/full/co-op/posting/saved`,
};

// ─── CSS selector configuration (LOW CONFIDENCE — verify against live site) ─
// Selector names (string keys) are used in log messages so failed selectors
// are easy to locate in this file. NEVER reference these from tool handlers.
export const SEL = {
  // ── Auth redirect detection ───────────────────────────────────────────────
  loginForm:           'form[action*="login"], input[name="j_username"], #loginForm',

  // ── Job postings table ────────────────────────────────────────────────────
  postingRow:          'table tbody tr, tr[data-jobid], .posting-row',
  postingJobId:        '[data-jobid], [data-job-id]',
  postingTitle:        'td:nth-child(2) a, .job-title a, td.title a',
  postingOrg:          'td:nth-child(3), .organization, td.org-name',
  postingDivision:     'td:nth-child(4), .division',
  postingLocation:     'td:nth-child(5), .location',
  postingDeadline:     'td:nth-child(6), .deadline, td.app-deadline',
  postingOpenings:     'td:nth-child(7), .openings',
  postingJobType:      'td:nth-child(8), .job-type',

  // ── Job detail page ───────────────────────────────────────────────────────
  detailTitle:         'h1.job-title, h1, .posting-title h1, [class*="title"] h1',
  detailOrg:           '.organization-name, .employer-name, [class*="employer"]',
  detailDivision:      '.division, [class*="division"]',
  detailLocation:      '.location, [class*="location"]',
  detailDeadline:      '.application-deadline, .deadline, [class*="deadline"]',
  detailOpenings:      '.openings, [class*="openings"]',
  detailJobType:       '.job-type, [class*="job-type"]',
  detailDescription:   '.job-description, #job-description, [class*="description"]',
  detailSalary:        '.salary, [class*="salary"], [class*="compensation"]',
  detailTerm:          '.work-term, .term, [class*="term"]',

  // ── Applications table ────────────────────────────────────────────────────
  appRow:              'table tbody tr, .application-row',
  appJobId:            '[data-jobid], [data-job-id]',
  appTitle:            'td:nth-child(1) a, td:nth-child(2) a, .job-title',
  appOrg:              'td:nth-child(2), td:nth-child(3), .organization',
  appStatus:           'td:nth-child(3), td:nth-child(4), .status, .app-status',
  appDeadline:         'td:nth-child(4), td:nth-child(5), .deadline',
  appTerm:             'td:nth-child(5), td:nth-child(6), .term',

  // ── Interviews table ──────────────────────────────────────────────────────
  interviewRow:        'table tbody tr, .interview-row',
  interviewTitle:      'td:nth-child(1), .job-title',
  interviewOrg:        'td:nth-child(2), .organization',
  interviewDate:       'td:nth-child(3), .interview-date, .date',
  interviewTime:       'td:nth-child(4), .interview-time, .time',
  interviewLocation:   'td:nth-child(5), .interview-location',
  interviewType:       'td:nth-child(6), .interview-type, .type',
  interviewStatus:     'td:nth-child(7), .status',

  // ── Rankings table ────────────────────────────────────────────────────────
  rankRow:             'table tbody tr, .ranking-row',
  rankTitle:           'td:nth-child(1), .job-title',
  rankOrg:             'td:nth-child(2), .organization',
  rankReceived:        'td:nth-child(3), .rank-received, .your-rank',
  rankStatus:          'td:nth-child(4), .ranking-status, .status',
  rankTerm:            'td:nth-child(5), .term',

  // ── Saved jobs table ──────────────────────────────────────────────────────
  savedRow:            'table tbody tr, .saved-job-row, .watchlist-row',
  savedJobId:          '[data-jobid], [data-job-id]',
  savedTitle:          'td:nth-child(1) a, td:nth-child(2) a, .job-title',
  savedOrg:            'td:nth-child(2), td:nth-child(3), .organization',
  savedDeadline:       'td:nth-child(3), td:nth-child(4), .deadline',
  savedTerm:           'td:nth-child(4), td:nth-child(5), .term',
};

// ─── Auth detection ───────────────────────────────────────────────────────────

function isAuthPage(url: string): boolean {
  return (
    url.includes("idp.uwaterloo.ca") ||
    url.includes("/d2l/login") ||
    url.includes("adfs") ||
    url.includes("sso") ||
    url.includes("login")
  );
}

// ─── Safe extraction helpers ──────────────────────────────────────────────────

async function safeText(
  page: Page,
  selector: string,
  selectorName: string,
  root?: string
): Promise<string | null> {
  try {
    const locator = root
      ? page.locator(root).locator(selector).first()
      : page.locator(selector).first();
    const text = await locator.textContent({ timeout: 10_000 });
    return text?.trim() || null;
  } catch {
    console.error(`[WW] selector failed: SEL.${selectorName} (${selector})`);
    return null;
  }
}

async function safeAttr(
  page: Page,
  selector: string,
  attr: string,
  selectorName: string,
  root?: string
): Promise<string | null> {
  try {
    const locator = root
      ? page.locator(root).locator(selector).first()
      : page.locator(selector).first();
    const val = await locator.getAttribute(attr, { timeout: 10_000 });
    return val?.trim() || null;
  } catch {
    console.error(`[WW] attr failed: SEL.${selectorName}[${attr}] (${selector})`);
    return null;
  }
}

// ─── Session management ───────────────────────────────────────────────────────

let _context: BrowserContext | null = null;

async function getContext(): Promise<BrowserContext> {
  if (_context) return _context;
  _context = await getAuthenticatedContext();
  return _context;
}

async function navigateTo(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const currentUrl = page.url();
  if (isAuthPage(currentUrl)) {
    console.error("[WW] Auth redirect detected — waiting for SSO to complete...");
    await page.waitForURL((u) => !isAuthPage(u.toString()), {
      timeout: 120_000,
    });
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    console.error(`[WW] SSO complete, now at: ${page.url()}`);
  }
}

async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close();
  }
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

    // Wait for the table to appear; if it doesn't, return empty with a warning
    try {
      await page.waitForSelector(SEL.postingRow, { timeout: 10_000 });
    } catch {
      console.error("[WW] No posting rows found — table may not have loaded");
      return [];
    }

    const rows = await page.locator(SEL.postingRow).all();
    const results: JobPosting[] = [];
    const limit = filters?.limit ?? 50;

    for (const row of rows.slice(0, limit)) {
      const posting: JobPosting = {
        jobId:        await safeText(page, SEL.postingJobId, "postingJobId") ??
                      await safeAttr(page, SEL.postingJobId, "data-jobid", "postingJobId"),
        title:        await row.locator(SEL.postingTitle).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        organization: await row.locator(SEL.postingOrg).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        division:     await row.locator(SEL.postingDivision).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        location:     await row.locator(SEL.postingLocation).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        deadline:     await row.locator(SEL.postingDeadline).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        openings:     await row.locator(SEL.postingOpenings).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        jobType:      await row.locator(SEL.postingJobType).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
      };

      // Client-side filtering
      if (filters?.term && !JSON.stringify(posting).toLowerCase().includes(filters.term.toLowerCase())) continue;
      if (filters?.jobType && posting.jobType && !posting.jobType.toLowerCase().includes(filters.jobType.toLowerCase())) continue;
      if (filters?.location && posting.location && !posting.location.toLowerCase().includes(filters.location.toLowerCase())) continue;

      results.push(posting);
    }

    return results;
  });
}

export async function getJobDetails(jobId: string): Promise<JobDetail> {
  return withPage(async (page) => {
    // Try navigating directly with the job ID appended
    const url = `${WW_URLS.postings}/${jobId}`;
    await navigateTo(page, url);

    return {
      jobId,
      title:        await safeText(page, SEL.detailTitle, "detailTitle"),
      organization: await safeText(page, SEL.detailOrg, "detailOrg"),
      division:     await safeText(page, SEL.detailDivision, "detailDivision"),
      location:     await safeText(page, SEL.detailLocation, "detailLocation"),
      deadline:     await safeText(page, SEL.detailDeadline, "detailDeadline"),
      openings:     await safeText(page, SEL.detailOpenings, "detailOpenings"),
      jobType:      await safeText(page, SEL.detailJobType, "detailJobType"),
      description:  await safeText(page, SEL.detailDescription, "detailDescription"),
      salary:       await safeText(page, SEL.detailSalary, "detailSalary"),
      term:         await safeText(page, SEL.detailTerm, "detailTerm"),
    };
  });
}

export async function searchJobs(
  query: string,
  filters?: { term?: string; jobType?: string; location?: string; limit?: number }
): Promise<JobPosting[]> {
  // Fetch all postings and filter by keyword client-side
  // WaterlooWorks doesn't expose a public search API
  const all = await getJobPostings({ ...filters, limit: filters?.limit ?? 200 });
  const q = query.toLowerCase();
  return all.filter((p) =>
    JSON.stringify(p).toLowerCase().includes(q)
  ).slice(0, filters?.limit ?? 20);
}

export async function getMyApplications(): Promise<Application[]> {
  return withPage(async (page) => {
    await navigateTo(page, WW_URLS.applications);

    try {
      await page.waitForSelector(SEL.appRow, { timeout: 10_000 });
    } catch {
      console.error("[WW] No application rows found");
      return [];
    }

    const rows = await page.locator(SEL.appRow).all();
    const results: Application[] = [];

    for (const row of rows) {
      results.push({
        jobId:        await row.locator(SEL.appJobId).first().getAttribute("data-jobid", { timeout: 5_000 }).catch(() => null),
        title:        await row.locator(SEL.appTitle).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        organization: await row.locator(SEL.appOrg).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        status:       await row.locator(SEL.appStatus).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        deadline:     await row.locator(SEL.appDeadline).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        term:         await row.locator(SEL.appTerm).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
      });
    }

    return results;
  });
}

export async function getInterviewSchedule(): Promise<Interview[]> {
  return withPage(async (page) => {
    await navigateTo(page, WW_URLS.interviews);

    try {
      await page.waitForSelector(SEL.interviewRow, { timeout: 10_000 });
    } catch {
      console.error("[WW] No interview rows found");
      return [];
    }

    const rows = await page.locator(SEL.interviewRow).all();
    const results: Interview[] = [];

    for (const row of rows) {
      results.push({
        title:        await row.locator(SEL.interviewTitle).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        organization: await row.locator(SEL.interviewOrg).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        date:         await row.locator(SEL.interviewDate).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        time:         await row.locator(SEL.interviewTime).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        location:     await row.locator(SEL.interviewLocation).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        type:         await row.locator(SEL.interviewType).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        status:       await row.locator(SEL.interviewStatus).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
      });
    }

    return results;
  });
}

export async function getRankingStatus(): Promise<Ranking[]> {
  return withPage(async (page) => {
    await navigateTo(page, WW_URLS.rankings);

    try {
      await page.waitForSelector(SEL.rankRow, { timeout: 10_000 });
    } catch {
      console.error("[WW] No ranking rows found");
      return [];
    }

    const rows = await page.locator(SEL.rankRow).all();
    const results: Ranking[] = [];

    for (const row of rows) {
      results.push({
        title:        await row.locator(SEL.rankTitle).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        organization: await row.locator(SEL.rankOrg).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        rankReceived: await row.locator(SEL.rankReceived).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        status:       await row.locator(SEL.rankStatus).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        term:         await row.locator(SEL.rankTerm).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
      });
    }

    return results;
  });
}

export async function getSavedJobs(): Promise<SavedJob[]> {
  return withPage(async (page) => {
    await navigateTo(page, WW_URLS.savedJobs);

    try {
      await page.waitForSelector(SEL.savedRow, { timeout: 10_000 });
    } catch {
      console.error("[WW] No saved job rows found");
      return [];
    }

    const rows = await page.locator(SEL.savedRow).all();
    const results: SavedJob[] = [];

    for (const row of rows) {
      results.push({
        jobId:        await row.locator(SEL.savedJobId).first().getAttribute("data-jobid", { timeout: 5_000 }).catch(() => null),
        title:        await row.locator(SEL.savedTitle).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        organization: await row.locator(SEL.savedOrg).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        deadline:     await row.locator(SEL.savedDeadline).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
        term:         await row.locator(SEL.savedTerm).first().textContent({ timeout: 5_000 }).then((t) => t?.trim() ?? null).catch(() => null),
      });
    }

    return results;
  });
}

/** Release the shared browser context. Called on server shutdown. */
export async function closeContext(): Promise<void> {
  if (_context) {
    await _context.close();
    _context = null;
  }
}
