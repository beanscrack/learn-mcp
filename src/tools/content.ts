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
 * The download listener must be registered in the same turn as navigation,
 * or the event is missed. Use Promise.all([waitForEvent, goto]).
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

export const contentTools = {
  get_course_content: {
    description:
      "Get the complete course structure including all modules, topics, lectures, and learning materials. Returns module titles, descriptions, topic names with URLs. Use to answer: \"What's in this course?\", \"Show me the syllabus\", \"What topics are covered?\"",
    schema: {
      orgUnitId: z
        .number()
        .optional()
        .describe("Course org unit ID from get_my_courses. Optional if D2L_COURSE_ID is set."),
    },
    handler: async ({ orgUnitId }: { orgUnitId?: number }): Promise<string> => {
      const toc = (await client.getContentToc(
        requireOrgUnitId(orgUnitId)
      )) as { Modules: RawTocModule[] };
      return JSON.stringify(marshalToc(toc), null, 2);
    },
  },

  get_course_modules: {
    description:
      "Get the top-level modules/sections of a course. Returns module names, descriptions, and ModuleIds. Use for a high-level overview of course organization.",
    schema: {
      orgUnitId: z
        .number()
        .optional()
        .describe("Course org unit ID from get_my_courses. Optional if D2L_COURSE_ID is set."),
    },
    handler: async ({ orgUnitId }: { orgUnitId?: number }): Promise<string> => {
      const modules = (await client.getContentModules(
        requireOrgUnitId(orgUnitId)
      )) as RawContentModule[];
      return JSON.stringify(marshalContentModules(modules), null, 2);
    },
  },

  get_course_module: {
    description:
      "Get all contents within a specific module including child topics and sub-modules. Use to explore one section of the course in detail.",
    schema: {
      orgUnitId: z
        .number()
        .optional()
        .describe("Course org unit ID from get_my_courses. Optional if D2L_COURSE_ID is set."),
      moduleId: z
        .number()
        .describe("The ModuleId from get_course_modules or get_course_content."),
    },
    handler: async ({
      orgUnitId,
      moduleId,
    }: {
      orgUnitId?: number;
      moduleId: number;
    }): Promise<string> => {
      const structure = (await client.getContentModule(
        requireOrgUnitId(orgUnitId),
        moduleId
      )) as RawContentModule;
      return JSON.stringify(marshalContentModule(structure), null, 2);
    },
  },

  get_course_topic: {
    description:
      "Get details about a specific course topic including title, description, and URL. Use after get_course_content to get more info about a specific item.",
    schema: {
      orgUnitId: z
        .number()
        .optional()
        .describe("Course org unit ID from get_my_courses. Optional if D2L_COURSE_ID is set."),
      topicId: z
        .number()
        .describe("The TopicId from get_course_content."),
    },
    handler: async ({
      orgUnitId,
      topicId,
    }: {
      orgUnitId?: number;
      topicId: number;
    }): Promise<string> => {
      const topic = (await client.getContentTopic(
        requireOrgUnitId(orgUnitId),
        topicId
      )) as RawTopic;
      return JSON.stringify(marshalTopic(topic), null, 2);
    },
  },
};
