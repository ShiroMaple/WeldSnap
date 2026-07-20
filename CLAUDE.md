# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

WeldSnap — 石化管道焊口工序照片录入系统。扫码定位管线号，手机拍摄三道工序（组对/打底/盖面）照片，自动命名归档到 OSS。V2.0 从 Express 迁移到 Next.js App Router + Tailwind CSS v4 + IBM Carbon Design System。详细的业务与架构说明见 `AGENTS.md`（与本文档保持一致，冲突时以 `AGENTS.md` 为准）。

## 常用命令

| 用途 | 命令 |
|------|------|
| 开发服务器（绑 0.0.0.0，局域网可访问） | `pnpm dev` |
| 生产构建 | `pnpm build` |
| 生产启动（运行 standalone 产物） | `pnpm start` |
| Lint | `pnpm lint` |
| 测试 | 无（项目未配置测试框架） |

**硬约束**：所有 `node:sqlite` 调用必须加 `--experimental-sqlite` 标志。`pnpm dev` / `pnpm build` / `pnpm start` 已在 `package.json` 的 `NODE_OPTIONS` 中配置——**不要直接运行** `next dev` / `next build` / 裸 `node` 启动，否则 `node:sqlite` 不可用。

数据重置：停止服务后删除 `data/app.db`，重启即自动重建 Schema。

## 架构

### 当前运行架构

- 根目录 V1 Express 入口已移除。生产环境运行 CI 解压后的 Next.js standalone `server.js`，照片存储使用阿里云 OSS。
- `src/app/` — **V2 Next.js App Router**，所有新功能与 API 的开发入口，使用阿里云 OSS 前端直传。

新 API 一律写到 `src/app/api/`。当前项目只维护 V2 的 `src/lib/db.js`。

### 关键模块（`src/lib/`）

- `db.js` — SQLite 封装。使用 **同步 `DatabaseSync` API**（非 async `Database`），WAL 模式，初始化内置 100ms×5 次重试退避以应对 Next.js 并行路由构建期的锁冲突。所有查询走这里。
- `session.js` — **自研 AES-256-GCM Cookie 会话**（非 express-session）。Cookie 名 `weld_session`，HttpOnly / SameSite=Lax，12h TTL。
- `logger.js` — Pino。开发 pretty stdout，生产滚动写入 `logs/`。
- `trace.js` — AsyncLocalStorage 链路追踪（traceId / pipeline_no / uploaded_by），经 `src/middleware/withTrace.js` 注入。
- `oss.js` — 阿里云 OSS 客户端，懒加载。
- `env.js` — 启动时校验所有 `OSS_*` 环境变量，**缺失任意一个立即崩溃**。

### 鉴权

`src/middleware/auth.js` 导出 `requireAuth()` / `requireAdmin()` 守卫，用于 `src/app/api/**/route.js`。

### 数据库 Schema

SQLite 三层关系（`node:sqlite` via DatabaseSync）：

```
projects (id, uuid, construction_no[全局唯一], project_name, status, prefix_*, created_at)
  └─ pipelines (id, uuid, project_id FK, pipeline_no)        -- 联合唯一 (project_id, pipeline_no)
       └─ weld_records (id, uuid, pipeline_id FK, weld_no,   -- 联合唯一 (pipeline_id, weld_no)
                        create_source, photo_*, uploaded_by, uploaded_at)
```

- `create_source` 区分"管理控制台创建" vs "现场创建"
- `photo_*` 列存的是 **OSS Object Key**（非本地路径），驳回时加 `REJECTED:` 前缀（预览接口自动剥离）
- Object Key 扁平化：`projects/{project_uuid}/{weld_uuid}_{工序}.jpg`，语义关联完全由外键维系，不靠 OSS 目录结构

### 照片类型键

`zudui` / `dadi` / `gaimian`（组对 / 打底 / 盖面）——贯穿前后端与 OSS Key，勿改。

### 照片上传链路（前端直传 + 预压缩）

手机端拍照后**不直传原图**：`src/lib/compress.js` 用 Canvas 等比缩放（上限 1920×1080）+ JPEG 0.8 质量，把 5–10MB 原图压到 500KB 以内。流程：前端先 `POST /api/upload/sign`（已加 `requireAuth`）拿 60s 短效 OSS 预签名 PUT URL → 浏览器直传 OSS → 成功后 `POST /api/upload/confirm` 回写数据库字段（仅存 Object Key，文件流不经 Next.js）。

### 现场自增前缀规则

项目可配置管线/焊口前缀。设了前缀则现场创建时自动递增补零：**管线 3 位**（`PL-001`）、**焊口 2 位**（`W-01`），短横线 `-` 分隔；无前缀则自由输入但不可重名。移动端现场创建的焊口在管理端 `WeldMatrix` 以 IBM Carbon 黄色微缩 Tag **"现场创建"** 高亮，提示管理员核对命名规范。

### 批量删除熔断

`POST /api/admin/records/bulk-delete`：被勾选项中**任意一条关联了已上传照片**即触发事务回滚、整体拦截，精确返回 `"⚠️ 在您勾选的 {total} 个条目中，有 {count} 个已包含照片记录..."`。仅系统管理员可在拦截后二次确认强行删除，其他角色无法绕过。

### 客户端批量下载

零服务器负载：前端调 `/api/project/export-manifest` 拿 OSS 预签名下载 URL 清单，浏览器用 `jszip` + `file-saver` 并发拉取并在客户端内存打包 ZIP，图片流不经 Next.js 中转。

### 简易登录（设备指纹）

