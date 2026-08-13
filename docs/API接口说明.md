# WeldSnap 外部系统项目同步与状态更新 API 接口文档

**文档版本**: v1.0  
**更新日期**: 2026年7月23日  
**适用对象**:致远 OA DEE 数据交换引擎管理员、第三方系统集成开发人员  

---

## 目录
1. [鉴权与安全说明](#1-鉴权与安全说明)
2. [接口一：项目信息批量同步与新增 (POST /api/sync/projects)](#2-接口一项目信息批量同步与新增-post-apisyncprojects)
3. [接口二：项目完工状态同步更新 (POST /api/sync/projects/status)](#3-接口二项目完工状态同步更新-post-apisyncprojectsstatus)
4. [致远 OA DEE 脚本配置整合范例](#4-致远-oa-dee-脚本配置整合范例)
5. [业务审计日志 (Audit Log) 追溯](#5-业务审计日志-audit-log-追溯)

---

## 1. 鉴权与安全说明

为了保证外部接口调用的安全性，所有同步接口均需要进行 API Key / Token 校验。

### 鉴权参数
默认 Token 为 `weldsnap-dee-secret-key`（可通过环境变量 `SYNC_API_KEY` 进行配置与重置）。

### 支持的传递方式（三选一即可）：
1. **HTTP Header (推荐)**:
   ```http
   X-API-Key: weldsnap-dee-secret-key
   ```
2. **Authorization Header**:
   ```http
   Authorization: Bearer weldsnap-dee-secret-key
   ```
3. **URL Query 参数**:
   ```http
   POST https://weldsnap.izpje.com/api/sync/projects?token=weldsnap-dee-secret-key
   ```

---

## 2. 接口一：项目信息批量同步与新增 (`POST /api/sync/projects`)

### 2.1 接口特性
- **定位键值**：以 **`construction_no`（施工号）** 为全局唯一标识。
- **自动去重**：若施工号在 WeldSnap 系统库中已存在，系统将自动**跳过**该条项目，绝不会覆盖或破坏已有的施工及焊口数据。
- **中英文键名兼容**：完全支持英文 JSON 键名与中文 JSON 键名。

### 2.2 字段映射表

| 英文键名 | 中文兼容键名 | 必填 | 数据类型 | 默认值 / 格式说明 |
| :--- | :--- | :--- | :--- | :--- |
| `construction_no` | `施工号`, `施工编号` | **是** | String | 唯一项目施工号，如 `SG-2026-001` |
| `project_name` | `项目名称`, `工程名称` | **是** | String | 项目完整名称 |
| `owner_unit` | `建设单位` | 否 | String | 建设单位/业主名称 |
| `construction_unit` | `施工单位` | 否 | String | 施工单位/承包商名称 |
| `completion_status` | `项目完工状态`, `完工状态`, `状态` | 否 | String | 默认 `'进行中'` |
| `remark` | `项目备注`, `备注` | 否 | String | 描述与备注说明 |
| `pipeline_prefix` | `管线号前缀` | 否 | String | 自动生成管线号的前缀 |
| `weld_prefix` | `焊口号前缀` | 否 | String | 自动生成焊口号的前缀 |

---

### 2.3 请求 Payload 示例

#### 单条 JSON 对象：
```json
{
  "construction_no": "SG-2026-001",
  "project_name": "常减压蒸馏装置改造工程",
  "owner_unit": "宁波华泰盛富聚合材料有限公司",
  "construction_unit": "中石化第十建设有限公司",
  "completion_status": "进行中",
  "remark": "致远 OA 数据同步推送"
}
```

#### 批量 JSON 数组（含中文键兼容）：
```json
[
  {
    "construction_no": "SG-2026-001",
    "project_name": "常减压蒸馏装置改造工程",
    "owner_unit": "宁波华泰盛富聚合材料有限公司"
  },
  {
    "施工号": "SG-2026-002",
    "项目名称": "乙烯装置高压管道工程",
    "建设单位": "镇海炼化分公司",
    "完工状态": "进行中"
  }
]
```

---

### 2.4 cURL 命令行调用示例

```bash
curl -X POST https://weldsnap.izpje.com/api/sync/projects \
  -H "Content-Type: application/json" \
  -H "X-API-Key: weldsnap-dee-secret-key" \
  -d '[
    {
      "construction_no": "SG-2026-TEST01",
      "project_name": "OA同步测试项目A",
      "owner_unit": "测试建设单位"
    }
  ]'
```

---

### 2.5 响应 JSON 结构

```json
{
  "success": true,
  "message": "同步处理完成。解析 2 条，成功写入 1 条，跳过 1 条。",
  "total": 2,
  "inserted": 1,
  "skipped": 1,
  "skippedDetails": [
    "第 2 行: 施工号已在系统库中存在 [SG-2026-001]，已跳过"
  ],
  "insertedProjects": [
    {
      "uuid": "4f9d2a1b-8c3e-4e5f-9a0b-1c2d3e4f5a6b",
      "construction_no": "SG-2026-002",
      "project_name": "乙烯装置高压管道工程",
      "owner_unit": "镇海炼化分公司",
      "construction_unit": "",
      "completion_status": "进行中"
    }
  ]
}
```

---

## 3. 接口二：项目完工状态同步更新 (`POST /api/sync/projects/status`)

### 3.1 接口特性
- **定位键值**：以 **`construction_no`（施工号）** 匹配目标项目。
- **动作**：仅更新目标项目的完工状态（`completion_status`），不更改其他属性。
- **支持 HTTP 方法**：`POST` / `PUT`。

### 3.2 字段映射表

| 英文键名 | 中文兼容键名 | 必填 | 数据类型 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `construction_no` | `施工号`, `施工编号` | **是** | String | 匹配目标的施工号 |
| `completion_status` | `项目完工状态`, `完工状态`, `状态`, `status` | **是** | String | 目标完工状态（如：`已完工` / `已结项` / `进行中`） |

---

### 3.3 请求 Payload 示例

#### 单条 JSON 对象：
```json
{
  "construction_no": "SG-2026-001",
  "completion_status": "已完工"
}
```

#### 批量 JSON 数组：
```json
[
  {
    "construction_no": "SG-2026-001",
    "completion_status": "已完工"
  },
  {
    "施工号": "SG-2026-002",
    "项目完工状态": "已结项"
  }
]
```

---

### 3.4 cURL 命令行调用示例

```bash
curl -X POST https://weldsnap.izpje.com/api/sync/projects/status \
  -H "Content-Type: application/json" \
  -H "X-API-Key: weldsnap-dee-secret-key" \
  -d '[
    {
      "construction_no": "SG-2026-001",
      "completion_status": "已完工"
    }
  ]'
```

---

### 3.5 响应 JSON 结构

```json
{
  "success": true,
  "message": "项目完工状态更新处理完成。解析 2 条，成功更新 2 条，未找到 0 条。",
  "total": 2,
  "updated": 2,
  "notFound": 0,
  "notFoundDetails": [],
  "updatedProjects": [
    {
      "uuid": "4f9d2a1b-8c3e-4e5f-9a0b-1c2d3e4f5a6b",
      "construction_no": "SG-2026-001",
      "project_name": "常减压蒸馏装置改造工程",
      "old_status": "进行中",
      "completion_status": "已完工"
    }
  ]
}
```

---

## 4. 致远 OA DEE 脚本配置整合范例

在致远 OA 的 DEE（数据交换引擎）中，推荐在 REST 适配器前添加一个 **【脚本适配器】**，通过 Groovy 脚本将 JDBC 查询出的 `Document` 动态组装为 JSON 字符串并存入 DEE 参数容器。

### Groovy 脚本代码（用于项目新增同步）：

```groovy
import groovy.json.JsonOutput
import com.seeyon.v3x.dee.Document.Element

// 1. 获取 Document 根节点及数据库表节点
Element root = document.getRootElement()
Element table = root.getChild("projectName") // 替换为您 SQL 输出的节点表名

List<Map> projectList = []

if (table != null) {
    List<Element> rows = table.getChildren("row")
    for (Element row : rows) {
        String constructionNo = row.getChild("施工号") != null ? row.getChild("施工号").getValue() : ""
        String projectName    = row.getChild("项目名称") != null ? row.getChild("项目名称").getValue() : ""
        String ownerUnit      = row.getChild("建设单位") != null ? row.getChild("建设单位").getValue() : ""
        String status         = row.getChild("项目完工状态") != null ? row.getChild("项目完工状态").getValue() : "进行中"

        if (constructionNo != "" && projectName != "") {
            projectList.add([
                "construction_no"  : constructionNo,
                "project_name"     : projectName,
                "owner_unit"       : ownerUnit,
                "completion_status": status
            ])
        }
    }
}

// 2. 转换成 JSON 字符串并写入 DEE 参数容器
String jsonBody = JsonOutput.toJson(projectList)
setParam(document, "jsonBody", jsonBody)
```

在随后的 **【REST 适配器】** 中配置：
- **Content-type**: `application/json`
- **Body 参数**: 选择 `JSON` 模式
- **文本框内容**: 填入 `${jsonBody}`

---

## 5. 业务审计日志 (Audit Log) 追溯

所有通过外部 API 调用的项目新增与完工状态变更行为，均会自动写入 WeldSnap 的强语义审计日志系统。

- **审计级别**: Level 35 (`audit`)
- **后台查看**: 登录管理控制台 -> **系统设置** -> **系统日志** -> 勾选 **“仅看业务审计”**
- **日志记载示例**:
  - `系统 通过致远 OA DEE 接口新建了项目 "常减压蒸馏装置改造工程" (施工号: SG-2026-001)`
  - `系统 通过 API 接口将项目 "常减压蒸馏装置改造工程" (施工号: SG-2026-001) 的完工状态由 "进行中" 更新为 "已完工"`
