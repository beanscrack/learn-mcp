# Stack Research

**Domain:** TypeScript MCP server — D2L Brightspace REST API + Playwright ADFS auth + WaterlooWorks scraping + SQLite study tools
**Researched:** 2026-03-21
**Confidence:** HIGH (versions verified against npm registry 2026-03-21 via research agent)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@modelcontextprotocol/sdk` | `1.27.1` | MCP server + tool registration | Official SDK; dual transport (stdio + HTTP) built-in; reference uses 1.23.0, upgrade is safe |
| `playwright` | `1.58.2` | ADFS SSO auth + WaterlooWorks scraping | Only viable option for ADFS form capture and WaterlooWorks (no public API); headless + headed modes |
| `typescript` | `5.9.3` | Type safety across all modules | Same as McMaster reference; no reason to deviate |
| `zod` | `4.3.6` | Runtime validation of env vars and API responses | MCP SDK peer accepts `^3.25 \|\| ^4.0`; use v4 |
| `better-sqlite3` | `12.8.0` | Local SQLite storage with FTS5 | Synchronous API (cleaner than async sqlite3); native FTS5 support; supports Node 20–25; WAL mode |
| `express` | `4.22.1` | HTTP transport for MCP server | Stay on 4.x — Express 5 introduces async error handling changes; reference uses 4.x |
| `dotenv` | `17.3.1` | Environment variable loading | Standard; no alternatives needed |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pdf-parse` | `1.1.1` | Extract text from PDF notes | **Pin to 1.1.1** — v2 broke the API; used in notes_sync |
| `mammoth` | `1.12.0` | Extract text from .docx files | For notes_sync when slides are in Word format |
| `openai` | `6.32.0` | Optional semantic embeddings | Only needed if OPENAI_API_KEY is set; notes_embed_missing + semantic notes_search |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest` | `4.1.0` | Unit + integration testing | Requires Node `^20 \|\| ^22 \|\| >=24`; native ESM support |
| `tsx` | latest | TypeScript execution during development | Faster iteration than tsc + node |
| `@types/better-sqlite3` | latest | TypeScript types for better-sqlite3 | Required — package ships without types |
| `@types/express` | latest | TypeScript types for Express | Required |
| `@types/pdf-parse` | latest | TypeScript types for pdf-parse | Required |

## Installation

```bash
# Core
npm install @modelcontextprotocol/sdk@1.27.1 playwright@1.58.2 zod@4.3.6 better-sqlite3@12.8.0 express@4.22.1 dotenv@17.3.1

# Supporting
npm install pdf-parse@1.1.1 mammoth@1.12.0 openai@6.32.0

# Dev
npm install -D typescript@5.9.3 vitest@4.1.0 tsx @types/better-sqlite3 @types/express @types/pdf-parse @playwright/test
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true
  }
}
```

**Why ES2022 + NodeNext:** ESM `.js` imports resolve correctly with NodeNext. ES2020 (what McMaster uses) works but ES2022 enables top-level await and newer class features. Use `.js` extensions in imports even for `.ts` source files — this is required for NodeNext module resolution.

## UWaterloo-Specific Auth Notes

| Aspect | McMaster | UWaterloo |
|--------|----------|-----------|
| ADFS IdP | Microsoft Online (login.microsoftonline.com) | Shibboleth (`idp.uwaterloo.ca`) |
| Username selector | `input#i0116` | `input[name="j_username"]` |
| Password selector | `input#i0118` | `input[name="j_password"]` |
| MFA | Azure MFA | Duo Security |
| Session scope | LEARN only | LEARN + WaterlooWorks (shared) |
| Token capture | Intercept `Authorization: Bearer` on `/d2l/api/*` | Same pattern; same D2L Brightspace |

`isLoginPage()` in auth.ts must detect both `idp.uwaterloo.ca` and `learn.uwaterloo.ca` login pages.

## SQLite Pattern

```typescript
// WAL mode + FTS5 at DB init
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS note_sections_fts
  USING fts5(content, note_id UNINDEXED, tokenize='unicode61');
`);
```

- **WAL mode**: Required for concurrent read/write (MCP server may call tools while sync runs)
- **FTS5 with unicode61 tokenizer**: Handles accented characters in prof names and course titles
- **JSON blob embeddings**: Store OpenAI embeddings as `TEXT` column (JSON array), compute cosine similarity in JS — no vector extension needed

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `better-sqlite3` | `node-sqlite3` (async) | If async I/O is critical — but sync is cleaner for MCP tools |
| `better-sqlite3` | `Supabase` | If multi-device sync or team sharing is needed — explicitly out of scope |
| `playwright` | `puppeteer` | If only Chrome is needed and no headed Duo MFA — Playwright supports more browsers and has better stealth |
| `zod` v4 | `joi`, `yup` | Never — Zod is the TypeScript-native standard |
| `pdf-parse@1.1.1` | `pdfjs-dist` | If PDFs have complex layouts/forms — pdfjs-dist is heavier but more capable |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `sqlite3` (async) | Callback-based API creates unnecessary complexity in synchronous MCP tool handlers | `better-sqlite3` |
| `pdf-parse@^2.x` | v2 broke the extraction API; import changed | Pin to `pdf-parse@1.1.1` |
| `express@^5.x` | Async error handling changes break existing middleware patterns | `express@4.22.1` |
| `CommonJS` (`require`) | McMaster reference is ESM; NodeNext module resolution requires `.js` extensions in imports — mixing CJS creates resolution failures | ESM throughout |
| `Supabase` | External dependency, requires account/API key, overkill for single-user local storage | `better-sqlite3` |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@modelcontextprotocol/sdk@1.27.1` | `zod@^3.25 \|\| ^4.0` | MCP SDK peer dep; use zod v4 |
| `better-sqlite3@12.8.0` | Node 20–25 | Native module — requires `npm rebuild` after Node upgrade |
| `vitest@4.1.0` | Node `^20 \|\| ^22 \|\| >=24` | Don't use on Node 18 |
| `playwright@1.58.2` | Chromium bundled | Run `npx playwright install chromium` after install |

## Sources

- npm registry (2026-03-21) — version verification for all packages listed above
- McMaster a2l-mcp reference implementation (C:/Users/fortn/mcpmac/) — tsconfig, package.json, auth patterns
- UWaterloo ADFS/Shibboleth authentication pattern — training data (MEDIUM confidence; verify with real login during Phase 2)

---
*Stack research for: UWaterloo LEARN MCP server (uwlearn-mcp)*
*Researched: 2026-03-21*
