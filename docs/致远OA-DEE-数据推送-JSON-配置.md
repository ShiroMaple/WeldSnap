# 致远OA DEE 数据推送 JSON 配置

**Date**: July 23, 2026 at 07:55 AM
**Turns**: 1
**Source**: [Gemini Chat](https://gemini.google.com/u/1/app/ed1db12aee8eb5e2?pageId=none)

---

## Turn 1

### 🤖 Assistant

问题的原因非常明确。
在致远 OA 的 DEE（数据交换引擎）中，**REST 适配器 Body 中的 ${变量名} 语法只能读取“参数容器（Parameters）”中的变量，而无法直接读取 Document 对象中的 XML 节点数据**。
从调试截图来看：

1. `Document` 中包含的是 XML 树状结构数据（例如 `<root><projectName><row><施工号>...</施工号>...`）。
2. `Document` 中当前包含 **10 条记录**（`count="10"`）。
3. REST 适配器直接使用 `${施工号}`，由于参数容器中并没有名为 `施工号` 的参数，DEE 无法解析该宏，导致生成的 REST Body 为空。

## 解决方案
最标准且灵活的做法是：**在 REST 适配器之前插入一个【脚本适配器】**，通过 Groovy/Java 脚本遍历 `Document` 中的数据，自动将其拼接/转换成 JSON 字符串存入参数容器，再在 REST 适配器中引用该参数。

### 第一步：在 REST 适配器前添加【脚本适配器】
在 DEE 任务流中，在**取项目信息**（或映射适配器）与数据同步（REST适配器）之间，新建一个 **脚本适配器**（名称可设为：`转换为JSON Body`）。

### 第二步：编写 Groovy 脚本生成 JSON
在脚本适配器中粘贴以下代码：

```groovy
import groovy.json.JsonOutput
import com.seeyon.v3x.dee.Document.Element

// 1. 获取 Document 根节点及 projectName 下的所有 row
Element root = document.getRootElement()
Element table = root.getChild("projectName") // 对应你 Document 中的表节点名

List<Map> projectList = []

if (table != null) {
    List<Element> rows = table.getChildren("row")
    for (Element row : rows) {
        // 提取每行中的字段值
        String constructionNo = row.getChild("施工号") != null ? row.getChild("施工号").getValue() : ""
        String projectName    = row.getChild("项目名称") != null ? row.getChild("项目名称").getValue() : ""
        String ownerUnit      = row.getChild("建设单位") != null ? row.getChild("建设单位").getValue() : ""

        // 组装 Map 对象
        projectList.add([
            "construction_no": constructionNo,
            "project_name"   : projectName,
            "owner_unit"     : ownerUnit
        ])
    }
}

// 2. 将 List 转为 JSON 字符串
String jsonBody = JsonOutput.toJson(projectList)

// 3. 将 JSON 字符串放入 DEE 参数容器中，供后续 REST 适配器引用
setParam(document, "jsonBody", jsonBody)

```

```groovy
// 备用：传统字符串拼接逻辑
List<Element> rows = document.getRootElement().getChild("projectName").getChildren("row")
StringBuilder sb = new StringBuilder("[")
for (int i = 0; i < rows.size(); i++) {
    Element row = rows.get(i)
    String cNo = row.getChild("施工号").getValue()
    String pName = row.getChild("项目名称").getValue()
    String oUnit = row.getChild("建设单位").getValue()
    
    sb.append("{\"construction_no\":\"").append(cNo)
      .append("\",\"project_name\":\"").append(pName)
      .append("\",\"owner_unit\":\"").append(oUnit).append("\"}")
    if (i < rows.size() - 1) sb.append(",")
}
sb.append("]")
setParam(document, "jsonBody", sb.toString())

```

### 第三步：修改 REST 适配器的 Body 配置
回到你的 **数据同步（REST 适配器）** 配置界面：

1. **Content-type**：保持 `application/json`。
2. **Body 参数**：选择 **JSON** 模式。
3. **文本框内容**：清空原有内容，仅填写以下宏引用：

```json
${jsonBody}

```

## 避坑与排查检查点

1. **节点名称匹配**：请确保 Groovy 脚本中 `getChild("施工号")` 里的名称与你 `Document` 中输出的实际 XML 标签名完全一致。
2. **DEE 4.1+ 替代方案（零代码）**：
如果你的 DEE 版本在 **4.1 及以上**，也可以利用 **【服务注册】** 功能注册第三方 REST 接口并定义 JSON 数据模型，然后使用 **【模型转换适配器】** 将 `Document` 数据直接映射到 REST 入参模型中，无需编写脚本。

---

*Exported from [Voyager](https://github.com/Nagi-ovo/voyager)*  
*Generated on July 23, 2026 at 07:55 AM*