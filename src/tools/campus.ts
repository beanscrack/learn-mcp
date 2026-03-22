import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toolHandler } from "../utils/mcp.js";

const BUILDINGS: Record<string, { name: string; mapUrl: string; description: string }> = {
    MC: {
        name: "Mathematics & Computer Building",
        mapUrl: "https://uwaterloo.ca/map/MC",
        description: "Home to the Faculty of Mathematics, Computer Science, and the Math C&D. Known for its brutalist architecture."
    },
    DC: {
        name: "William G. Davis Computer Research Centre",
        mapUrl: "https://uwaterloo.ca/map/DC",
        description: "Contains the Davis Centre Library, a large food court, and many computer labs."
    },
    E7: {
        name: "Engineering 7",
        mapUrl: "https://uwaterloo.ca/map/E7",
        description: "Modern engineering building with the RoboHub, IDEAs clinic, and a bridge to E5."
    },
    SLC: {
        name: "Student Life Centre",
        mapUrl: "https://uwaterloo.ca/map/SLC",
        description: "The hub of student activity, containing the Turnkey Desk, food court, and club offices."
    },
    PAC: {
        name: "Physical Activities Complex",
        mapUrl: "https://uwaterloo.ca/map/PAC",
        description: "Main athletic facility, used for gym classes, varsity sports, and final exams."
    },
    HLTH: {
        name: "Health Expansion",
        mapUrl: "https://uwaterloo.ca/map/HLTH",
        description: "Newest health building focusing on health sciences research."
    },
    STC: {
        name: "Science Teaching Complex",
        mapUrl: "https://uwaterloo.ca/map/STC",
        description: "Central science building with many large lecture halls and the Science C&D."
    }
};

export function registerCampusTools(server: McpServer) {
    server.tool(
        "get_building_info",
        "Get information about a UWaterloo building by its code (e.g., MC, DC, E7)",
        {
            code: z.string().describe("The building code (e.g., 'MC', 'DC')"),
        },
        toolHandler("get_building_info", async ({ code }) => {
            const upperCode = code.toUpperCase();
            const building = BUILDINGS[upperCode];

            if (!building) {
                throw new Error(`Building code '${code}' not found. Try common codes like MC, DC, E7, SLC, or PAC.`);
            }

            return `Building: ${building.name}\nDescription: ${building.description}\nMap: ${building.mapUrl}`;
        })
    );
}
