# Create or update AGENTS.md for OpenCode sessions (fork #1)

> [!WARNING]
> 本文档是 V1 或迁移过程中的历史资料，不是当前运行规范。当前实现以 `src/`、`package.json` 和 `.github/workflows/deploy.yml` 为准；其中旧的 Express、本地 `exports/`、旧会话或旧 OSS 路径说明仅供追溯。


**Session ID:** ses_09292bb54ffeL048VR8o1VT8J6
**Created:** 2026/7/17 08:15:05
**Updated:** 2026/7/17 08:15:30

---

## User

Create or update `AGENTS.md` for this repository.

The goal is a compact instruction file that helps future OpenCode sessions avoid mistakes and ramp up quickly. Every line should answer: "Would an agent likely miss this without help?" If not, leave it out.

User-provided focus or constraints (honor these):


## How to investigate

Read the highest-value sources first:
- `README*`, root manifests, workspace config, lockfiles
- build, test, lint, formatter, typecheck, and codegen config
- CI workflows and pre-commit / task runner config
- existing instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.cursorrules`, `.github/copilot-instructions.md`)
- repo-local OpenCode config such as `opencode.json`

If architecture is still unclear after reading config and docs, inspect a small number of representative code files to find the real entrypoints, package boundaries, and execution flow. Prefer reading the files that explain how the system is wired together over random leaf files.

Prefer executable sources of truth over prose. If docs conflict with config or scripts, trust the executable source and only keep what you can verify.

## What to extract

Look for the highest-signal facts for an agent working in this repo:
- exact developer commands, especially non-obvious ones
- how to run a single test, a single package, or a focused verification step
- required command order when it matters, such as `lint -> typecheck -> test`
- monorepo or multi-package boundaries, ownership of major directories, and the real app/library entrypoints
- framework or toolchain quirks: generated code, migrations, codegen, build artifacts, special env loading, dev servers, infra deploy flow
- repo-specific style or workflow conventions that differ from defaults
- testing quirks: fixtures, integration test prerequisites, snapshot workflows, required services, flaky or expensive suites
- important constraints from existing instruction files worth preserving

Good `AGENTS.md` content is usually hard-earned context that took reading multiple files to infer.

## Questions

Only ask the user questions if the repo cannot answer something important. Use the `question` tool for one short batch at most.

Good questions:
- undocumented team conventions
- branch / PR / release expectations
- missing setup or test prerequisites that are known but not written down

Do not ask about anything the repo already makes clear.

## Writing rules

Include only high-signal, repo-specific guidance such as:
- exact commands and shortcuts the agent would otherwise guess wrong
- architecture notes that are not obvious from filenames
- conventions that differ from language or framework defaults
- setup requirements, environment quirks, and operational gotchas
- references to existing instruction sources that matter

Exclude:
- generic software advice
- long tutorials or exhaustive file trees
- obvious language conventions
- speculative claims or anything you could not verify
- content better stored in another file referenced via `opencode.json` `instructions`

When in doubt, omit.

Prefer short sections and bullets. If the repo is simple, keep the file simple. If the repo is large, summarize the few structural facts that actually change how an agent should work.

If `AGENTS.md` already exists at `C:\Users\gaoft\Documents\CodeSpace\WeldSnap`, improve it in place rather than rewriting blindly. Preserve verified useful guidance, delete fluff or stale claims, and reconcile it with the current codebase.

---

## Assistant (Build · MiMo Auto · 9.7s)

_Thinking:_

Let me investigate the repository to understand its structure and create an appropriate AGENTS.md file.

**Tool: read**

**Tool: glob**

**Tool: glob**

**Tool: glob**

**Tool: glob**

---

## Assistant (Build · MiMo Auto · 8.5s)

_Thinking:_

Let me read the key configuration files to understand the project.

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

---

## Assistant (Build · MiMo Auto · 18.9s)

_Thinking:_

Let me also look at the src directory, .env.example, and the GitHub workflows to understand the project better.

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

---

## Assistant (Build · MiMo Auto · 4.0s)

_Thinking:_

Let me look at the src directory structure more closely and check for any existing instruction files or CI workflows.

**Tool: read**

**Tool: glob**

**Tool: glob**

**Tool: glob**

**Tool: glob**

---

## Assistant (Build · MiMo Auto · 5.2s)

_Thinking:_

Let me look at the deploy workflow and a few more source files to understand the project architecture.

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

---

## Assistant (Build · MiMo Auto · 6.0s)

_Thinking:_

Let me look at a few more key files to understand the architecture better.

**Tool: read**

**Tool: read**

**Tool: read**

**Tool: read**

---

## Assistant (Build · MiMo Auto · 4.8s)

_Thinking:_

Let me check the .mimocode directory and any existing instruction files.

**Tool: read**

**Tool: read**

**Tool: read**

---

## Assistant (Build · MiMo Auto · 24.6s)

_Thinking:_

Now I have a good understanding of the project. Let me summarize:

## Project Overview
WeldSnap is a **pipeline weld joint photo recording system** (管道焊口工序照片录入系统) used in petrochemical maintenance sites. It allows workers to scan QR codes, select weld joints, and take photos of 3 process stages (assembly/root pass/cover pass).

## Key Architecture Facts

1. **Dual architecture**: The project has both:
   - **V1 (Legacy)**: `server.js` + `db.js` at root - Express.js standalone server with vanilla HTML frontend in `public/`
   - **V2 (Current)**: `src/` directory - Next.js 15 App Router with React components

2. **Database**: SQLite via `node:sqlite` (Node.js v22+ built-in, experimental flag required)
   - `--experimental-sqlite` flag is mandatory
   - Database stored at `data/app.db`
   - WAL journal mode

3. **Package manager**: pnpm

4. **Key commands**:
   - `pnpm dev` - Development (Next.js)
   - `pnpm build` - Production build
   - `pnpm start` - Production (standalone server.js)
   - `pnpm lint` - ESLint

5. **Deployment**: Self-hosted via GitHub Actions, PM2 process manager, rsync to `/var/www/WeldSnap`

6. **Fonts**: IBM Plex Sans + IBM Plex Mono via Google Fonts

7. **CSS**: Tailwind CSS v4 with PostCSS

8. **Storage options**: Local disk (default) or Alibaba Cloud OSS

9. **Photo types**: 组对 (zudui/assembly), 打底 (dadi/root pass), 盖面 (gaimian/cover pass)

10. **Export structure**: `{exportRoot}/{project}_{construction}_{projectNo}/{pipelineNo}/{weldNo}/{pipelineNo}-{weldNo}-{type}.jpg`

Let me create the AGENTS.md file now.

Now I have a thorough understanding of the project. Let me create the `AGENTS.md` file.

**Tool: write**

---

## Assistant (Build · MiMo Auto · 8.1s)

_Thinking:_

Done. Let me verify the file was created correctly.

Created `AGENTS.md`. It covers:

- **Exact commands** — `pnpm dev/build/start/lint` with the `--experimental-sqlite` flag requirement
- **Dual-stack architecture** — the V1 Express + V2 Next.js coexistence that would confuse an agent
- **Database** — `node:sqlite` `DatabaseSync`, WAL mode, reset procedure
- **Deployment** — GitHub Actions → PM2 flow with exclusion list
- **Key conventions** — photo types, export paths, fuzzy Excel column matching, roles
- **Gotchas** — the `start` script trap (standalone vs root server.js), Windows standalone skip, hardcoded session secret, overwrite restrictions

---

## User

用中文说明一下你的发现

---

## Assistant (Build · MiMo Auto · 18.4s)

_Thinking:_

The user wants me to explain my findings about the repository in Chinese. Let me summarize what I discovered about the WeldSnap project.

## 项目分析总结

**WeldSnap** 是一个石化大修现场的焊口工序照片录入系统，用于记录管道焊口的三道工序照片（组对/打底/盖面）。

### 关键发现

**双架构共存** — 这是最容易踩坑的点：
- `server.js` + `db.js`（根目录）：V1 Express 原始服务器，生产环境 PM2 实际运行的是这个
- `src/`：V2 Next.js App Router 开发层，是新功能的开发入口
- `pnpm start` 启动的是 `.next/standalone/server.js`（Next.js 打包产物），不是根目录的 `server.js`

**Node.js 22+ 硬依赖**：
- 使用了 `node:sqlite` 的 `DatabaseSync` 类，必须加 `--experimental-sqlite` 启动参数
- package.json 里的 `cross-env NODE_OPTIONS=--experimental-sqlite` 已经帮你配好了，但不能直接跑 `next dev`

**部署流程**：
- GitHub Actions 推送到 `main` 分支触发
- rsync 同步到 `/var/www/WeldSnap`，排除了 `data/`、`exports/`、`node_modules/`、`config.json`
- PM2 守护进程重启，指定 Node v22 路径

**数据库**：
- SQLite 文件在 `data/app.db`，WAL 模式
- 两张表：`weld_records`（焊口记录）和 `users`（用户）
- 重置只需删除 `data/app.db` 再重启

**几个值得注意的细节**：
- Windows 下 `next.config.mjs` 跳过 `standalone` 输出（符号链接权限问题）
- 照片覆盖需要管理员权限，普通工人只能上传空位
- Excel 导入的列名是模糊匹配的，不要求完全一致
- Session secret 在 V1 里是硬编码的，V2 通过 `.env` 的 `SESSION_SECRET` 覆盖

---

## User

请阅读C:\Users\gaoft\Documents\CodeSpace\WeldSnap\docs\devLogs中的几篇文档，了解最新开发进度

---

## Assistant (Build · MiMo Auto · 3.8s)

_Thinking:_

The user wants me to read the dev logs in the docs directory to understand the latest development progress.

**Tool: read**

---

## Assistant (Build · MiMo Auto · 5.7s)

_Thinking:_

Let me read these three dev log files to understand the latest development progress.

**Tool: read**

**Tool: read**

**Tool: read**

---

## Assistant (Build · MiMo Auto · 4.8s)

_Thinking:_

Let me also read the rest of the chat log that was truncated.

**Tool: read**

---

## Assistant (Build · MiMo Auto · 27.9s)

_Thinking:_

Now I have a comprehensive understanding of the project's development history. Let me summarize the findings in Chinese as the user requested.

The three dev logs document:

1. **ChatLog_Analyzing WeldSnap UI Aesthetics.md** - A long conversation log covering:
   - UI bug fix (CSS conflict where Tailwind v4's cascade layers were being overridden by unlayered CSS reset)
   - Database encoding fix (Mojibake/garbled Chinese characters)
   - Security fix for `/api/upload/sign` endpoint
   - LAN access configuration
   - Anonymous/easy login system with device fingerprinting
   - Member management enhancements (auto-purge inactive accounts, admin editing)
   - Photo rejection/re-upload workflow
   - Major architectural refactor: project → pipeline → weld three-level hierarchy
   - Flat OSS storage keys (no more semantic directories)
   - Client-side ZIP download (zero server load)
   - QR code print optimization with pagination

2. **walkthrough_WeldSnap V2.0 关系型项目层级重构.md** - The relational project hierarchy refactor, which established the core data model with three interconnected levels (projects, pipelines, and welds) along with the UI controls for managing this structure.

3. **walkthrough_WeldSnap V2.0 修复与新特性实现.md** - Fixes and new features including the CSS reset removal, Mojibake encoding fix, and other enhancements.

## 三篇开发日志的核心发现

读完了 `docs/devLogs/` 下的三篇文档，以下是关键信息：

### 当前开发阶段

项目已完成 **V2.0 关系型重构**，处于收尾阶段。具体来说：

**已完成的工作：**
- 三层数据架构重构：`projects` → `pipelines` → `weld_records`，带级联外键和 UUID
- 管理控制台：项目列表、面包屑导航、管线树 + 焊口矩阵
- 简易登录系统：基于设备指纹（`crypto.randomUUID()` + LocalStorage）的免注册登录，重名自动加 `#0001` 后缀
- 照片驳回/重传流程：管理员标记不合格后工人端显示红色高亮 + 历史对比图
- 客户端 ZIP 批量下载：`jszip` + `file-saver`，零服务器负载
- 二维码打印：CSS 分页防切断
- OSS 存储扁平化：`projects/{project_uuid}/{weld_uuid}_{工序}.jpg`
- 成员管理：3个月未登录自动销号、管理员编辑权限