施工人员免注册：前端 `crypto.randomUUID()` 生成设备 ID 存 LocalStorage，后端自动创建 `anon_{deviceId}` 账户并随机强密码。重名后缀用 **`#` 作分隔符 + 4 位数字**（如 `张师傅#0001`）。清浏览器缓存会丢设备 ID；简易账户 **90 天未登录自动销号**（在 `GET /api/admin/users` 加载列表时触发清理）；管理端对简易账户的用户名字段强制只读（disabled），防止改动唯一特征。

## 设计系统

IBM Carbon Design System via Tailwind CSS v4，硬约束写在 `src/app/globals.css`：

- `border-radius: 0px`（无圆角）
- `box-shadow: none`（深度靠背景色分层）
- 字重仅 300 / 400 / 600（**禁止 700 Bold**）
- 唯一交互色 IBM Blue 60 `#0f62fe`
- 字体 IBM Plex Sans（正文）+ IBM Plex Mono（代码/路径），`next/font/google` 加载

**Tailwind v4 坍缩陷阱**：不要在 `globals.css` 加 Unlayered 的 `*` 选择器重置（如 `*{margin:0;padding:0}`）。Tailwind v4 用 Cascade Layers，非 Layer 样式会无条件覆盖所有工具类导致布局坍缩——Preflight 已内置完整重置，无需再加。

## 开发约定

- DB 查询一律用同步 `DatabaseSync`，不要用 async `Database`
- API 返回格式统一：`{ success: boolean, error?: string, ...data }`
- 路径别名 `@/*` → `./src/*`（`jsconfig.json`）
- 文件上传限制 30MB
- 中文编码：Excel 导入可能遇 GBK 编码问题，注意字符集处理
- 批量删除熔断：含照片记录的条目会被拦截，需系统管理员确认才能强删
- 二维码打印页 CSS 用 `page-break-inside: avoid` 防止跨页切断

## 环境配置

复制 `.env.example` → `.env.local`，填 OSS 凭证（`OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` / `OSS_BUCKET` / `OSS_REGION` / `OSS_ENDPOINT`）与 `SESSION_SECRET`。`config.json`（运行时 `exportRoot` / `port`）与 `data/app.db` 均被 gitignore。

## 平台与部署

- **Windows 开发**：`next.config.mjs` 中 `output: 'standalone'` 在 Windows 下被禁用（symlink EPERM），仅 Linux 部署路径用 standalone。`serverExternalPackages` 排除 Pino / ali-oss / xlsx / qrcode 等以避免 Webpack 打包；webpack config 显式把 `node:` 协议模块外置。
- **Node 版本**：生产需 Node.js v22+（`node:sqlite` 依赖），部署脚本锁定 `/opt/node-v22/bin/node`。
- **部署**：`.github/workflows/deploy.yml` 在 `ubuntu-latest` 上使用 Node.js 22 构建 standalone 产物，手动复制 `public/` 与 `.next/static/`，通过 SCP/SSH 发布到 `/var/www/WeldSnap/`，再由 PM2 运行解压后的 Next.js standalone `server.js`。`data/`、`.env.local` 和日志目录独立持久化。
- **standalone 静态资源陷阱**：Next.js standalone 产物**不包含** `public/` 与 `.next/static/`，部署脚本必须手动复制——`public/* → .next/standalone/public/`、`.next/static/* → .next/standalone/.next/static/`，否则前端 404。改 `public/` 或静态资源后务必确认复制步骤仍生效。
- **PM2 入口**：部署包解压后使用 `pm2 start ./server.js --name WeldSnap --interpreter /opt/node-v22/bin/node --node-args="--experimental-sqlite --env-file=.env.local"`；该 `server.js` 是 Next.js standalone 产物。`pm2 delete` 先清后建，依赖 `RUNNER_TRACKING_ID` 环境变量（值为任意非空串）防止 GitHub Actions runner 完成后连带杀掉 PM2 守护的 Node 后台进程——删该变量会导致服务部署完即被杀。
- **开发端口**：`pnpm dev` 绑 `-H 0.0.0.0`，手机连同一 WiFi 可经 `http://<电脑IP>:3000` 访问。

## 开发历史文档（`docs/`）

`docs/devLogs/` 与 `docs/` 下的文档（`Roadmap.md`、`TakeOver.md`、`Implementation Setup.md`、`阿里云OSS配置.md`、两份 walkthrough、`底层重构.md`）是**历史快照**，部分内容已与代码现状漂移：

- **`Roadmap.md` 阶段五 checkbox 仍标未完成**（端到端验证、CI/CD standalone 更新、`/api/upload/sign` 加固），但代码现状显示 sign 接口**已**加 `requireAuth`、CI/CD **已**升级为 standalone 部署（见 `deploy.yml`）——只剩"端到端集成验证"一项尚未完成。checkbox 状态不要当真，以代码为准。
- **OSS Object Key 设计已演进**：`Implementation Setup.md` 原设计为多层路径 `projects/{name}_{constr}/{pipeline}/{weld}/{pipeline}-{weld}-{工序}.jpg`，`底层重构.md` 后改为**扁平化** `projects/{project_uuid}/{weld_uuid}_{工序}.jpg`——以扁平化为准（见 `src/services/upload.service.js`）。
- `TakeOver.md` 描述的是 **V1.0** 双表（`users` + 单层 `weld_records`、本地 `exports/` 存储、`express-session`）架构，已被 V2.0 三层关系 + OSS + 自研 session 取代，仅作遗留参考。
- `阿里云OSS配置.md` 仍是 OSS 调配真值：CORS 必含 `PUT`、Bucket 设私有 ACL、用 RAM 子账号授权。
- `ChatLog_Analyzing WeldSnap UI Aesthetics.md` / `session-ses_0929.md` 是长会话逐字稿，非精炼结论，按需查阅。

阅读这些文档时，遇到 checkbox 或"计划/将做"措辞，**务必对照 `src/` 实际代码确认是否已落地**。
