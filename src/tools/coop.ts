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

export const coopTools = {
  get_job_postings: {
    description:
      'Browse co-op job postings on WaterlooWorks. Returns job id, title, organization, location, deadline, and openings. Use to answer: "What co-op jobs are available?", "Show me jobs in Toronto". A browser window will open — the shared ADFS session means no second Duo MFA prompt.',
    schema: {
      term: z
        .string()
        .optional()
        .describe('Filter by term keyword (e.g. "Winter 2026").'),
      jobType: z
        .string()
        .optional()
        .describe('Filter by job type keyword (e.g. "co-op", "part-time").'),
      location: z
        .string()
        .optional()
        .describe('Filter by location keyword (e.g. "Toronto", "Remote").'),
      limit: z
        .number()
        .optional()
        .describe("Max postings to return (default: 50)."),
    },
    handler: async ({
      term,
      jobType,
      location,
      limit,
    }: {
      term?: string;
      jobType?: string;
      location?: string;
      limit?: number;
    }): Promise<string> => {
      const results = await getJobPostings({ term, jobType, location, limit });
      if (results.length === 0) {
        return JSON.stringify({
          postings: [],
          hint: `No postings found. The page may have loaded but no rows matched, or the WaterlooWorks URL may have changed. Check: ${WW_URLS.postings}`,
        });
      }
      return JSON.stringify({ postings: results, total: results.length }, null, 2);
    },
  },

  get_job_details: {
    description:
      "Get full details for a specific WaterlooWorks job posting: description, salary, term, and application deadline. Use after get_job_postings to get more info on a specific job.",
    schema: {
      jobId: z
        .string()
        .describe("The job ID from get_job_postings."),
    },
    handler: async ({ jobId }: { jobId: string }): Promise<string> => {
      const detail = await getJobDetails(jobId);
      return JSON.stringify(detail, null, 2);
    },
  },

  search_jobs: {
    description:
      'Search WaterlooWorks job postings by keyword. Fetches postings and filters client-side. Use to answer: "Are there any software jobs?", "Find jobs matching machine learning".',
    schema: {
      query: z
        .string()
        .describe(
          "Search keyword (e.g. \"software engineer\", \"machine learning\")."
        ),
      term: z
        .string()
        .optional()
        .describe('Optional term filter (e.g. "Winter 2026").'),
      jobType: z
        .string()
        .optional()
        .describe('Optional job type filter (e.g. "co-op").'),
      location: z
        .string()
        .optional()
        .describe('Optional location filter (e.g. "Waterloo").'),
      limit: z
        .number()
        .optional()
        .describe("Max results to return (default: 20)."),
    },
    handler: async ({
      query,
      term,
      jobType,
      location,
      limit,
    }: {
      query: string;
      term?: string;
      jobType?: string;
      location?: string;
      limit?: number;
    }): Promise<string> => {
      const results = await searchJobs(query, { term, jobType, location, limit });
      return JSON.stringify(
        { query, postings: results, total: results.length },
        null,
        2
      );
    },
  },

  get_my_applications: {
    description:
      'Get all your co-op job applications from WaterlooWorks with status. Use to answer: "What jobs have I applied to?", "What\'s the status of my applications?".',
    schema: {},
    handler: async (): Promise<string> => {
      const apps = await getMyApplications();
      if (apps.length === 0) {
        return JSON.stringify({
          applications: [],
          hint: `No applications found. Check: ${WW_URLS.applications}`,
        });
      }
      return JSON.stringify(
        { applications: apps, total: apps.length },
        null,
        2
      );
    },
  },

  get_interview_schedule: {
    description:
      'Get your upcoming co-op interviews from WaterlooWorks. Returns interview date, time, type, and location. Use to answer: "Do I have any interviews?", "When is my next interview?".',
    schema: {},
    handler: async (): Promise<string> => {
      const interviews = await getInterviewSchedule();
      if (interviews.length === 0) {
        return JSON.stringify({
          interviews: [],
          hint: `No interviews found. Check: ${WW_URLS.interviews}`,
        });
      }
      return JSON.stringify(
        { interviews, total: interviews.length },
        null,
        2
      );
    },
  },

  get_ranking_status: {
    description:
      'Get your co-op ranking status from WaterlooWorks. Shows employers who have ranked you and the current status. Use to answer: "Have any employers ranked me?", "What\'s my ranking status?".',
    schema: {},
    handler: async (): Promise<string> => {
      const rankings = await getRankingStatus();
      if (rankings.length === 0) {
        return JSON.stringify({
          rankings: [],
          hint: `No rankings found. Check: ${WW_URLS.rankings}`,
        });
      }
      return JSON.stringify(
        { rankings, total: rankings.length },
        null,
        2
      );
    },
  },

  get_saved_jobs: {
    description:
      'Get your saved/watchlisted job postings from WaterlooWorks. Use to answer: "What jobs have I saved?", "Show my watchlist".',
    schema: {},
    handler: async (): Promise<string> => {
      const saved = await getSavedJobs();
      if (saved.length === 0) {
        return JSON.stringify({
          savedJobs: [],
          hint: `No saved jobs found. Check: ${WW_URLS.savedJobs}`,
        });
      }
      return JSON.stringify(
        { savedJobs: saved, total: saved.length },
        null,
        2
      );
    },
  },
};
