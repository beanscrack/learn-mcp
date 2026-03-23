#!/usr/bin/env node
/**
 * UWaterloo LEARN auth CLI
 *
 * Run this FIRST before starting the MCP server:
 *   npm run auth
 *
 * A browser window will open. Complete the UWaterloo ADFS login and
 * approve the Duo MFA push. The session will be cached so the MCP
 * server can run headless on subsequent starts.
 *
 * If D2L_USERNAME and D2L_PASSWORD are set in .env, the username and
 * password fields will be pre-filled — you still need to approve Duo.
 */
import "dotenv/config";
import { getToken, getTokenExpiry } from "./auth.js";

async function main(): Promise<void> {
  const hasCredentials = !!(process.env.D2L_USERNAME && process.env.D2L_PASSWORD);

  console.log("=== UWaterloo LEARN — Authentication ===");
  console.log("");

  if (hasCredentials) {
    console.log("Credentials found (D2L_USERNAME / D2L_PASSWORD).");
    console.log("Username and password will be pre-filled automatically.");
    console.log("You will still need to approve the Duo MFA push.");
  } else {
    console.log("No credentials configured.");
    console.log("A browser window will open — log in to UWaterloo ADFS");
    console.log("and approve the Duo MFA push.");
    console.log("");
    console.log(
      "Tip: Set D2L_USERNAME and D2L_PASSWORD in .env to pre-fill the form."
    );
  }

  console.log("");
  console.log("Starting browser...");

  try {
    const token = await getToken();
    const expiry = new Date(getTokenExpiry());

    console.log("");
    console.log("✓ Authentication successful!");
    console.log(`  Session cached at: ${process.env.SESSION_DIR || "~/.learn-session"}`);
    console.log(`  Token expires at:  ${expiry.toLocaleString()}`);
    console.log(`  Token preview:     ${token.substring(0, 40)}...`);
    console.log("");
    console.log("The MCP server will reuse this session automatically.");
    console.log("Run 'npm start' to start the server.");
  } catch (err) {
    console.error("");
    console.error("✗ Authentication failed:");
    console.error(" ", err instanceof Error ? err.message : String(err));
    console.error("");
    console.error("Troubleshooting:");
    console.error("  1. Make sure D2L_BASE_URL in .env points to learn.uwaterloo.ca");
    console.error("  2. Complete the Duo MFA push within the timeout window");
    console.error("  3. Check that your UWaterloo credentials are correct");
    process.exit(1);
  }
}

main();
