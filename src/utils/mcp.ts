
/**
 * Formats a tool error as a structured JSON string with helpful hints.
 */
export function formatToolError(err: unknown): string {
    if (err instanceof Error) {
        const e = err as Error & {
            status?: number;
            isAuthError?: boolean;
            code?: string;
        };

        // Auth errors — 401/403 from D2L or auth timeout
        if (e.isAuthError || e.status === 401 || e.status === 403) {
            return JSON.stringify({
                error: "auth_error",
                message: e.message,
                hint: "Run 'npm run auth' to refresh your UWaterloo session",
            });
        }

        // Network errors
        const isNetworkError =
            e.code === "ECONNREFUSED" ||
            e.code === "ETIMEDOUT" ||
            e.code === "ENOTFOUND" ||
            e.code === "ECONNRESET" ||
            e.message.toLowerCase().includes("fetch failed") ||
            e.message.toLowerCase().includes("network") ||
            e.message.toLowerCase().includes("timed out");

        if (isNetworkError) {
            return JSON.stringify({
                error: "network_error",
                message: e.message,
                hint: "Check your internet connection and that UWaterloo services are reachable",
            });
        }

        if (e.status) {
            return JSON.stringify({
                error: "api_error",
                message: e.message,
                hint: `D2L returned HTTP ${e.status}`,
            });
        }

        return JSON.stringify({ error: "api_error", message: e.message });
    }
    return JSON.stringify({ error: "unknown_error", message: String(err) });
}

/**
 * Wraps a tool handler with logging and error normalization.
 */
export function toolHandler<A extends Record<string, unknown>>(
    name: string,
    handler: (args: A) => Promise<string>
) {
    return async (args: A) => {
        const t = Date.now();
        console.error(`[TOOL] ${name} start`);
        try {
            const text = await handler(args);
            console.error(`[TOOL] ${name} ok (${Date.now() - t}ms)`);
            return { content: [{ type: "text" as const, text }] };
        } catch (err) {
            console.error(`[TOOL] ${name} error (${Date.now() - t}ms)`, err);
            return {
                content: [{ type: "text" as const, text: formatToolError(err) }],
                isError: true,
            };
        }
    };
}
