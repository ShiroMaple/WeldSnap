# WeldSnap V2.0 关系型项目层级重构 Walkthrough

> [!WARNING]
> 本文档是 V1 或迁移过程中的历史资料，不是当前运行规范。当前实现以 `src/`、`package.json` 和 `.github/workflows/deploy.yml` 为准；其中旧的 Express、本地 `exports/`、旧会话或旧 OSS 路径说明仅供追溯。


本期重构已经圆满完成！我们对系统架构进行了深度升级，构建了**项目 ➔ 管线 ➔ 焊口**三层结构。同时，实现了前端并行并发打包装包（零服务器负载）、批量删除熔断保护、直接二维码打印与打印分页控制、扁平化 OSS 存储目录和现场自增焊口创建等全新系统功能。

---

## 🛠️ 新增及重构特性清单

### 1. 三级项目层级结构重构
* **修改位置**：[db.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/lib/db.js)
* **实现方案**：
  * 新建 `projects` 表：包含全局唯一施工号 (`construction_no`)、项目名称、备注、状态 (`进行中` / `已完工`)、自增前缀配置与创建时间。
  * 重定义 `pipelines` 表：建立与项目的一对多级联外键映射，联合约束 `(project_id, pipeline_no)`。
  * 重定义 `weld_records` 表：建立与管线的一对多级联外键映射，联合约束 `(pipeline_id, weld_no)`，追加 `create_source`（现场创建 / 管理控制台创建）和 UUID 唯一标识。
  * **并发安全**：针对 Next.js 并行路由构建造成的 SQLite 锁冲突，在初始化中实现了重试退避机制（如果检测到 locked，休眠 100ms 并重试，重试 5 次失败才抛出），彻底根治了数据库偶发死锁问题。

### 2. 管道项目控制台与面包屑导航
* **修改位置**：[admin/page.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/admin/page.js)
* **实现方案**：
  * **大盘主界面**：默认加载所有项目列表，根据创建时间降序倒序排列。支持按施工号/项目名称过滤和排序。
  * **层级联动**：点击项目施工号后，项目列表收起。顶部展示面包屑导航 `项目控制台 / 🏗️ 施工号: {施工号} ({项目名称})`。点击 `项目控制台` 可折叠返回上一级。
  * **移除 OSS 归档浏览器页签**，工作区直观呈现管线树导航与焊口数据进度矩阵。

### 3. 现场自动生成管线与现场创建焊口
* **修改位置**：
  * [PipelineTree.jsx](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/components/PipelineTree.jsx)（添加管线）
  * [WeldMatrix.jsx](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/components/WeldMatrix.jsx) 与 [upload/page.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/upload/page.js)（添加焊口）
* **实现方案**：
  * 如果项目设定了管线前缀（如 `PL`），则自动生成格式为 `PL-001`、`PL-002`（3 位数字补零）的管线号。若无前缀，提供文本输入框。
  * 如果项目设定了焊口前缀（如 `W`），现场工人或管理员点击创建时自动递增生成 `W-01`、`W-02`（2 位数字补零）。若无前缀，现场工人可自由输入名称。
  * **高亮标注**：凡是在移动端现场由工人创建的焊口，在管理端 WeldMatrix 中将高亮显示 IBM Carbon 风格的黄色微型 Tag（**现场创建**），提示管理员核对命名规范。

### 4. 批量删除与全部熔断保护机制 (Fusion Safeguard)
* **修改位置**：[bulk-delete/route.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/api/admin/records/bulk-delete/route.js)
* **实现方案**：
  * 支持管理员在左侧管线树勾选多个管线，或在右侧矩阵勾选多个焊口批量删除。
  * **熔断拦截**：如果被勾选的项中任意一条关联了已上传的照片，接口将放弃本次批量操作并返回事务回滚，错误提示为：
    `"⚠️ 在您勾选的 {total} 个条目中，有 {count} 个已包含照片记录。为防止误删，本次批量操作已拦截。请取消勾选有图条目，或联系系统管理员进行强行删除。"`
  * 如果是系统管理员，在拦截后可以确认二次强行删除，其余非管理员角色无法绕过限制。

### 5. 零服务器负载客户端 ZIP 异步下载归档
* **修改位置**：
  * [export-manifest/route.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/api/project/export-manifest/route.js)
  * [WeldMatrix.jsx](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/components/WeldMatrix.jsx)
* **实现方案**：
  * 管理端请求 `/api/project/export-manifest`，返回选定焊口的所有已上传工序照片的 OSS 预签名 GET 链接以及按语义重命名的文件名（如 `管线号-焊口号-工序.jpg`）。
  * 浏览器客户端使用 `jszip` 与 `file-saver` 并发拉取对应 OSS 链接中的图片流，直接在用户的浏览器内存中生成打包 ZIP 文件并触发下载，完全跳过 Next.js 后端中转，实现零服务器 CPU 损耗与零服务器带宽消耗。

### 6. 二维码直接查看与打印布局排版
* **修改位置**：
  * [PipelineTree.jsx](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/components/PipelineTree.jsx)
  * [qrcodes-print/page.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/qrcodes-print/page.js)
* **实现方案**：
  * 改变 Hover 显示逻辑，管线名称旁直接常驻 **QR** 徽章按钮，点击一键调起单个管线二维码弹窗。
  * 支持多选批量打印：勾选部分管线时，批量打印仅生成已勾选的管线二维码。未勾选任何管线时，默认打印当前项目下的全部管线。
  * 引入 CSS 打印分页隔离标签 `.print-avoid-break` (`page-break-inside: avoid !important; break-inside: avoid !important;`)，防止在打印时单个二维码卡片被跨页切断，确保纸张排版美观规范。

### 7. 扁平化 OSS 对象存储 Key
* **修改位置**：[upload.service.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/services/upload.service.js)
* **实现方案**：
  * 去除旧版的多层物理文件目录，上传 OSS 的 Object Key 统一扁平化输出为：
    `projects/{project_uuid}/{weld_uuid}_{工序类型}.jpg`
  * 所有的逻辑目录与关联关系全部交给 SQLite 关系型绑定，降低了 OSS 存储路径的冗余度和解析复杂度。

---

## 🧪 验证与编译结果

Next.js 优化编译 (`pnpm build`) 结果：
* **编译状态**：✓ Compiled successfully
* **静态页面生成**：✓ Generating static pages (30/30)
* **服务运行脚本**：`pnpm dev` 局域网服务运行正常，热重载工作状态完好。
