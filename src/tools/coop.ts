import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getJobPostings,
  getJobDetails,
  searchJobs,
  getMyApplications,
  getInterviewSchedule,
  getRankingStatus,
  getSavedJobs,
  WW_URLS,
} from "../waterloo-works/client.js";
import { toolHandler } from "../utils/mcp.js";

export function registerCoopTools(server: McpServer) {
  server.tool(
    "get_job_postings",
    "Browse co-op job postings on WaterlooWorks.",
    {
      term: z.string().optional().describe('Filter by term keyword (e.g. "Winter 2026").'),
      jobType: z.string().optional().describe('Filter by job type keyword (e.g. "co-op").'),
      location: z.string().optional().describe('Filter by location keyword (e.g. "Toronto").'),
      limit: z.number().optional().describe("Max postings to return (default: 50)."),
    },
    toolHandler("get_job_postings", async ({ term, jobType, location, limit }) => {
      const results = await getJobPostings({ term, jobType, location, limit });
      if (results.length === 0) {
        return JSON.stringify({
          postings: [],
          hint: `No postings found. Check: ${WW_URLS.postings}`,
        });
      }
      return JSON.stringify({ postings: results, total: results.length }, null, 2);
    })
  );

  server.tool(
    "get_job_details",
    "Get full details for a specific WaterlooWorks job posting.",
    {
      jobId: z.string().describe("The job ID from get_job_postings."),
    },
    toolHandler("get_job_details", async ({ jobId }) => {
      const detail = await getJobDetails(jobId);
      return JSON.stringify(detail, null, 2);
    })
  );

  server.tool(
    "search_jobs",
    "Search WaterlooWorks job postings by keyword.",
    {
      query: z.string().describe("Search keyword (e.g. \"software engineer\")."),
      term: z.string().optional().describe('Optional term filter.'),
      jobType: z.string().optional().describe('Optional job type filter.'),
      location: z.string().optional().describe('Optional location filter.'),
      limit: z.number().optional().describe("Max results to return (default: 20)."),
    },
    toolHandler("search_jobs", async ({ query, term, jobType, location, limit }) => {
      const results = await searchJobs(query, { term, jobType, location, limit });
      return JSON.stringify({ query, postings: results, total: results.length }, null, 2);
    })
  );

  server.tool(
    "get_my_applications",
    "Get all your co-op job applications from WaterlooWorks with status.",
    {},
    toolHandler("get_my_applications", async () => {
      const apps = await getMyApplications();
      if (apps.length === 0) {
        return JSON.stringify({
          applications: [],
          hint: `No applications found. Check: ${WW_URLS.applications}`,
        });
      }
      return JSON.stringify({ applications: apps, total: apps.length }, null, 2);
    })
  );

  server.tool(
    "get_interview_schedule",
    "Get your upcoming co-op interviews from WaterlooWorks.",
    {},
    toolHandler("get_interview_schedule", async () => {
      const interviews = await getInterviewSchedule();
      if (interviews.length === 0) {
        return JSON.stringify({
          interviews: [],
          hint: `No interviews found. Check: ${WW_URLS.interviews}`,
        });
      }
      return JSON.stringify({ interviews, total: interviews.length }, null, 2);
    })
  );

  server.tool(
    "get_ranking_status",
    "Get your co-op ranking status from WaterlooWorks.",
    {},
    toolHandler("get_ranking_status", async () => {
      const rankings = await getRankingStatus();
      if (rankings.length === 0) {
        return JSON.stringify({
          rankings: [],
          hint: `No rankings found. Check: ${WW_URLS.rankings}`,
        });
      }
      return JSON.stringify({ rankings, total: rankings.length }, null, 2);
    })
  );

  server.tool(
    "get_saved_jobs",
    "Get your saved/watchlisted job postings from WaterlooWorks.",
    {},
    toolHandler("get_saved_jobs", async () => {
      const saved = await getSavedJobs();
      if (saved.length === 0) {
        return JSON.stringify({
          savedJobs: [],
          hint: `No saved jobs found. Check: ${WW_URLS.savedJobs}`,
        });
      }
      return JSON.stringify({ savedJobs: saved, total: saved.length }, null, 2);
    })
  );
}
