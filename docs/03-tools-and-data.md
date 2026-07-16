# 工具与数据源详解

> 本文档详解 DataNova 的六个 Agent 工具、数据来源、SQL 查询策略和配置项。

---

## 一、六个工具全景

```
用户问："上个月销售额是多少？"
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│                    Agent 的意图决策链                         │
│                                                              │
│  第 1 步：lookup_semantic_layer  ← "语义层有现成定义吗？"     │
│     ├─ 匹配到 → 直接执行确定性 SQL                            │
│     └─ 没匹配 ↓                                              │
│                                                              │
│  第 2 步：lookup_examples  ← "历史上有类似案例吗？"（自动同步执行历史 → 查询示例）            │
│     ├─ 找到 → 作为 Few-Shot 参考                              │
│     └─ 没找到 ↓                                              │
│                                                              │
│  第 3 步：discover_schema  ← "看看表结构"                     │
│     ↓                                                        │
│  第 4 步：execute_sql  ← "执行 SQL"                          │
│     ↓                                                        │
│  第 5 步：LLM 分析结果 → 返回用户                              │
│                                                              │
│  ───────────────────────────────────────────────              │
│  管理工具（不参与数据查询）：                                   │
│                                                              │
│  ai_annotate_schema     → "给这些表自动打注解"                 │
│  ai_suggest_semantic    → "推荐语义层定义"                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、工具①：discover_schema — 发现表结构

### 功能

查询 MySQL 的 `INFORMATION_SCHEMA`，获取数据库的表名、字段名、类型、外键关系。

### 参数

```typescript
{
  datasource_id: string,          // 数据源 ID，如果传错了会返回可用数据源列表
  table_names?: string[],         // 可选：只查指定的表
  discover_domains?: boolean,     // 可选：是否分析值域（枚举值/数值范围）
}
```

### 内部 SQL

```sql
-- ① 获取数据库名
SELECT DATABASE();

-- ② 查表列表（只查当前库）
SELECT TABLE_NAME, TABLE_COMMENT
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = ?
ORDER BY TABLE_NAME;

-- ③ 查字段（每张表查一次）
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT, COLUMN_KEY
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
ORDER BY ORDINAL_POSITION;

-- ④ 查外键（每张表查一次）
SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
  AND REFERENCED_TABLE_NAME IS NOT NULL;
```

### 额外作用

- 填充 **Schema Cache**（内存 Map），供 `execute_sql` 校验表名/字段名
- 如果 `discover_domains=true`，分析每列的值域并自动保存为 `domain_type` 注解

### 返回数据

除表结构外，还附带：
- 从 SQLite 查出的 `schema_annotations`（业务注解）
- 从 SQLite 查出的 `table_query_examples`（查询示例）

---

## 三、工具②：execute_sql — 执行 SQL

### 功能

在用户的 MySQL 数据库上执行 SQL 查询，带多重安全保护。

### 参数

```typescript
{
  datasource_id: string,    // 数据源 ID
  sql: string,              // SQL 语句
  skip_probe?: boolean,     // 跳过探针执行（语义层 SQL 用）
}
```

### 四层安全保护

```
LLM 写的 SQL
     │
     ▼
① 只读检查（isSelectQuery）
   只允许 SELECT / SHOW / DESCRIBE / EXPLAIN
     │
     ▼
② 表名校验（validateSqlAgainstSchema）
   从 Schema Cache 查表名是否存在，不存在则拒绝
   支持拼写纠错建议（Levenshtein 距离 ≤ 2）
     │
     ▼
③ 大表警告（checkLargeTableWithoutWhere）
   如果表 > 10 万行且 SQL 没有 WHERE → 警告
     │
     ▼
④ 执行保护
   SET SESSION max_execution_time = 30000  ← 30 秒超时
   自动追加 LIMIT 1000（如果原 SQL 没有 LIMIT）
     │
     ▼
   真正执行 SQL
```

### 返回格式

结果以 Markdown 表格返回给 LLM：

```
Query returned 125 rows in 45ms

