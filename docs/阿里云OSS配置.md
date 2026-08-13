Viewed .env.example:1-11

为了配合系统的 **云端 OSS 前端直传方案（Scheme B）**，你需要在阿里云控制台对 OSS 进行相应的配置。主要包括**跨域配置 (CORS)**、**访问控制 (RAM) 授权**和**Bucket 权限设置**。

以下是具体的配置指南：

---

### 1. 跨域资源共享 (CORS) 配置 ⚠️ 关键步骤
因为手机浏览器是直接向阿里云 OSS 域名发起 `PUT` 请求上传照片的，属于跨域请求，若不配置 CORS 规则，上传会被浏览器拦截（报 CORS 跨域错误）。

1. 登录 [阿里云 OSS 控制台](https://oss.console.aliyun.com/)。
2. 在左侧 Bucket 列表中，点击你为项目创建的存储桶（例如 `weldsnap-photos`）。
3. 在左侧导航栏中，选择 **数据安全** -> **跨域设置 (CORS)**。
4. 点击 **创建规则**，添加以下配置：
   * **来源 (Allowed Origin)**：输入 `*`（在局域网多变环境或开发调试时推荐，若在公网生产环境部署，建议限制为系统的具体域名，如 `http://192.168.1.100:3000`）。
   * **允许 Methods**：勾选 **`PUT`**、**`GET`**、**`POST`**（必须包含 `PUT`，因为前端使用 `PUT` 直传照片）。
   * **允许 Headers**：输入 `*`。
   * **暴露 Headers**：输入 `ETag` 和 `x-oss-request-id`。
   * **缓存时间 (Max Age)**：设置为 `300` 秒。
5. 点击 **确定** 保存。

---

### 2. 存储桶权限设置 (ACL)
为了保障照片隐私，防止数据泄露：
* 建议将 Bucket 的 **读写权限 (ACL)** 设置为 **私有 (Private)**。
* *系统是如何工作的*：本系统上传使用的是短效 60s 签名的 `PUT` 链接，预览使用的是短效 60s 签名的 `GET` 链接（通过 `302` 重定向），因此 Bucket 设为“私有”最为安全，不影响正常拍照和查看，同时可彻底屏蔽未经授权的外界抓爬。

---

### 3. 创建 RAM 子账号并授权 (安全最佳实践)
为了防止主账号 AccessKey 泄露带来的安全隐患，应当使用 RAM 子账号：

1. 登录 [阿里云 RAM 访问控制控制台](https://ram.console.aliyun.com/)。
2. 选择左侧 **身份管理** -> **用户**，点击 **创建用户**。
3. 输入登录名称（例如 `weldsnap-uploader`），勾选 **OpenAPI 调用访问**，点击确定。
4. 保存子账号生成的 **AccessKey ID** 和 **AccessKey Secret**。
5. 返回用户列表，点击该用户右侧的 **添加权限**：
   * 选择 **系统策略**。
   * 搜索并添加 **`AliyunOSSFullAccess`**（管理对象存储服务权限）。
   * （可选）若需更细粒度的控制，可自定义策略，仅授予对特定 Bucket 的 `GetObject`、`PutObject` 和 `ListObjects` 权限。

---

### 4. 获取并在配置中填入环境变量

将获得的参数写入项目根目录下的 `.env.local` 文件中（可以从 [.env.example](file:///c:/Users/gaoft/Documents/CodeSpace/WeldSnap/.env.example) 复制）：

```env
# === OSS 对象存储配置 ===
OSS_ACCESS_KEY_ID=LTxxxxxx                     # 创建的 RAM 子账号 AccessKey ID
OSS_ACCESS_KEY_SECRET=xxxxxxxxxxxxxxxx        # 创建的 RAM 子账号 AccessKey Secret
OSS_BUCKET=weldsnap-photos                    # 创建的 OSS 存储桶名称
OSS_REGION=oss-cn-shanghai                     # 桶所在的区域（如 oss-cn-shanghai, oss-cn-beijing）
OSS_ENDPOINT=https://oss-cn-shanghai.aliyuncs.com # 区域对应的 Endpoint（带 https:// 协议头）

# === 应用配置 ===
NODE_ENV=development
SESSION_SECRET=a-secure-random-string-here   # 随意的长密钥，用于 session Cookie 加密
```

配置完成后，启动服务（`pnpm dev`），系统就会自动加载该配置并安全激活 OSS 直传管道。