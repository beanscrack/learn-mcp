import "dotenv/config";
import { chromium, Page, BrowserContext, type Request } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type SessionInfo = {
  cookies: any[];
  origins: any[];
};

// UWaterloo LEARN base URL and session storage path
const D2L_HOST = process.env.D2L_BASE_URL
  ? new URL(process.env.D2L_BASE_URL).hostname
  : "learn.uwaterloo.ca";
const HOME_URL = `https://${D2L_HOST}/d2l/home`;
const LOGIN_URL = `https://${D2L_HOST}`;

let finalSessionDir: string;
if (process.env.SESSION_DIR) {
  finalSessionDir = path.isAbsolute(process.env.SESSION_DIR)
    ? process.env.SESSION_DIR
    : path.join(process.cwd(), process.env.SESSION_DIR);
} else {
  finalSessionDir = path.join(os.homedir(), ".learn-session");
}
export const SESSION_DIR = finalSessionDir;
export const SESSION_FILE = path.join(SESSION_DIR, "session.json");

// Optional credentials for pre-filling the Shibboleth form.
// Note: Duo MFA still requires interactive browser — credentials only speed up
// the username/password steps; user must still approve the Duo push manually.
const D2L_USERNAME = process.env.D2L_USERNAME;
const D2L_PASSWORD = process.env.D2L_PASSWORD;

// In-memory token cache
interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
}
let tokenCache: TokenCache = { token: "", expiresAt: 0 };

// Token validity window: 22 hours (D2L issues 23h tokens; 1h buffer for safety)
const TOKEN_TTL_MS = 22 * 60 * 60 * 1000;

/**
 * Returns true when the given URL is a login / IdP page that requires
 * user interaction. UWaterloo uses Shibboleth at idp.uwaterloo.ca.
 */
function isLoginPage(url: string): boolean {
  return (
    url.includes("idp.uwaterloo.ca") ||
    url.includes("/d2l/login") ||
    url.includes("login") ||
    url.includes("sso") ||
    url.includes("adfs")
  );
}

/**
 * Pre-fill the UWaterloo Shibboleth login form if credentials are provided.
 * The user must still approve the Duo MFA push — this only handles the
 * username/password fields.
 *
 * Shibboleth IdP selectors (standard across all Shibboleth v3+ deployments):
 *   username: input[name="j_username"]
 *   password: input[name="j_password"]
 *
 * NOTE: These selectors are MEDIUM confidence from training data.
 * Verify against live idp.uwaterloo.ca on first run.
 */
async function prefillShibbolethForm(page: Page): Promise<void> {
  if (!D2L_USERNAME || !D2L_PASSWORD) return;

  console.error("[AUTH] Pre-filling UWaterloo Shibboleth login form...");

  try {
    const usernameField = page.locator(
      'input[name="j_username"], input#username, input[type="text"]'
    ).first();
    await usernameField.waitFor({ state: "visible", timeout: 10000 });
    await usernameField.fill(D2L_USERNAME);
    console.error("[AUTH] Username filled");
  } catch {
    console.error("[AUTH] Could not find username field — fill manually");
    return;
  }

  try {
    const passwordField = page.locator(
      'input[name="j_password"], input#password, input[type="password"]'
    ).first();
    await passwordField.waitFor({ state: "visible", timeout: 5000 });
    await passwordField.fill(D2L_PASSWORD);
    console.error("[AUTH] Password filled — submit and complete Duo MFA");
  } catch {
    console.error("[AUTH] Could not find password field — fill manually");
  }
}

/**
 * Open a page, navigate to LEARN, handle the Shibboleth SSO redirect,
 * and capture the Bearer token from a D2L API request.
 *
 * @param context - Playwright persistent context
 * @param quickCheck - if true, use short timeouts (session cache hit path)
 */
