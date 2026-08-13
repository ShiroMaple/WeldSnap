# WeldSnap 生产级对象存储与全链路可观测性重构方案 (V2.0)

> [!WARNING]
> 本文档是 V1 或迁移过程中的历史资料，不是当前运行规范。当前实现以 `src/`、`package.json` 和 `.github/workflows/deploy.yml` 为准；其中旧的 Express、本地 `exports/`、旧会话或旧 OSS 路径说明仅供追溯。


本重构计划旨在将 `WeldSnap` 原有的原生 HTML + Express 单机沙盒系统，彻底升级为基于 **Next.js (App Router)** 的高性能、云原生管道工序照片结构化录入系统[cite: 7, 15]。全面淘汰本地 Multer 写盘流，改用云端 OSS 客户端预签名直传架构（方案B），并从 Day 1 开始深度交织融入 Pino + ALS 的可观测性可观测性神经网[cite: 7, 12, 15]。

---

## 🎨 一、 视觉设计规范 (IBM Carbon System Integration)

请严格基于 `DESIGN_IBM.md` 系统，采用 Next.js + Tailwind CSS 落实以下设计令牌（Design Tokens），彰显严谨、权威的工业工程精密感，严禁出现任何圆角或柔和投影[cite: 16]：

- **核心大底 (Canvas Background)**: `#ffffff` (纯白，生产台主画布大底)[cite: 16]。
- **次要平铺层 (Layer 01 Surface)**: `#f4f4f4` (Gray 10，用于卡片容器填色、交替行底色)[cite: 16]。
- **唯一交互色 (Primary Interactive)**: `#0f62fe` (IBM Blue 60，用于所有核心交互按钮、焦点环、激活链接)[cite: 16]。
- **文本色彩**: 主文本 `#161616` (Gray 100)；次要描述文本 `#525252` (Gray 70)[cite: 16]。
- **绝对硬边界 (No Shadows & Sharp Corners)**:
  - 彻底封死任何 `box-shadow` 阴影表现，深度关系纯粹依靠背景色分层呈现[cite: 16]。
  - 核心组件（包含按钮、输入框、展示卡片）的 `border-radius` **强制指定为 0px（绝对矩形）**[cite: 16]。
- **字形系统 (Typography)**:
  - 界面 Display/Section 大标题指定为 `IBM Plex Sans`，大字号下强制使用 **Weight 300 (Light)** 呈现清爽的工程严肃感[cite: 16]。
  - 技术标签与代码、相对路径显示，统一指定使用 `IBM Plex Mono`[cite: 16]。
  - 紧凑型 UI 正文线高设定为 `1.29`，且 14px 文本必须附加 `0.16px` 的精密微追踪字符间距（letter-spacing）[cite: 16]。

---

## ⚙️ 二、 核心技术栈大升级与数据持久化改造

### 1. Next.js 与原生 SQLite 稳定缝合

- **运行环境约束**: 系统基于 Next.js App Router 长连接架构开发，必须支持通过 Docker 或 VPS 持久化磁盘稳定挂载 `data/app.db` 数据库文件[cite: 7, 15]。
- **数据库封装封装**: 沿用内置 `node:sqlite` 的 `DatabaseSync` 表结构 Schema[cite: 15]。为了防止同步 I/O 在大批量 Excel 焊口基础数据导入时阻塞 Node.js 主线程，必须在后端服务层建立独立的 Mutex 锁机制或平滑封装，确保 SQL 事务执行的原子性[cite: 15]。

### 2. Pino + AsyncLocalStorage 全链路链路追踪系统 (Day 1 强注入)

- **日志引擎配置**: 全局安装 `pino` 与 `pino-roll`[cite: 7, 12]。生产环境输出紧凑 JSON 单行日志至 `logs/weldsnap-run.log`，执行按天轮转与 10MB 物理截断；开发环境使用 `pino-pretty`[cite: 12]。
- **全链路 Trace 绑定**:
  - 在前端手机上传端唤起、或管理员操作的瞬间，接口入口通过高阶路由包装器自动捕获并生成唯一 `traceId`，存入 `AsyncLocalStorage` 隔离舱中[cite: 7, 12]。
  - **业务颗粒度绑定**：Pino 的 `mixin` 必须动态拦截当前调用上下文，将当前的 `traceId` 与业务核心要素 **【管线号 pipeline_no】** 和 **【操作人 uploaded_by】** 强行合并输出，确保日志全链路可追踪[cite: 12, 15]。
- **敏感安全脱敏**: 强力拦截并屏蔽日志中涉及的 `WPS_APP_SECRET`、`OSS_ACCESS_KEY` 等机密属性，防止明文泄露[cite: 7, 12, 15]。

### 3. 彻底解决爆盘危机：云端 OSS 客户端预签名直传管道 (Scheme B)