| id | name     | amount |
|----|----------|--------|
| 1  | 产品A    | 1200   |
| 2  | 产品B    | 3400   |
... and 115 more rows
```

---

## 四、工具③：lookup_semantic_layer — 查语义层

### 功能

在用户预先定义的指标库中搜索匹配项。如果命中，用 `buildSemanticSql()` 生成确定性 SQL。

### 参数

```typescript
{
  datasource_id: string,
  query: string,              // 用户原始问题（如 "销售额"）
}
```

### 搜索逻辑

1. 从 SQLite 查出所有 `published` 状态的指标和维度
2. 按名称、显示名、别名做模糊匹配（支持中文分词）
3. 匹配到指标后，找关联的 Model，调用 `buildSemanticSql()` 拼 SQL

### 为什么重要

这是整个系统里 **最可靠** 的一层。语义层的 SQL 是用户定义、程序拼接的，不会出错。

---

## 五、工具④：lookup_examples — 查历史案例

### 功能

在历史成功查询中搜索类似问题，返回 Few-Shot 参考。每次调用前自动从 `sql_query_history` 同步高质量查询到 `query_examples`，并利用执行统计调整排序。

### 参数

```typescript
{
  datasource_id: string,
  query: string,              // 用户问题
}
```

### 查找逻辑

1. **自动同步**：调用 `syncQueryExamplesFromHistory(datasource_id)`，从 `sql_query_history` 聚合成功执行 ≥2 次的 (question, sql) 对，upsert 到 `query_examples`
2. 从 SQLite 查出该数据源的所有查询记录
3. 过滤：只取 `is_verified=1` 或 `success_count>=3` 的高质量案例
4. 打分排序（关键词匹配 ×2 + 表名匹配 ×1 + 认证加分 ×3 + 成功次数 + 执行统计加分/减分）
5. 返回 Top 3

### 执行统计评分

`getQueryExecutionStats(datasource_id)` 返回每条 SQL 的真实执行统计：

| 条件 | 评分影响 |
|---|---|
| 执行统计中成功次数 | +min(successCount, 5) |
| 错误次数 > 成功次数 | -3（惩罚错误率高的 SQL） |

### 同步机制

- **调用时同步**：每次 `lookup_examples` 被调用时自动触发 `syncQueryExamplesFromHistory()`
- **启动时同步**：服务端启动时对每个已启用数据源执行一次同步
- **Upsert 语义**：基于 `idx_qe_datasource_question_sql` 唯一索引，重复 (datasource_id, question, sql) 更新 success_count 而非重复插入

---

## 六、工具⑤：ai_annotate_schema — AI 自动注解

### 功能

自动生成表/字段的业务注解。取表结构 + 样本数据，让 LLM 分析并生成注解。

### 参数

```typescript
{
  datasource_id: string,
  table_names: string[],      // 要注解的表
}
```

### 流程

1. 发现表结构
2. 每张表取 5 行样本数据（`SELECT * FROM ? LIMIT 5`）
3. 返回给 LLM 让其分析生成注解

---

## 七、工具⑥：ai_suggest_semantic — 推荐语义层定义

### 功能

分析表结构，推荐哪些字段该定义为指标、维度、模型。

### 参数

```typescript
{
  datasource_id: string,
}
```

---

## 八、所有 SQL 查询汇总

| 查询时机 | 查什么 | 目标库 | 查法 |
|---|---|---|---|
| `discover_schema` | 表结构 | MySQL INFORMATION_SCHEMA | `WHERE TABLE_SCHEMA=?` 精确过滤 |
| `execute_sql` | 用户 SQL | MySQL 业务库 | 校验后执行，加 LIMIT + 超时 |
| `lookup_semantic_layer` | 指标/维度/模型 | SQLite | `WHERE datasource_id=?` 全取，内存匹配 |
| `lookup_examples` | 历史查询 | SQLite | `WHERE datasource_id=?` 全取，内存评分 + 执行统计加权 |
| `syncQueryExamplesFromHistory` | 执行历史 → 查询示例 | SQLite | 聚合成功 ≥2 次的 (question, sql)，upsert |
| `getQueryExecutionStats` | 执行统计 | SQLite | `GROUP BY sql` 聚合成功/失败次数 |
| `getRecentSqlContext` | 最近成功查询 | SQLite | `WHERE status='success' ORDER BY executed_at DESC LIMIT N` |
| `buildSemanticSql` | **不查数据库** | — | 纯字符串拼接 SQL 片段 |
| `validateSqlAgainstSchema` | **不查数据库** | 内存 Map | 哈希表 O(1) 查表名 |
| `checkLargeTableWithoutWhere` | 表行数 | MySQL INFORMATION_SCHEMA | `TABLE_ROWS WHERE TABLE_NAME=?` |
| `buildDataNovaSystemPrompt` | 数据源 + 注解 | SQLite | `WHERE datasource_id=?` |
| `loadAllSkills` | Skill 文件 | **磁盘文件** | 读 `data/skills/*/SKILL.md` |

---

## 九、数据存储位置总表

| 数据类型 | 存储位置 | 谁定义 | 谁使用 |
|---|---|---|---|
| 数据源配置（密码加密） | `datanova.db` → `datasources` | 用户填表单 | 所有工具 |
| Schema 注解 | `datanova.db` → `schema_annotations` | 用户手动打 | `discover_schema` |
| 语义指标 | `datanova.db` → `semantic_metrics` | 用户在 Metrics 页 | `lookup_semantic_layer` |
| 语义维度 | `datanova.db` → `semantic_dimensions` | 用户在 Metrics 页 | `lookup_semantic_layer` |
| 语义模型 | `datanova.db` → `semantic_models` | 用户在 Metrics 页 | `buildSemanticSql` |
| 查询示例 | `datanova.db` → `query_examples` | 自动同步（来自 sql_query_history）+ 手动 | `lookup_examples` |
| 表查询示例 | `datanova.db` → `table_query_examples` | 手动维护 | `discover_schema` |
| Skills | `data/skills/*/SKILL.md` | 用户手动建文件 | `buildDataNovaSystemPrompt` |
| 对话历史 | `datanova.db` → `conversations` + `messages` | 自动保存 | 重启后恢复 |
| LLM 模型列表 | pi-ai 内置 | 框架维护 | `ModelSelector` |
| Schema Cache | 内存 Map | `discover_schema` 填充 | `validator.ts` |

---

## 十、语义层 SQL 构建原理

`buildSemanticSql()` 是系统中最重要的 SQL 生成函数。它**不查数据库，不靠 LLM，纯 JavaScript 字符串拼接**：

```typescript
buildSemanticSql({
  metric: {
    sql_expression: "SUM(amount)",    // 用户定义的 SQL 片段
    name: "revenue",
    filters: '[{"column":"status","operator":"=","value":"paid"}]'
  },
  dimensions: [
    { sql_expression: "city", name: "city" }
  ],
  model: {
    base_table: "orders",
    joins: '[{"table":"customers","on":"orders.customer_id=customers.id","type":"left"}]'
  }
})

