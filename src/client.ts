import { getToken, invalidateToken } from "./auth.js";

const D2L_BASE_URL =
  process.env.D2L_BASE_URL?.replace(/\/$/, "") ||
  "https://learn.uwaterloo.ca";
const LP_VERSION = process.env.D2L_LP_VERSION || "1.57";

export class D2LClient {
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retry = true
  ): Promise<T> {
    const url = `${D2L_BASE_URL}${path}`;
    const token = await getToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const options: RequestInit = { method, headers };
    if (body) options.body = JSON.stringify(body);

    console.error(`[API] ${method} ${path}`);
    const res = await fetch(url, options);

    if (res.status === 401 && retry) {
      // Token expired mid-session — invalidate cache and retry once
      console.error("[API] 401 received — invalidating token and retrying");
      invalidateToken();
      return this.request<T>(method, path, body, false);
    }

    if (!res.ok) {
      const text = await res.text();
      const isAuthError = res.status === 401 || res.status === 403;
      throw Object.assign(
        new Error(`D2L API error ${res.status}: ${text}`),
        { status: res.status, isAuthError }
      );
    }

    console.error(`[API] ${res.status} ${method} ${path}`);
    return res.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  // ── Enrollments (LP API) ─────────────────────────────────────────────────

  async getMyEnrollments() {
    return this.get(`/d2l/api/lp/1.43/enrollments/myenrollments/`);
  }

  async whoami() {
    return this.get(`/d2l/api/lp/1.43/users/whoami`);
  }

  // ── Assignments / Dropbox (LE API) ───────────────────────────────────────

  async getDropboxFolders(orgUnitId: number) {
    return this.get(
      `/d2l/api/le/${LP_VERSION}/${orgUnitId}/dropbox/folders/`
    );
  }

  async getDropboxFolder(orgUnitId: number, folderId: number) {
    return this.get(
      `/d2l/api/le/${LP_VERSION}/${orgUnitId}/dropbox/folders/${folderId}`
    );
  }

  async getDropboxSubmissions(orgUnitId: number, folderId: number) {
    return this.get(
      `/d2l/api/le/${LP_VERSION}/${orgUnitId}/dropbox/folders/${folderId}/submissions/`
    );
  }

  // ── Grades ───────────────────────────────────────────────────────────────

  async getMyGradeValues(orgUnitId: number) {
    return this.get(
      `/d2l/api/le/${LP_VERSION}/${orgUnitId}/grades/values/myGradeValues/`
    );
  }

  // ── Calendar ─────────────────────────────────────────────────────────────

  async getMyCalendarEvents(
    orgUnitId: number,
    startDateTime: string,
    endDateTime: string
  ) {
    const params = new URLSearchParams({ startDateTime, endDateTime });
    return this.get(
      `/d2l/api/le/${LP_VERSION}/${orgUnitId}/calendar/events/myEvents/?${params}`
    );
  }

  // ── Content ──────────────────────────────────────────────────────────────

  async getContentToc(orgUnitId: number) {
    return this.get(
      `/d2l/api/le/${LP_VERSION}/${orgUnitId}/content/toc`
    );
  }

  async getContentTopic(orgUnitId: number, topicId: number) {
    return this.get(
      `/d2l/api/le/${LP_VERSION}/${orgUnitId}/content/topics/${topicId}`
    );
  }

  async getContentModules(orgUnitId: number) {
    return this.get(
      `/d2l/api/le/${LP_VERSION}/${orgUnitId}/content/root/`
    );
  }

  async getContentModule(orgUnitId: number, moduleId: number) {
    return this.get(
      `/d2l/api/le/${LP_VERSION}/${orgUnitId}/content/modules/${moduleId}/structure/`
    );
  }

  // ── Announcements / News ─────────────────────────────────────────────────

  async getNews(orgUnitId: number) {
    return this.get(`/d2l/api/le/${LP_VERSION}/${orgUnitId}/news/`);
  }
}

export const client = new D2LClient();