**尚未完成的工作（日志末尾提到）：**
1. **CI/CD 部署脚本升级** — 当前 `deploy.yml` 仍用 V1 的 `pm2 start server.js`，需要改为 Next.js standalone 部署流程
2. **端到端集成验证** — 全链路业务闭环测试（Excel 导入 → QR 码 → 手机直传 OSS → 数据库确认 → 管理台预览）

### 关键技术决策

- **照片驳回机制**：用 `REJECTED:` 前缀标记，不改数据库 Schema，保留历史路径可追溯
- **SQLite 并发**：针对 Next.js 并行路由构建的锁冲突，实现了重试退避机制（100ms × 5 次）
- **CSS 崩坏修复**：移除 Tailwind v4 中 Unlayered Reset 与 Cascade Layers 冲突的 `*` 选择器
- **匿名账户安全**：密码用 `crypto.randomBytes(32)` 生成，仅注册时写入，后续通过 Session 签发

### 一个值得注意的细节

日志中有一处乱码 Bug 的字节级分析——GBK 编码的"张师傅"被 UTF-8 解码后变成 `ʦ`（`\uFFFD\uFFFD\u02A6\uFFFD\uFFFD`），这类编码问题在处理中文 Excel 导入时需要特别注意。

---

## User

先根据这些信息更新@AGENTS.md 使用中文

