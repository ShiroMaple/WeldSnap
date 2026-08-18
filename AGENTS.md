# AGENTS.md — WeldSnap

## 项目简介

石化管线焊口工序照片录入系统。扫码定位管线号，手机拍摄三道工序（组对/打底/盖面），自动命名归档。V2.0 从 Express 迁移到 Next.js App Router，使用 Tailwind CSS v4 + IBM Carbon Design System。

## 运行命令

| 用途 | 命令 |
|------|------|
| 开发服务器 | `pnpm dev` |
| 生产构建 | `pnpm build` |
| 生产启动 | `pnpm start` |
| Lint | `pnpm lint` |
| 测试 | 无（项目未配置测试框架） |

**关键约束**：所有 `node:sqlite` 调用必须加 `--experimental-sqlite` 标志。`pnpm dev` 和 `pnpm start` 已在 package.json 中配置，不要直接运行 `next dev` 或 `next build`。

## 架构

**当前运行架构**：
- 根目录 V1 Express 入口已移除；生产环境运行的是 CI 解压后的 Next.js standalone `server.js`
- `src/app/` — V2 Next.js App Router，新功能的开发入口

新 API 开发一律使用 `src/app/api/` 路由。

### 关键文件

- `src/lib/db.js` — SQLite 封装（DatabaseSync、Schema 初始化、所有查询）
- `src/lib/session.js` — AES-256-GCM Cookie 会话（自研，非 express-session）
- `src/lib/logger.js` — Pino 日志（开发: pretty stdout；生产: 滚动写入 logs/）
- `src/lib/trace.js` — AsyncLocalStorage 链路追踪（traceId、pipeline_no、uploaded_by）
- `src/lib/oss.js` — 阿里云 OSS 客户端（懒加载）
- `src/lib/env.js` — 环境变量校验（缺失 OSS 变量会启动崩溃）
- `src/middleware/auth.js` — `requireAuth()` / `requireAdmin()` 鉴权守卫
- `src/services/upload.service.js` — OSS 预签名 URL 生成 + 上传确认
- `src/components/` — React 组件（PipelineTree、WeldMatrix、StatsBar、OSSFileTree）
- `db.js`（根目录）— V1.0 遗留 DB 模块，Schema 相同但无日志集成
- `config.json` — 运行时配置（exportRoot、port），gitignore
- `data/app.db` — SQLite 数据库文件，gitignore

### 数据库

SQLite via `node:sqlite`（DatabaseSync 同步 API）。WAL 模式。三层关系表：

```
projects (id, uuid, construction_no, project_name, status, prefix_*, created_at)
  └─ pipelines (id, uuid, project_id FK, pipeline_no, created_at)
       └─ weld_records (id, uuid, pipeline_id FK, weld_no, create_source, photo_*, uploaded_by, uploaded_at)
```

- `projects.construction_no` 全局唯一
- `pipelines` 在项目内唯一，联合约束 `(project_id, pipeline_no)`
- `weld_records` 在管线内唯一，联合约束 `(pipeline_id, weld_no)`
- `create_source` 区分"管理控制台创建"和"现场创建"
- `photo_*` 列存储 OSS Object Key（非本地路径），驳回时加 `REJECTED:` 前缀

重置：删除 `data/app.db`，重启服务。

**SQLite 并发**：Next.js 并行路由构建可能导致 SQLite 锁冲突。`src/lib/db.js` 初始化时实现了重试退避机制（100ms × 5 次），无需手动处理。

### 照片存储

V2.0 使用阿里云 OSS 前端直传（预签名 URL）。Object Key 扁平化：
```
projects/{project_uuid}/{weld_uuid}_{工序类型}.jpg
```
语义关联完全由 SQLite 外键维系，不依赖 OSS 目录结构。

V1.0 使用本地 `exports/` 目录；该实现已移除，当前以 OSS 为准。

### 简易登录（设备指纹）

