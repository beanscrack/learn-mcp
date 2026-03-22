import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

async function doctor() {
    console.error("🏥 learn-mcp Doctor - Sanity Check\n");

    // 1. Node.js Version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    if (majorVersion >= 20) {
        console.error(`✅ Node version: ${nodeVersion}`);
    } else {
        console.error(`❌ Node version: ${nodeVersion} (Required: >=20)`);
    }

    // 2. .env File
    const envPath = join(process.cwd(), '.env');
    if (existsSync(envPath)) {
        console.error("✅ .env file found");
        const envContent = readFileSync(envPath, 'utf8');

        // 3. Required variables
        if (envContent.includes('D2L_BASE_URL=')) {
            console.error("✅ D2L_BASE_URL is set");
        } else {
            console.error("❌ D2L_BASE_URL is missing in .env");
        }
    } else {
        console.error("❌ .env file missing (copy from .env.example)");
    }

    // 4. Paths
    const sessionDir = process.env.SESSION_DIR || join(homedir(), ".learn-session");
    const dbDir = process.env.DB_PATH ? join(process.cwd(), process.env.DB_PATH) : join(homedir(), ".learn-mcp");

    console.error(`\n📂 Paths:`);
    console.error(`   Session Dir: ${sessionDir}`);
    console.error(`   Database Path: ${dbDir}`);

    console.error("\nDone.");
}

doctor().catch(err => {
    console.error("Doctor failed:", err);
    process.exit(1);
});