// 输出：
/* source: semantic_layer */
SELECT SUM(amount) AS revenue, city AS city
FROM orders
LEFT JOIN customers ON orders.customer_id = customers.id
WHERE status = 'paid'
GROUP BY city
```

SQL 带注释 `/* source: semantic_layer */`，executor 识别后会自动 `skip_probe=true`（跳过探针检查）。

---

## 十一、Agent 创建时的完整调用链路

```
harness-factory.ts → createHarness()
  │
  ├─ 创建 6 个工具
  │    createDiscoverSchemaTool()   → { name, description, parameters, execute }
  │    createExecuteSqlTool()       → { ... }
  │    createAiAnnotateSchemaTool() → { ... }
  │    createLookupSemanticLayerTool() → { ... 依赖 store.ts 的 listMetrics/listDimensions }
  │    createLookupExamplesTool()   → { ... 依赖 store.ts 的 listAutoQueryExamples }
  │    createAiSuggestSemanticTool() → { ... 依赖 discovery.ts }
  │
  ├─ 加载 Skills
  │    loadAllSkills()
  │      → listSkillFiles()  ← 扫描 data/skills/（不再扫描 data/annotations/，避免标注双重注入）
  │      → 解析 SKILL.md → 提取 name、description、content、filePath
  │
  ├─ 拼 System Prompt
  │    buildDataNovaSystemPrompt({ datasourceId, datasourceName, skills, customInstructions })
  │      → 固定模板（角色定义 + 行为规范 + 输出格式）
  │      + 数据源列表（来自 SQLite）
  │      + Skills（来自磁盘文件）
  │      + 自定义指令
  │
  ├─ 创建 Session
  │    sessionRepo.create({ id: conversationId })
  │
  ├─ 创建 Model
  │    getModel("anthropic", "claude-sonnet-4-20250514")
  │
  └─ new AgentHarness({ env, session, tools, resources, systemPrompt, model, getApiKeyAndHeaders })
```
