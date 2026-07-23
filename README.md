# WeldSnap (V2.0 Next.js 生产云原生架构)

> 石化管线焊口工序照片录入与归档系统。支持施工现场一键定位管线、移动端拍照上报组对/打底/盖面三道工序、阿里云 OSS 直传、照片质量审核驳回、致远 OA DEE 自动化数据同步、全链路业务审计日志与极速客户端打包导出。

---

## 🌟 核心特性

- **现代云原生架构**： Next.js 15 App Router 全栈响应式框架 + IBM Carbon Design System 扁平直角美学。
- **高性能原生数据库**：底层采用 Node.js 22 内置 `node:sqlite` 的 `DatabaseSync` API，配合事务并发指数退避重试防御机制。
- **零服务端中转照片直传**：移动端拦截照片原生 File，就地 Canvas 抢跑压缩，使用 OSS 预签名 URL 直传阿里云 OSS Bucket。
- **致远 OA DEE 自动化同步**：提供标准 REST API（`POST /api/sync/projects` 及 `POST /api/sync/projects/status`），支持中英文双语字段名与完工状态实时更新。
- **全链路追踪与业务审计**：接入 Pino 日志引擎 + `AsyncLocalStorage` 全局 `traceId` 链路追踪，针对全部关键业务操作注入 **Level 35 (`audit`) 业务审计日志**。
- **施工现场极简操作**：支持设备指纹免密自注册、主页快捷“修改姓名”、扫码直达管线及连续顺畅切换焊口卡片。
- **零负载客户端打包**：管理后台导出直接使用浏览器 `jszip` + `file-saver` 并发拉取 OSS 资源并在前端打包 ZIP，免去服务器 CPU/内存消耗。

---

## 📁 目录结构

```text
WeldSnap/
├── src/
│   ├── app/                 # Next.js 15 App Router 页面与 API 路由
│   │   ├── admin/           # PC 管理端主控制台 (IBM Carbon Design)
│   │   ├── upload/          # 移动端施工现场拍摄与上传入口
│   │   ├── login/           # 统一登录入口 (简易登录 + 管理登录)
│   │   └── api/             # 开放 API 接口与后台服务 API
│   │       ├── sync/        # 致远 OA DEE 项目同步与完工状态更新 API
│   │       ├── admin/       # 后台管理、日志检索/导出、数据导入导出 API
│   │       └── auth/        # 鉴权与 Session 管理 API
│   ├── components/          # 核心 React 组件 (PipelineTree, WeldMatrix 等)
│   ├── lib/                 # 核心基础库 (db.js, session.js, logger.js, audit.js, oss.js)
│   ├── middleware/          # 路由中间件 (withTrace.js 链路追踪, auth.js 鉴权)
│   └── services/            # 业务服务 (upload.service.js)
├── data/                    # SQLite 数据库持久化目录 (app.db)
├── logs/                    # 日志持久化目录 (weldsnap-run.log)
├── docs/                    # 系统设计、接口规范与开发日志
│   ├── 项目信息同步与状态更新接口说明.md
│   ├── Roadmap.md
│   ├── E2E-Test-Plan.md
│   └── devLogs/             # 阶段踩坑与总结日志
└── .github/workflows/       # GitHub Actions CI/CD 自动部署脚本
```

---

## 🔧 环境要求

- **Node.js**: 22.0.0 或更高版本 (依赖内置 `node:sqlite`)。
- **包管理器**: `pnpm`。
- **阿里云 OSS Bucket**: 已配置 CORS 跨域规则，允许浏览器发起 `PUT` 上传与 `GET` 读取。

> **注意**：所有 `node:sqlite` 调用都必须通过项目配置的 npm 脚本运行（自动带 `--experimental-sqlite` 标志）。

---

## 🚀 本地开发指南

1. **安装依赖**：
   ```bash
   pnpm install
   ```

2. **环境变量配置**：
   复制 `.env.example` 为 `.env.local`，填写阿里云 OSS 凭证及密钥：
   ```dotenv
   OSS_ACCESS_KEY_ID=your_access_key_id
   OSS_ACCESS_KEY_SECRET=your_access_key_secret
   OSS_BUCKET=weldsnap-photos
   OSS_REGION=oss-cn-shanghai
   OSS_ENDPOINT=https://oss-cn-shanghai.aliyuncs.com
   SESSION_SECRET=a_random_strong_secret_key_32bytes
   ```

3. **启动开发服务器**：
   ```bash
   pnpm dev
   ```
   开发服务器默认绑定 `0.0.0.0:3000`，局域网内的手机或移动设备可通过 `http://<电脑IP>:3000` 访问。

---

## 📦 生产构建与部署

```bash
# 1. 编译构建
pnpm build

# 2. 生产环境启动
pnpm start
```

### 自动化 CI/CD 部署
项目生产部署由 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 自动完成：
- 在 Ubuntu GitHub Runner 上构建生产 `standalone` 产物。
- 自动 SCP/SSH 同步增量静态资源与 `server.js` 到生产服务器 `/var/www/WeldSnap/`。
- 自动重启 PM2 进程。
- 服务器上的 `data/`、`.env.local` 和 `logs/` 目录实行隔离持久化，不受打包更新影响。

---

## 📖 常用命令表

| 用途 | 命令 | 备注 |
| :--- | :--- | :--- |
| **开发服务器** | `pnpm dev` | 自动开启 `--experimental-sqlite` |
| **生产构建** | `pnpm build` | 检查类型、打包 Next.js 产物 |
| **生产启动** | `pnpm start` | 启动生产 Server |
| **代码检查** | `pnpm lint` | 执行 ESLint 静态代码检查 |

---

## 📄 关联技术文档

- 📖 [外部 API 及致远 OA DEE 同步接口说明](docs/项目信息同步与状态更新接口说明.md)
- 🗺️ [V2.0 全局重构路线清单与完成状态 (Roadmap.md)](docs/Roadmap.md)
- 📝 [WeldSnap V2.0 终极收尾与致远 OA 集成总结报告](docs/devLogs/2026-07-23_WeldSnap_V2.0_收尾总结与致远OA集成总结.md)
- 🧪 [端到端全链路测试计划 (E2E-Test-Plan.md)](docs/E2E-Test-Plan.md)
