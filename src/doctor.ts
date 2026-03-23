import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDbPath, getDb, closeDb } from './study/db.js';
import { SESSION_DIR } from './auth.js';

async function doctor() {
    console.error("[INFO] learn-mcp Doctor - Sanity Check\n");

    // 1. Node.js Version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    if (majorVersion >= 20) {
        console.error(`[OK] Node version: ${nodeVersion}`);
    } else {
        console.error(`[ERR] Node version: ${nodeVersion} (Required: >=20)`);
    }

    // 2. .env File
    const envPath = join(process.cwd(), '.env');
    if (existsSync(envPath)) {
        console.error("[OK] .env file found");
        const envContent = readFileSync(envPath, 'utf8');

        // 3. Required variables
        if (envContent.includes('D2L_BASE_URL=')) {
            console.error("[OK] D2L_BASE_URL is set");
        } else {
            console.error("[ERR] D2L_BASE_URL is missing in .env");
        }
    } else {
        console.error("[ERR] .env file missing (copy from .env.example)");
    }

    // 4. Build Check
    const distPath = join(process.cwd(), 'dist', 'index.js');
    if (existsSync(distPath)) {
        console.error("[OK] Build output found (dist/index.js)");
    } else {
        console.error("[ERR] Build output missing. Run 'npm run build' first.");
    }

    // 5. Paths and Database
    const sessionDir = SESSION_DIR;
    const dbPath = getDbPath();

    console.error(`\n[INFO] Paths:`);
    console.error(`   Session Dir: ${sessionDir}`);
    console.error(`   Database Path: ${dbPath}`);

    try {
        const db = getDb();
        db.prepare("SELECT 1").get();
        console.error("[OK] Database connection and schema verified");
        closeDb();
    } catch (err) {
        console.error(`[ERR] Database verification failed: ${err}`);
    }

    console.error("\nDone.");
}

doctor().catch(err => {
    console.error("Doctor failed:", err);
    process.exit(1);
});
