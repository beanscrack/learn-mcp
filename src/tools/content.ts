import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Download, Page } from "playwright";
import { client } from "../client.js";
import {
  marshalToc,
  marshalTopic,
  marshalContentModules,
  marshalContentModule,
  type RawTocModule,
  type RawTopic,
  type RawContentModule,
} from "../utils/marshal.js";
import { toolHandler } from "../utils/mcp.js";

function requireOrgUnitId(provided?: number): number {
  const id =
    provided ??
    (process.env.D2L_COURSE_ID ? parseInt(process.env.D2L_COURSE_ID) : undefined);
  if (!id)
    throw new Error(
      "orgUnitId is required. Provide it or set D2L_COURSE_ID in .env"
    );
  return id;
}

/**
 * D2L "enforced" content URLs fire a browser download event on navigation.
 */
export async function captureEnforcedContentDownload(
  page: Page,
  url: string,
  options?: { timeout?: number }
): Promise<Download> {
  const timeout = options?.timeout ?? 60_000;
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout }),
    page.goto(url, { waitUntil: "domcontentloaded", timeout }),
  ]);
  return download;
}

export function registerContentTools(server: McpServer) {
  server.tool(
    "get_course_content",
    "Get the complete course structure including all modules, topics, and learning materials.",
    {
      orgUnitId: z.number().optional().describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
    },
    toolHandler("get_course_content", async ({ orgUnitId }) => {
      const toc = (await client.getContentToc(
        requireOrgUnitId(orgUnitId)
      )) as { Modules: RawTocModule[] };
      return JSON.stringify(marshalToc(toc), null, 2);
    })
  );

  server.tool(
    "get_course_modules",
    "Get the top-level modules/sections of a course. Returns names and ModuleIds.",
    {
      orgUnitId: z.number().optional().describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
    },
    toolHandler("get_course_modules", async ({ orgUnitId }) => {
      const modules = (await client.getContentModules(
        requireOrgUnitId(orgUnitId)
      )) as RawContentModule[];
      return JSON.stringify(marshalContentModules(modules), null, 2);
    })
  );

  server.tool(
    "get_course_module",
    "Get all contents within a specific module including child topics and sub-modules.",
    {
      orgUnitId: z.number().optional().describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
      moduleId: z.number().describe("The ModuleId from get_course_modules or get_course_content."),
    },
    toolHandler("get_course_module", async ({ orgUnitId, moduleId }) => {
      const structure = (await client.getContentModule(
        requireOrgUnitId(orgUnitId),
        moduleId
      )) as RawContentModule;
      return JSON.stringify(marshalContentModule(structure), null, 2);
    })
  );

  server.tool(
    "get_course_topic",
    "Get details about a specific course topic including title, description, and URL.",
    {
      orgUnitId: z.number().optional().describe("Course org unit ID. Optional if D2L_COURSE_ID is set."),
      topicId: z.number().describe("The TopicId from get_course_content."),
    },
    toolHandler("get_course_topic", async ({ orgUnitId, topicId }) => {
      const topic = (await client.getContentTopic(
        requireOrgUnitId(orgUnitId),
        topicId
      )) as RawTopic;
      return JSON.stringify(marshalTopic(topic), null, 2);
    })
  );
}