---

## Assistant (Build · MiMo Auto · 7.0s)

_Thinking:_

The user wants me to update AGENTS.md based on the information I gathered from the dev logs. Let me read the current AGENTS.md first, then update it with the new information I learned from the dev logs.

Key new information from the dev logs:
1. Three-level hierarchy: projects → pipelines → weld_records (with UUID, foreign keys)
2. Anonymous/easy login system with device fingerprinting (crypto.randomUUID() + LocalStorage)
3. Photo rejection workflow (REJECTED: prefix)
4. SQLite concurrent locking with retry mechanism
5. Flat OSS storage keys (projects/{project_uuid}/{weld_uuid}_{type}.jpg)


6. Client-side ZIP download using jszip and file-saver
7. QR code printing with CSS pagination
8. Member management with auto-purge for accounts inactive over 3 months
9. CSS cascade layers conflict that was resolved by removing unlayered resets
10. GBK encoding issues when processing Chinese characters
11. Dev server configured to listen on 0.0.0.0 for local network access

Now I'll update AGENTS.md with all this new information.

**Tool: read**

---

## Assistant (Build · MiMo Auto · 32.8s)

_Thinking:_

Now I need to update AGENTS.md with the new information from the dev logs. Key additions:

1. Three-level hierarchy: projects → pipelines → weld_records (with UUID, foreign keys)
2. Anonymous/easy login system with device fingerprinting
3. Photo rejection workflow (REJECTED: prefix)
4. SQLite concurrent locking with retry mechanism
5. Flat OSS storage keys
6. Client-side ZIP download
7. CSS cascade layers gotcha
8. GBK encoding issue with Chinese characters
9. Dev server on 0.0.0.0 for LAN
10. Member management with auto-purge

