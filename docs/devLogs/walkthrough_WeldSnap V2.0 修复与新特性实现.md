# WeldSnap V2.0 修复与新特性实现 Walkthrough

> [!WARNING]
> 本文档是 V1 或迁移过程中的历史资料，不是当前运行规范。当前实现以 `src/`、`package.json` 和 `.github/workflows/deploy.yml` 为准；其中旧的 Express、本地 `exports/`、旧会话或旧 OSS 路径说明仅供追溯。


本期任务已全部完成！我们解决了全局 CSS Reset 导致的 UI 崩坏、修正了数据库内数据乱码，加固了接口管线授权凭证接口，并为移动端局域网设备开放了开发端口，最后实现了符合 IBM Carbon 规范的 **简易登录、高级成员管理、管理员照片驳回重传与前端联动** 功能。

---

## 🛠️ 变更内容清单

### 1. 修复 UI 崩坏与排版间距失效问题
* **修改位置**：[globals.css](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/globals.css)
* **修复方案**：移除了过度强力的 Unlayered CSS Reset 规则，恢复了间距与排版网格。

### 2. 修复系统成员管理姓名乱码 (Mojibake)
* **修改位置**：SQLite Database `data/app.db` 中的 `users` 数据表。
* **修复方案**：将施工人员 `worker1` 原始姓名修正为 `"张师傅"`。

### 3. 加固 `/api/upload/sign` 上传凭证派发接口
* **修改位置**：[sign/route.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/api/upload/sign/route.js)
* **安全提升**：引入并调用了 `requireAuth(request)` 鉴权中间件。未登录用户请求时将返回 `401 Unauthorized`，保证直传安全。

### 4. 开放局域网设备开发端口 (0.0.0.0)
* **修改位置**：[package.json](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/package.json)
* **设置变更**：将 `dev` 脚本修改为 `next dev -H 0.0.0.0`，允许局域网移动端设备访问本地 3000 端口。

### 5. “简易登录”与设备自注册（以“#”分隔）
* **修改位置**：
  * [route.js (anonymous)](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/api/auth/anonymous/route.js)
  * [login/page.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/login/page.js)
* **优化内容**：
  * **自增后缀调整**：重名自增序号使用 `#` 作为分隔符，配以 4 位数字序号（例如 `张师傅#0001`）。
  * **登录按钮视觉放大**：简易登录按钮高度扩大一倍（`96px`），字体大小同步增大到 `22px`，右侧指示箭头增大到 `28px`，使其在页面布局中占据绝对焦点。
  * **界面流程简化**：暂不提供在登录界面主动切换姓名的功能，免去界面冗余逻辑。

### 6. 高级成员管理与自动销号
* **修改位置**：
  * [db.js (src/lib/db.js)](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/lib/db.js)
  * [users/route.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/api/admin/users/route.js)
  * [users/[id]/route.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/api/admin/users/[id]/route.js)
  * [admin/page.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/admin/page.js)
* **修改内容**：
  * **重命名 Tab 与页面**：统一由“系统成员管理”更名为 **“成员管理”**。
  * **三个月自动销号规则**：在 `GET /api/admin/users` 接口中，每次管理员加载列表时，会自动触发后台清理：**对于简易设备账号，如果超过三个月（90天）未登录，系统将执行自动销号清理**。成员管理界面左上方增加了说明提示。
  * **限制修改简易账户用户名**：管理员可以编辑其他用户的姓名、密码和所属角色，但如果原账户是简易账户，其用户名会被置为 disabled（只读模式），防止更改唯一特征。

### 7. 数据重置与前端细节打磨
* **更名“未上传”**：[WeldMatrix.jsx](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/components/WeldMatrix.jsx) 中，工序状态未开始的标签名更名为 **`"未上传"`**。
* **跟随鼠标的悬浮预览**：预览气泡采用 fixed 视口定位，并监听 `onMouseMove` 随鼠标平滑位移，防止溢出。

### 8. 管理员驳回照片功能 & 网页直传 (最新更新)
* **新增接口**：[route.js (reject)](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/api/admin/photo/reject/route.js)
  * 提供 `POST /api/admin/photo/reject` 接口。管理员对照片进行驳回时，对应字段前缀将被加上 `"REJECTED:"`，保留历史图片路径以供追溯和对比。
  * 预览接口 [preview/route.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/api/photo/preview/route.js) 进行了前缀自动剥离兼容。
* **修改页面与组件**：
  * [admin/page.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/admin/page.js) (将“生产控制大盘”正式重命名为 **“管道焊口总览”**，并给 `WeldMatrix` 引入了刷新回调)。
  * [WeldMatrix.jsx](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/components/WeldMatrix.jsx) (点击“已上传”进入详情 Modal 并提供 **“标记不合格”** 与 **“保存下载”** 交互；点击“未上传”或“需重传”提供网页端直接拍照/上传覆盖文件通道)。
  * [upload/page.js](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/src/app/upload/page.js) (如果某工序照片被管理员标记为了“需重传”，施工端相应工序卡片将以红色高亮边框和闪烁文字呈现“需重传”状态，并在卡片下方**完整保留并展示不合格照片的预览图**，方便工人对比改正)。

---

## 🧪 验证与测试结果

### 1. 管理端照片驳回与重传状态
管理员在大图查看器内点击 **“标记不合格 (需重传)”**，照片状态更改为红色闪烁的 **“需重传”** 胶囊，并仍可随时Hover预览历史驳回图片：

![管理端驳回状态截图](C:/Users/gaoft/.gemini/antigravity-ide/brain/8f4c6944-5fa1-4b50-b1f0-60c7b052cefc/admin_matrix_rejected_badge_1784176398387.png)

### 2. 施工员端驳回重传指引
切换至施工人员端，该工序卡片自动转为红色，显示状态 **“需重传”**，并附带不合格照片的对比预览，右侧按钮修改为 **“重传照片”**：

![施工员重传界面截图](C:/Users/gaoft/.gemini/antigravity-ide/brain/8f4c6944-5fa1-4b50-b1f0-60c7b052cefc/worker_reupload_screen_1784176565927.png)