施工人员免注册登录流程：
1. 首次访问：前端 `crypto.randomUUID()` 生成设备 ID，存入 LocalStorage
2. 用户输入姓名，后端自动创建 `anon_{deviceId}` 账户，随机强密码
3. 重名自动加 `#0001`、`#0002` 后缀（4 位数字）
4. 后续访问：从 LocalStorage 读取设备 ID，直接签发会话

**注意**：清除浏览器缓存会丢失设备 ID，需重新输入姓名。3 个月未登录的简易账户会被自动清理。

### 照片驳回/重传

管理员可标记已上传照片为"不合格"：
- 数据库字段加 `REJECTED:` 前缀，保留原始路径可追溯
- 施工端显示红色高亮 + 历史不合格照片对比预览
- 预览接口自动剥离前缀

### 客户端批量下载

零服务器负载架构：
1. 前端请求 `/api/project/export-manifest`，获取 OSS 预签名下载 URL 清单
2. 浏览器用 `jszip` + `file-saver` 并发拉取图片，在客户端内存打包 ZIP
3. 图片流不经 Next.js 服务器中转

## 环境配置

复制 `.env.example` 为 `.env.local`，填写 OSS 凭证：
```
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_BUCKET=weldsnap-photos
OSS_REGION=oss-cn-shanghai
OSS_ENDPOINT=https://oss-cn-shanghai.aliyuncs.com
SESSION_SECRET=<change-this>
```
`env.js` 启动时校验所有 `OSS_*` 变量，缺失任何一个会立即崩溃。

## 设计系统

IBM Carbon Design System via Tailwind CSS v4，硬约束在 `src/app/globals.css`：
- `border-radius: 0px`（无圆角）
- `box-shadow: none`（深度通过背景色分层）
- 字重仅 300 / 400 / 600（无 700 Bold）
- 唯一交互色：IBM Blue 60（`#0f62fe`）
- 字体：IBM Plex Sans（正文）+ IBM Plex Mono（代码/路径），通过 `next/font/google` 加载

**Tailwind v4 CSS 坍缩层陷阱**：不要在 `globals.css` 中添加 Unlayered 的 `*` 选择器重置（如 `margin: 0; padding: 0`）。Tailwind v4 使用 Cascade Layers，非 Layer 样式会无条件覆盖所有 Tailwind 工具类，导致布局坍缩。Tailwind Preflight 已内置完整重置，无需额外添加。

## 平台注意事项

- **Windows**：`next.config.mjs` 中 `output: 'standalone'` 在 Windows 下禁用（符号链接 EPERM）。仅 Linux 部署路径使用 standalone 输出。
- **Node 版本**：生产环境需要 Node.js v22+（`node:sqlite` 依赖）。部署脚本锁定 `/opt/node-v22/bin/node`。
- **部署**：GitHub Actions 使用 `ubuntu-latest` 构建 Linux standalone 产物，手动复制 `public/` 与 `.next/static/` 后通过 SCP/SSH 发布到 `/var/www/WeldSnap/`。解压后的 `server.js` 是 Next.js standalone 入口；`data/`、`.env.local` 和日志目录必须持久化。
- **开发端口**：`pnpm dev` 使用 `-H 0.0.0.0` 绑定所有网卡，局域网设备可通过 `http://<电脑IP>:3000` 访问。

## 开发约定

- 所有 DB 查询使用 `DatabaseSync` 同步 API（非 async `Database`）
- 文件上传限制：30MB；V2 使用浏览器直传 OSS，Next.js API 负责签名和确认
- Session Cookie：`weld_session`，HttpOnly，SameSite=Lax，12h TTL
- 照片类型键：`zudui` / `dadi` / `gaimian`（中文：组对 / 打底 / 盖面）
- API 路由返回格式：`{ success: boolean, error?: string, ...data }`
- 路径别名：`@/*` → `./src/*`（jsconfig.json）
- 中文编码：Excel 导入可能遇到 GBK 编码问题（"张师傅" UTF-8 解码变乱码），需注意字符集处理
- 批量删除熔断：含照片记录的条目会触发拦截，需系统管理员确认才能强行删除
- 二维码打印：CSS 使用 `page-break-inside: avoid` 防止二维码被跨页切断

