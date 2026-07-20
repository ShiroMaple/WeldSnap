# WeldSnap

石化管道焊口工序照片结构化录入与归档系统。现场人员通过扫码定位管线，拍摄组对、打底、盖面 3 道工序照片；系统将照片直传阿里云 OSS，并在 SQLite 中记录焊口与照片状态。

## 当前架构

项目当前唯一运行实现是 Next.js V2：

- 前端与 API：`src/app/`，采用 Next.js App Router。
- 数据库：`src/lib/db.js`，使用 Node.js 内置 `node:sqlite` 的 `DatabaseSync` API。
- 会话：`src/lib/session.js`，使用 AES-256-GCM Cookie，会话 Cookie 名为 `weld_session`。
- 图片存储：浏览器获取 OSS 预签名 URL 后直接上传，服务器不转发图片流。
- 管理端：`/admin`，支持项目、管线、焊口、二维码、用户、驳回重传和批量导出。
- 施工端：`/upload`，支持设备指纹简易登录、扫码定位和移动端拍照。

根目录的 Express `server.js`、`db.js` 和旧 `public` 页面已从当前项目中移除。`docs/` 下的旧架构文档仅作为 V1 历史资料保留。

## 环境要求

- Node.js 22 或更高版本。
- pnpm。
- 阿里云 OSS Bucket，且配置允许浏览器跨域 `PUT` 上传。

所有 `node:sqlite` 调用都必须通过项目脚本运行，不能直接执行裸 `node`、`next dev` 或 `next build`。

## 本地开发

```bash
pnpm install
pnpm dev
```

开发服务器绑定 `0.0.0.0:3000`，同一局域网内的手机可以访问 `http://<电脑 IP>:3000`。

Windows 下 `next.config.mjs` 会关闭 standalone 输出，因此本地主要使用 `pnpm dev`。Linux CI 负责生成生产 standalone 产物。

## 环境配置

复制 `.env.example` 为 `.env.local`，填写：

```dotenv
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_BUCKET=weldsnap-photos
OSS_REGION=oss-cn-shanghai
OSS_ENDPOINT=https://oss-cn-shanghai.aliyuncs.com
SESSION_SECRET=<change-this>
```

`OSS_*` 变量缺失时，OSS 相关功能会拒绝启动。生产环境必须使用独立的强随机 `SESSION_SECRET`。

## 生产构建与启动

```bash
pnpm build
pnpm start
```

Linux CI 会生成 `.next/standalone`，并手动复制 `public/` 与 `.next/static/` 后打包部署。解压到服务器后的 `server.js` 是 Next.js 生成的 standalone 服务入口，不是历史 V1 Express 入口。

生产部署由 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 完成，使用 Node.js 22、SCP/SSH 和 PM2。服务器上的 `data/`、`.env.local` 和日志目录必须独立持久化，不能被发布包覆盖。

## 数据模型

```text
projects
  └── pipelines
        └── weld_records
```

- 一个项目的 `construction_no` 全局唯一。
- 管线在项目内唯一。
- 焊口在管线内唯一。
- 照片字段保存 OSS Object Key，而不是本地路径。
- Object Key 格式为 `projects/{project_uuid}/{weld_uuid}_{工序}.jpg`。
- 被驳回的照片使用 `REJECTED:` 前缀保留历史关联。

## 常用命令

| 用途 | 命令 |
| --- | --- |
| 开发服务器 | `pnpm dev` |
| 生产构建 | `pnpm build` |
| 生产启动 | `pnpm start` |
| Lint | `pnpm lint` |

项目当前未配置自动化测试框架，端到端验证请参考 `docs/E2E-Test-Plan.md`，并以当前代码和 CI 配置为准。

## 历史资料

以下文档描述的是 V1 或迁移过程中的中间状态，不是当前部署规范：

- `docs/TakeOver.md`
- `docs/Implementation Setup.md`
- `docs/Roadmap.md`
- `docs/devLogs/`

如历史资料与 `src/`、`package.json` 或 `.github/workflows/deploy.yml` 不一致，以代码和 CI 配置为准。