I'll rewrite it in Chinese as requested.

**Tool: write**

---

## Assistant (Build · MiMo Auto · 14.9s)

_Thinking:_

Done. I've updated AGENTS.md with all the new information from the dev logs. The file is now in Chinese and includes:

1. Three-level hierarchy (projects → pipelines → weld_records)
2. Anonymous/easy login system with device fingerprinting
3. Photo rejection workflow (REJECTED: prefix)
4. SQLite concurrent locking with retry mechanism
5. Flat OSS storage keys
6. Client-side ZIP download
7. CSS cascade layers gotcha
8. GBK encoding issue with Chinese characters
9. Dev server on 0.0.0.0 for LAN
10. Member management with auto-purge (3 months)
11. Batch delete with fusion safeguard
12. QR code print pagination

The file is now much more comprehensive and accurately reflects the current state of the project.

已更新 `AGENTS.md`，新增了从开发日志中提取的关键信息：

- **三层数据架构**：projects → pipelines → weld_records 的外键关系和联合约束
- **简易登录系统**：设备指纹 + 自动注册 + `#0001` 重名后缀
- **照片驳回/重传**：`REJECTED:` 前缀标记机制
- **SQLite 并发处理**：重试退避机制（100ms × 5 次）
- **OSS 存储扁平化**：`projects/{project_uuid}/{weld_uuid}_{工序}.jpg`
- **客户端批量下载**：jszip + file-saver 零服务器负载
- **Tailwind v4 CSS 坍缩层陷阱**：禁止添加 Unlayered `*` 重置
- **中文编码问题**：GBK/UTF-8 解码导致的乱码
- **开发端口绑定**：`-H 0.0.0.0` 局域网访问
- **批量删除熔断**：含照片记录的条目需管理员确认
- **二维码打印分页**：`page-break-inside: avoid`
- **成员自动清理**：3 个月未登录的简易账户