- **彻底斩断 Multer 中转**：完全移除原系统基于 Multer 的服务器本地磁盘写盘代码，把云服务器从大体积图片流量中完全解放出来[cite: 15]。
- **后端签名网关 (`src/app/api/upload/sign/route.js`)**:
  - 当手机端人员确定要拍摄的工序后，向该 API 发送申请，后端校验 session 身份后，调用 OSS SDK 动态计算生成一个限定时效（60秒内有效）且**限定唯一 Object Key 文件名**的 **`Presigned URL / Post Policy` (预签名上传凭证)** 返回给手机端[cite: 15]。
  - 云端 Object Key 路径强规则约束：`projects/{project_name}_{construction_no}/{pipeline_no}/{weld_no}/{pipeline_no}-{weld_no}-{工序名称}.jpg`[cite: 15]。
- **手机前端抢跑与降维压缩 (`public/js/upload.js`)**:
  - 手机端唤起相机拍照完成后，**绝不直接上传原图**[cite: 15]！
  - 前端立即调用 HTML5 Canvas 图像处理引擎，就地进行像素等比缩放调优（上限 1920x1080），并将 JPEG 压缩质量强制锁定为 `0.8`。**在传输发生前，在手机本地将 5MB-10MB 的手机原图降维压缩至 500KB 以内**[cite: 15]！
  - 拿着后端返回的签名 URL，直接向云端 OSS 门禁发起标准 HTTP 直传图片流，流过过程完全跳过 Next.js 服务器[cite: 15]。
- **状态轻量变更同步**:
  - 客户端直传 OSS 成功（收到 HTTP 200）后，再向云端发起一个轻量级的 JSON 请求，告知云服务器上传完毕[cite: 15]。服务器仅将该照片在 OSS 桶中的 `Object Key` 相对路径字符串写入数据库对应字段，轻量且安全[cite: 15]。

---

## 📐 三、 跨端 UI/UX 体验重构：IBM Carbon 宽屏矩阵拓扑

本轮重构的核心阶段全面侧重于 **PC 管理后台（1080px 宽屏工作台）**的建设，移动端在这一阶段优先通过 Tailwind 的响应式容器实现自适应兼容，后续再单独做戴手套大触控肥大化分流[cite: 12, 15]。

### 💻 PC 生产级管理后台结构重组

彻底推翻原系统如 `image_ebc790.png` 所示的低信息密度、大平铺式表格，采用 Carbon 经典的 **“左导航树 + 右状态进度网格”** 的横向大破局[cite: 12, 15, 16]：

1. **左侧 1/4 宽幅区域 (Pipeline Sidebar Navigation Tree)**:
   - 背景色填色为 Gray 10 (`#f4f4f4`)，与右侧纯白画布形成清晰的无阴影背景分层[cite: 16]。
   - 将导入的全部焊口记录按照 `管线号 (pipeline_no)` 进行高度收纳聚合，形成一棵精密、紧凑的管线导航树[cite: 15]。管理员点击某个管线号，右侧工作区实时联动展示[cite: 15]。
2. **右侧 3/4 核心区域 (Weld Joint Status Matrix Grid)**:
   - 顶框抛弃冗余的项目名、施工号等重复平铺文本，仅在上方以 Light(300) 字重 Plex Sans 优雅标注当前管线总体元数据[cite: 15, 16]。
   - 展现高度紧凑的**焊口工序进度矩阵表格**，表头无纵向网格线，仅有细分单边底线 (`#c6c6c6`)[cite: 16]。
   - **工序状态单元格 (Zudui / Dadi / Gaimian)** 采用 Carbon 标准的 pill 胶囊标签异常精细地可视化呈现[cite: 15, 16]：
     - *已完成*：10% 透明度绿底 (`#24a148` 10%) + 对应深绿文字，显示 `已上传(人员名)`[cite: 15, 16]；
     - *未开始/待录入*：10% 透明度暖沙底 + 灰色文字，显示 `未开始`[cite: 16]；
   - **鼠标悬浮微交互 (Hover Preview Tile)**：当管理员鼠标 hover 到任意 `已上传` 标签时，前端无缝弹出一个微型的浅灰色 Layer 02 悬浮轻量框，直接展示该工序照片在 OSS 的带有时效签名的缩略图预览，无需切页，秒级复核[cite: 15, 16]。
3. **高精度顶层看板**:
   - 顶部的总体量、已完成、待录入卡片去除边框和投影，全部改为纯扁平的 Gray 10 块，卡片内部加入高对比度的水平指示条，清晰量化当前管线的完工比率[cite: 15, 16]。

---

## 🤖 四、 你的具体执行任务

请严格按照上述规范，为我执行以下重构奠基第一步：

1. 设计并输出清晰模块化的 Next.js 生产化目录结构（包含 `src/app`, `src/lib`, `src/services`）。
2. 提供重构初始化所需的 `package.json` 依赖声明（使用 pnpm 安装命令）。
3. 编写核心后端路由接口代码：`src/app/api/upload/sign/route.js`，实现接收请求、绑定 ALS traceId 记录日志并利用 SDK 动态派发云端 OSS 上传预签名 URL 的完整管道逻辑[cite: 7, 12, 15]。
