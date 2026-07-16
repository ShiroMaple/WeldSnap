# AGENTS.md — WeldSnap

## Project identity

Petrochemical weld-joint photo recording system (管道焊口工序照片录入系统). Scans QR codes on pipelines, lets field workers photograph 3 welding stages (组对/打底/盖面), auto-names and archives photos locally. V2.0 migrated from vanilla Express to Next.js App Router with Tailwind CSS v4 (IBM Carbon Design tokens).

## Critical runtime constraint

All `node:sqlite` usage **requires** `--experimental-sqlite` flag. Commands:
- `pnpm dev` — uses `cross-env NODE_OPTIONS=--experimental-sqlite next dev`
- `pnpm start` — uses `node --experimental-sqlite .next/standalone/server.js`
- Production deploy (PM2): `--node-args="--experimental-sqlite"`

Without this flag, `DatabaseSync` import crashes immediately.

## Commands

| What | Command |
|------|---------|
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Production start | `pnpm start` |
| Lint | `pnpm lint` |
| No test suite | — |

There is no test framework configured. No `test` script in package.json.

## Architecture

**Dual-server legacy**: The repo contains both:
- `server.js` — legacy Express v1.0 server (still present, may still be used in some deploy paths)
- `src/app/` — Next.js App Router v2.0 (the active codebase for new features)

Prefer `src/app/api/` routes over `server.js` for any new API work.

### Key paths

- `src/app/api/` — Next.js API route handlers (auth, admin, upload, welds, photo)
- `src/app/` — App Router pages (login, admin, upload, qrcodes-print)
- `src/lib/db.js` — SQLite wrapper (DatabaseSync, schema init, all DB queries)
- `src/lib/oss.js` — Alibaba Cloud OSS client singleton (lazy-loaded)
- `src/lib/env.js` — Centralized env var validation (throws on startup if OSS vars missing)
- `src/lib/session.js` — AES-256-GCM cookie session (custom, no express-session)
- `src/lib/logger.js` — Pino (dev: pretty stdout; prod: roll to logs/)
- `src/lib/trace.js` — AsyncLocalStorage trace context (traceId, pipeline_no, uploaded_by)
- `src/middleware/auth.js` — `requireAuth()` / `requireAdmin()` guards (throw AuthError)
- `src/services/upload.service.js` — OSS presigned URL generation + upload confirmation
- `src/components/` — React components (OSSFileTree, PipelineTree, StatsBar, WeldMatrix)
- `db.js` — Legacy V1.0 DB module (still present, same schema)
- `config.json` — Runtime config (exportRoot, port). Gitignored.
- `data/app.db` — SQLite database. Gitignored.

### Database

SQLite via `node:sqlite` (DatabaseSync). WAL mode enabled. Two tables:
- `weld_records` — pipeline_no + weld_no unique constraint, photo_* columns store relative OSS keys or local paths
- `users` — roles: `admin` / `worker`. Default admin: `admin / admin123`

Reset: delete `data/app.db`, restart.

### Photo storage

V2.0 uses **Alibaba Cloud OSS** with presigned URL client-side upload. Photos stored as Object Keys under `projects/{project}_{construction}/{pipeline}/{weld}/{pipeline}-{weld}-{type}.jpg`. The `photo_*` DB columns store the OSS Object Key (not local paths).

V1.0 `server.js` used local filesystem under `exports/`. The OSS path is the current approach.

### Environment setup

Copy `.env.example` to `.env.local` and fill OSS credentials:
```
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_BUCKET=weldsnap-photos
OSS_REGION=oss-cn-shanghai
OSS_ENDPOINT=https://oss-cn-shanghai.aliyuncs.com
SESSION_SECRET=<change-this>
```

`env.js` validates all `OSS_*` vars at startup — missing any will crash the server immediately.

### Design system

IBM Carbon Design System via Tailwind CSS v4. Hard constraints defined in `src/app/globals.css`:
- `border-radius: 0px` (no rounded corners)
- `box-shadow: none` (depth via background color layering)
- Font weights: 300 / 400 / 600 only (no 700 Bold)
- Only interactive color: IBM Blue 60 (`#0f62fe`)
- Fonts: IBM Plex Sans (body) + IBM Plex Mono (code/paths), loaded via `next/font/google`

## Platform gotchas

- **Windows**: `output: 'standalone'` is disabled in `next.config.mjs` (symlink EPERM). Only the Linux deploy path uses standalone output.
- **Node version**: Production requires Node.js v22+ for `node:sqlite`. Deploy workflow pins `/opt/node-v22/bin/node`.
- **Deploy**: GitHub Actions self-hosted runner, rsync to `/var/www/WeldSnap/`, PM2 process manager. Deploy excludes `data/`, `exports/`, `node_modules/`, `config.json`.

## Conventions

- All DB queries use `DatabaseSync` synchronous API (not async `Database`)
- File upload limit: 30MB (`multer` in server.js, check Next.js API route limits)
- Session cookie: `weld_session`, HttpOnly, SameSite=Lax, 12h TTL
- Photo type keys: `zudui` / `dadi` / `gaimian` (Chinese: 组对 / 打底 / 盖面)
- API routes return `{ success: boolean, error?: string, ...data }` envelope
- Path alias: `@/*` → `./src/*` (jsconfig.json)