---

## User

完成CI/CD 部署脚本升级，改为 Next.js standalone 部署流程

---

## Assistant (Build · MiMo Auto · 8.9s)

_Thinking:_

The user wants me to upgrade the CI/CD deployment script to use Next.js standalone deployment instead of the current V1 Express server deployment. Let me first read the current deploy.yml and understand the current state, then plan the upgrade.

Let me read the current deploy.yml and understand the project's deployment setup.

**Tool: read**

**Tool: read**

**Tool: read**

---

## Assistant (Build · MiMo Auto · 9.4s)

_Thinking:_

Now I understand the current state. The deploy.yml is still running the V1 Express server (`server.js`) via PM2, but the project has migrated to Next.js V2.0. I need to upgrade the deployment workflow to:

1. Run `pnpm build` to generate the Next.js standalone output
2. Copy the necessary static assets to the standalone directory
3. Run the Next.js standalone server instead of the Express server

Key things to consider:
- The `next.config.mjs` already outputs `standalone` on non-Windows platforms
- The `pnpm start` script is already configured to run `node --experimental-sqlite .next/standalone/server.js`


- I need to preserve the `data/` and `exports/` directories across deployments, and the PM2 process should reference the Next.js standalone server instead of the Express one
- The standalone output bundles everything into `.next/standalone/`, but I'll need to copy over the `public/` and `.next/static/` directories since Next.js doesn't include those in the standalone build
- I should check what's currently in the public directory to understand what needs to be copied

**Tool: read**

**Tool: read**

---

## Assistant (Build · MiMo Auto · 16.9s)

_Thinking:_

Now I have a clear picture. The current deploy.yml is running the V1 Express server (`server.js`), but the project has migrated to Next.js V2.0. I need to upgrade the deployment workflow to:

