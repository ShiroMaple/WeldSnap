# V1 遗留代码剥离与文档统一实施计划

> **面向 AI 代理的工作者：** 本计划用于当前任务的内联执行。删除动作仅限已确认不被 V2 引用的 V1 入口与资产。

**目标：** 将 WeldSnap 的项目说明统一到 V2，并移除不再参与构建和部署的 V1 Express 代码，保留指定图片资源和历史资料。

**架构：** 以 `src/app`、`src/lib` 和 Next.js standalone 产物作为唯一当前实现。根目录 Express 入口、旧 SQLite 封装和 `public` 下旧页面不再作为运行代码。历史文档保留，但增加“V1 历史资料”标记。

**技术栈：** Next.js App Router、Node.js 22+、`node:sqlite`、阿里云 OSS、GitHub Actions、PM2。

---

### 任务 1：统一当前架构与部署说明

**文件：** `README.md`、`AGENTS.md`、`CLAUDE.md`、`.github/workflows/deploy.yml`

- [x] 将 README 改为 V2 的安装、开发、配置、部署和业务流程说明。
- [x] 明确 CI 解压后的 `server.js` 是 Next standalone 产物，不是 V1 Express 文件。
- [x] 记录 Windows 构建不产生 standalone、生产构建在 Linux CI 完成的约束。

### 任务 2：标记历史资料

**文件：** `docs/TakeOver.md`、`docs/Implementation Setup.md`、`docs/Roadmap.md`、E2E 文档和开发日志

- [x] 在 V1 架构资料顶部加入历史资料声明。
- [x] 标记旧 Object Key、旧部署入口、旧 Node 版本和旧测试结论，要求以代码与 CI 为准。

### 任务 3：移除 V1 运行代码

**删除：** 根目录 `server.js`、`db.js`，以及 `public` 下旧 HTML、JS、CSS 页面资产。

**保留：** `public/logo_zpje.jpg`、`public/demo_pic_blue.jpg`。

- [x] 删除前确认 V2、CI 和 package.json 没有引用 V1 入口。
- [x] 删除 V1 代码和旧页面。

### 任务 4：验证

- [ ] 检查 V1 入口、旧 API 和旧页面引用是否只存在于历史资料或 scratch 诊断脚本。
- [ ] 检查保留图片仍存在，删除范围没有扩大。
- [ ] 执行 `pnpm lint`；若项目脚本与当前 Next.js 版本不兼容，记录实际错误。
- [ ] 执行 `pnpm build`，确认当前工作区构建结果。
- [ ] 检查 `git diff` 和 `git status`，确保不覆盖用户原有的 3 个未提交界面修改。
