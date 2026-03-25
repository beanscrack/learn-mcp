import { describe, it, expect, vi } from "vitest";
import { normalizeHeader, isAuthPage } from "./client.js";
import { Page } from "playwright";

describe("WaterlooWorks Scraper - Unit Tests", () => {
  describe("normalizeHeader", () => {
    it("matches exact aliases", () => {
      expect(normalizeHeader("job id")).toBe("id");
      expect(normalizeHeader("title")).toBe("title");
      expect(normalizeHeader("employer")).toBe("organization");
    });

    it("matches partial text", () => {
      expect(normalizeHeader("work term id")).toBe("id");
      expect(normalizeHeader("posting title")).toBe("title");
      expect(normalizeHeader("application status")).toBe("status");
    });

    it("is case-insensitive", () => {
      expect(normalizeHeader("JOB ID")).toBe("id");
      expect(normalizeHeader("Organization Name")).toBe("organization");
    });

    it("returns null for unknown headers", () => {
      expect(normalizeHeader("unknown column")).toBeNull();
    });
  });

  describe("isAuthPage", () => {
    const mockPage = (url: string, visibleSelectors: string[] = []) => {
      return {
        url: () => url,
        locator: (sel: string) => ({
          isVisible: async () => visibleSelectors.includes(sel),
          first: () => ({ isVisible: async () => visibleSelectors.includes(sel) }),
        }),
      } as unknown as Page;
    };

    it("detects auth via domain", async () => {
      const page = mockPage("https://idp.uwaterloo.ca/idp/profile/SAML2/Redirect/SSO");
      expect(await isAuthPage(page)).toBe(true);
    });

    it("detects auth via SSO URL fragments", async () => {
      const page = mockPage("https://login.microsoftonline.com/common/oauth2/authorize");
      expect(await isAuthPage(page)).toBe(true);
    });

    it("detects auth via login form selectors", async () => {
      const page = mockPage("https://waterlooworks.uwaterloo.ca/auth/login", ["#loginForm"]);
      expect(await isAuthPage(page)).toBe(true);
    });

    it("returns false for job pages", async () => {
      const page = mockPage("https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/co-op/posting/123");
      expect(await isAuthPage(page)).toBe(false);
    });
  });
});