## Project Cairn 协作规则

> 本项目使用 Project Cairn 组织项目知识：`AGENTS.md` 是规则和导航入口，`cairn/` 是项目知识/状态层。
> 同目录下的 `CLAUDE.md` 应当只包含一行 `@AGENTS.md`。

### 初始化配置

- 毕业导出目标 (Provider): Obsidian (DevCairn)
- 知识库索引 (Index): WeldSnap/INDEX.md
- 毕业目标 (Target): WeldSnap

### 进入项目后的阅读顺序

1. 首先阅读本文件（AGENTS.md）。
2. 如果 `cairn/ROADMAP.md` 存在，阅读它以了解路线图、当前重点和开放问题。
3. 阅读 `cairn/LOG.md` 中最新的条目（最新记录在最顶部）以了解近期进展和关键决策。
4. 根据手头任务需要，阅读相关的 `cairn/` 知识专题文档。

### 文档职责

| 文件 | 作用 | 维护规则 |
|---|---|---|
| `AGENTS.md` (根目录) | 规则和导航 | 极少更改，≤ 60 行 |
| `CLAUDE.md` (根目录) | 单行 `@AGENTS.md` 存根 | 仅写一次，不再触碰 |
| `cairn/ROADMAP.md` | 路线图和进度 | 就地更新，保持简明 |
| `cairn/LOG.md` | 按时间倒序的日志 | 新条目加在最上面（最新的在最前），每条 ≤ 20 行，仅含摘要+指针 |
| `cairn/<topic>.md` | 知识专题文档 (当前真相) | 就地更新；教训放入正文并通过 `contains` 标记；修订记录需在 LOG 中留下指针 |
| `cairn/Reference/` | 外部原始输入 | 按需创建；仅可追加 |
| `cairn/Cited.md` | 知识库引用列表 | 仅保留指针，绝不复制正文 |

> 其他内容仅在有具体需求时才创建（例如：需要记录决策、解决了某个教训、目标跨越了单次会话）——不要预先创建空壳。工程资产（代码或流程消耗的契约/配置/规范）不由此系统管理；它们应留在代码树中，而非 `cairn/` 目录。

### 冲突仲裁规则

- 优先级：**知识专题文档 > LOG 历史**；规则级的冲突由本文件（AGENTS.md）裁定。
- 业务/设计结论遵循 `cairn/` 知识专题文档中的最新记录，而非旧的 LOG 条目。

### 知识库消费反射

- 在进行具有可复用内核的工作之前——即它产生或依赖的任何结论够格毕业时——请先检查配置的 provider 索引（见上文初始化配置）；仅为实际影响了输出的笔记添加 `cairn/Cited.md` 引用（仅指针，绝不复制正文）。

### 文档协作规则

- 在进行更改之前，请判断用户是想要“讨论/建议”还是“直接编辑文档”；当用户说“先看看 / 评估一下”时，先给出分析——不要直接重写正式文档。
- 在纠正过去的判断时，追加更正说明；不要静默覆盖。
- 不要把未经确认的判断写成已定论的事实。

### 知识沉淀规则

- 在每次取得实质性进展后，在 `cairn/LOG.md` 顶部添加一条记录（摘要 + 指针）；让结论沉淀到 `cairn/` 知识专题文档中。
- **完成回复门槛：** 在提出任何完成声明（包括但不限于工作已完成、已实现、已更新、已同步、已验证或测试通过；问题已修复或解决；交付物已准备就绪；表示工作已结束等）之前——必须执行 `references/maintenance.md` 中的 Cairn 检查点；仅维护其触发矩阵要求的记录，验证它们，然后再回复。明确的只读/不修改请求禁止写入 Cairn 文件。
- 跨项目的可复用经验应通过毕业机制沉淀到配置的 provider 目标（见上文初始化配置）中。
