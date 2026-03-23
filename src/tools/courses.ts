import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toolHandler } from "../utils/mcp.js";

export function registerCourseTools(server: McpServer) {
    server.tool(
        "get_course_catalog_info",
        "Returns a direct link to the official UWaterloo undergraduate course catalog. Does NOT perform a live search — use the returned URL to look up courses manually.",
        {
            query: z.string().describe("Search term (e.g., 'CS 135', 'algorithms')"),
        },
        toolHandler("get_course_catalog_info", async ({ query }) => {
            return `You can search the official UWaterloo Undergraduate Calendar for '${query}' here: https://ugradcalendar.uwaterloo.ca/\n\nCommonly searched courses:\n- CS 135: Designing Functional Programs\n- CS 136: Elementary Algorithm Design & Data Abstraction\n- MATH 135: Algebra for Honours Mathematics\n- MATH 137: Calculus 1 for Honours Mathematics`;
        })
    );
}