1. Run `pnpm build` to generate the Next.js standalone output
2. Copy the necessary static assets (`public/` and `.next/static/`) to the standalone directory
3. Run the Next.js standalone server instead of the Express server
4. Preserve `data/` and `exports/` directories

Key considerations:
- The standalone output goes to `.next/standalone/`


- I need to copy `public/` to `.next/standalone/public/` and `.next/static/` to `.next/standalone/.next/static/`
- The PM2 process should run `node --experimental-sqlite .next/standalone/server.js`
- `data/` and `exports/` directories need to persist across deployments
- The `RUNNER_TRACKING_ID` env var is critical to prevent GitHub Actions from killing PM2 processes

Now I'm writing the updated deploy.yml...

**Tool: write**

---

## Assistant (Build · MiMo Auto · 14.1s)

_Thinking:_

Wait, I need to reconsider. The current setup is still running `server.js` (the V1 Express server). But the project has migrated to Next.js V2.0. The `pnpm start` script runs `node --experimental-sqlite .next/standalone/server.js`, which is the Next.js standalone server.

However, I notice that the current production deployment still uses `server.js` (the Express server). This is because the V1 Express server is still present and may be used in production. But the user wants to upgrade to Next.js standalone deployment.

Let me reconsider the approach:

1. The `pnpm build` command will generate the standalone output in `.next/standalone/`


2. The standalone directory contains `server.js` (Next.js server) and the bundled application
3. I need to copy `public/` and `.next/static/` to the standalone directory
4. The PM2 process should run the Next.js standalone server

The real issue is that the workflow is currently running the root `server.js` (Express), but it should be running the Next.js standalone server instead. I need to clarify which server file PM2 should actually be executing. I see the issue now—the workflow is currently running the root `server.js` (V1 Express) via PM2, but it should be running the Next.js standalone server instead. I need to update the PM2 command to point to `.next/standalone/server.js` and make sure the static assets are properly copied to the standalone directory.

Wait, I need to fix the PM2 command — it should run the Next.js standalone server, not the root Express server.

**Tool: edit**

---

## Assistant (Build · MiMo Auto · 4.5s)

_Thinking:_

Now let me verify the final state of the deploy.yml.

**Tool: read**

---

## Assistant (Build · MiMo Auto · 7.8s)

_Thinking:_

The deploy.yml looks good now. Let me also update AGENTS.md to reflect the new deployment flow.

Now update AGENTS.md to reflect the new deployment flow.

**Tool: edit**

---

## Assistant (Build · MiMo Auto · 10.4s)

_Thinking:_

Done. Let me summarize what I changed.

已完成 CI/CD 部署脚本升级，主要变更：

### deploy.yml 改动

| 步骤 | 旧版 | 新版 |
|------|------|------|
| Node.js | 未显式设置 | 显式 `actions/setup-node@v4` + Node 22 |
| pnpm | 未显式设置 | `pnpm/action-setup@v4` |
| 构建 | 无（直接 rsync 源码） | `pnpm install` → `pnpm build` 生成 standalone |
| 静态资源 | 未处理 | 复制 `public/` 和 `.next/static/` 到 standalone 目录 |
| PM2 入口 | `server.js`（V1 Express） | `.next/standalone/server.js`（Next.js standalone） |
| 排除项 | 无 `.next/cache` | 新增 `.next/cache` 排除 |

### 关键点

- **构建产物**：`pnpm build` 在 CI 环境（Linux）自动输出 `standalone` 格式，`next.config.mjs` 中的平台判断会生效
- **静态资源**：Next.js standalone 不自动包含 `public/` 和 `.next/static/`，需要手动复制
- **持久化**：`data/` 和 `exports/` 目录在 rsync 中被排除，部署后确保目录存在
- **PM2 入口**：从根目录的 `server.js` 切换到 `.next/standalone/server.js`，这是 Next.js V2.0 的正确入口

---

## User

Hi

---

## Assistant (Build · MiMo Auto · 1.2s)

---