async function captureToken(
  context: BrowserContext,
  quickCheck: boolean
): Promise<{ token: string; needsLogin: boolean }> {
  const start = Date.now();
  console.error(`[AUTH] Starting token capture (quickCheck: ${quickCheck})`);

  const page = await context.newPage();
  let capturedToken = "";

  // Intercept all D2L API requests to sniff the Authorization header
  page.on("request", (req: Request) => {
    if (req.url().includes("/d2l/api/")) {
      const auth = req.headers()["authorization"];
      if (auth?.startsWith("Bearer ")) {
        capturedToken = auth.slice(7);
        console.error(
          `[AUTH] Bearer token captured from ${req.url()} (+${Date.now() - start}ms)`
        );
      }
    }
  });

  // Navigate to LEARN — will redirect to Shibboleth IdP if session is cold
  console.error(`[AUTH] Navigating to ${LOGIN_URL}`);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  let currentUrl = page.url();
  console.error(`[AUTH] Landed at: ${currentUrl}`);

  const needsLogin = isLoginPage(currentUrl);
  console.error(`[AUTH] Needs login: ${needsLogin}`);

  if (needsLogin) {
    if (quickCheck) {
      // In quick-check mode we don't open the headed browser here — the caller
      // will re-launch headed if needed.
      await page.close();
      return { token: "", needsLogin: true };
    }

    // Try to pre-fill credentials so the user only needs to handle Duo MFA
    await prefillShibbolethForm(page);

    // Wait for the user to complete login (including Duo MFA)
    console.error("[AUTH] Waiting for login completion (Duo MFA required)...");
    await page.waitForURL((url: string | URL) => !isLoginPage(url.toString()), {
      timeout: 120000, // 2 minutes for user to complete Duo
    });
    await page.waitForLoadState("networkidle");
    console.error(`[AUTH] Login completed, now at: ${page.url()}`);
  }

  // Navigate to /d2l/home to trigger authenticated API calls that expose the token
  if (!capturedToken && !isLoginPage(page.url())) {
    console.error(`[AUTH] Navigating to ${HOME_URL} to trigger API token...`);
    await page.goto(HOME_URL, { waitUntil: "networkidle", timeout: 30000 });
  }

  // Poll for token capture (page may fire API requests asynchronously)
  const maxWait = quickCheck ? 10000 : 30000;
  const pollStart = Date.now();
  while (!capturedToken && Date.now() - pollStart < maxWait) {
    await page.waitForTimeout(500);
    if (!capturedToken) {
      // Scroll to trigger lazy-loaded widgets that fire API calls
      await page.evaluate(() => window.scrollBy(0, 100));
    }
  }

  await page.close();

  if (!capturedToken) {
    if (quickCheck) {
      return { token: "", needsLogin: true };
    }
    throw new Error(
      "Failed to capture Bearer token from D2L API requests. " +
      "Ensure login completed successfully and the LEARN homepage loaded."
    );
  }

  console.error(`[AUTH] Token capture complete (+${Date.now() - start}ms)`);
  return { token: capturedToken, needsLogin: false };
}

/**
 * Get a valid Bearer token, using the in-memory cache when possible.
 * On cache miss or expiry, launches Playwright to refresh the session.
 * If the cached session has expired, relaunches headed so the user can
 * complete Duo MFA again.
 */
export async function getToken(): Promise<string> {
  // In-memory cache hit (with 1h safety buffer already baked into TOKEN_TTL_MS)
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    const remaining = Math.round((tokenCache.expiresAt - Date.now()) / 1000);
    console.error(`[AUTH] Cache hit — token valid for ${remaining}s`);
    return tokenCache.token;
  }

  console.error("[AUTH] Cache miss — refreshing token via Playwright");
  let context: BrowserContext;
  const hasSession = fs.existsSync(SESSION_FILE);

  if (hasSession) {
    console.error("[AUTH] Found cached session file");
    context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true,
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    console.error(`[AUTH] Browser launched (headless: true)`);
  } else {
    console.error("[AUTH] No cached session found — launching headed for login");
    context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    console.error(`[AUTH] Browser launched (headless: false)`);
  }

  try {
    const result = await captureToken(context, hasSession /* quickCheck */);

    if (result.needsLogin && hasSession) {
      // Disk session expired — close headless browser and reopen headed for Duo
      await context.close();
      console.error("[AUTH] Disk session expired — relaunching headed for Duo MFA");
      context = await chromium.launchPersistentContext(SESSION_DIR, {
        headless: false,
        viewport: { width: 1280, height: 720 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      });
      const retry = await captureToken(context, false);
      tokenCache = { token: retry.token, expiresAt: Date.now() + TOKEN_TTL_MS };
      return retry.token;
    }

    tokenCache = { token: result.token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return result.token;
  } finally {
    await context.close();
  }
}

/**
 * Force a token refresh on next getToken() call.
 * Call this when a 401 is received from the D2L API.
 */
export function invalidateToken(): void {
  console.error("[AUTH] Token invalidated");
  tokenCache = { token: "", expiresAt: 0 };
}

/** Returns the expiry timestamp (epoch ms) of the cached token. */
export function getTokenExpiry(): number {
  return tokenCache.expiresAt;
}

/**
 * Returns a persistent Playwright BrowserContext authenticated with
 * UWaterloo ADFS. Used by the WaterlooWorks client (Phase 5) to share
 * the same Shibboleth session — no second Duo MFA prompt required.
 *
 * Caller is responsible for closing the context when done.
 */
export async function getAuthenticatedContext(): Promise<BrowserContext> {

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false, // WaterlooWorks blocks headless Chromium
    viewport: { width: 1280, height: 720 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  // Verify the session is still valid by navigating to LEARN home
  const page = await context.newPage();
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  const url = page.url();

  if (isLoginPage(url)) {
    // Session expired — pre-fill and wait for Duo
    await prefillShibbolethForm(page);
    console.error("[AUTH] getAuthenticatedContext: waiting for login (Duo MFA)...");
    await page.waitForURL((u: URL | string) => !isLoginPage(u.toString()), {
      timeout: 120000,
    });
    await page.waitForLoadState("networkidle");
    // Refresh token cache too
    invalidateToken();
  }

  await page.close();
  return context;
}
