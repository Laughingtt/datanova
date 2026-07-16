# P1 优化项设计文档

> **版本**: v1.0 | **日期**: 2026-06-30 | **基于**: optimization-specs.md v2.0

---

## 概述

本文档定义 P1 级别5个优化项的详细实施方案。实施顺序：P1-3 → P1-2 → P1-4 → P1-5 → P1-1（先修复bug和建基础设施，再叠加智能层），严格串行，每个需求完整实现并验证后再开始下一个。

### 关键决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| P1-1 语义检索方案 | 轻量替代方案（同义词表+意图分类） | 不引入embedding基础设施，开发量小，可快速上线 |
| P1-2 QueryState 存储 | 持久化到 SQLite | 重启可恢复，可跨会话查询 |
| P1-2 SQL 解析方式 | 正则提取（非parser库） | LLM生成SQL格式规范，正则足够；避免引入重依赖 |
| P1-4 意图分类方式 | 增强提示词方案（零额外API调用） | 注入QueryState+结构化规则表，让主Agent内部判断意图，避免额外API成本和延迟 |
| P1-1 同义词表 | 三层体系（内置+语义层+自定义） | 按数据源可定制，灵活且可扩展 |
| 实施策略 | 严格串行 | 依赖链清晰，避免文件冲突，每步可独立验证 |

---

## P1-3 修复上下文隔离问题

### 现状问题

`getRecentSqlContext(datasourceId, 3)` 按 `datasource_id` 查询，不区分 `conversation_id`。不同对话共享同一数据源时，SQL上下文互相污染。

### 改动设计

#### 1. `store.ts` — 修改 `getRecentSqlContext` 签名和SQL

```typescript
// 改前
export function getRecentSqlContext(datasourceId: string, limit = 3)

// 改后
export function getRecentSqlContext(conversationId: string, datasourceId: string, limit = 3)
```

SQL逻辑：优先查当前对话的成功查询，不足时补充同datasource最近查询（标注来源）：

```sql
-- 第一步：优先当前对话
SELECT *, 'current_conversation' as source
FROM sql_query_history
WHERE conversation_id = ? AND status = 'success'
ORDER BY executed_at DESC LIMIT ?

-- 第二步（仅当第一步结果不足limit时）：补充同datasource
SELECT *, 'other_conversation' as source
FROM sql_query_history
WHERE datasource_id = ? AND status = 'success'
  AND id NOT IN (已选出的ids)
ORDER BY executed_at DESC LIMIT (limit - 已有数量)
```

返回类型增加 `source` 字段：

```typescript
interface SqlContextItem {
  id: string;
  question: string;
  sql: string;
  executed_at: string;
  source: 'current_conversation' | 'other_conversation';
}
```

#### 2. `chat-handler.ts` — 传入 `conversationId`

```typescript
// 改前
const recentSql = getRecentSqlContext(datasourceId, 3);

// 改后
const recentSql = getRecentSqlContext(conversationId, datasourceId, 3);
```

#### 3. `prompt-builder.ts` — 格式化时标注来源

当上下文包含来自其他对话的查询时，标注 `[通用参考]` 以区分：

```
最近的查询上下文:
1. [当前对话] 问题: 各地区销售额 | SQL: SELECT region, SUM(amount) FROM orders GROUP BY region
2. [通用参考] 问题: 月度趋势 | SQL: SELECT MONTH(date), SUM(amount) FROM orders GROUP BY MONTH(date)
```

### 影响范围

- 3个文件改动：`store.ts`、`chat-handler.ts`、`prompt-builder.ts`
- 无数据模型变更
- 无前端改动

---

## P1-2 结构化多轮上下文

### 核心设计

#### 1. 新增 `query_state` 表（SQLite）

```sql
CREATE TABLE query_state (
  conversation_id TEXT PRIMARY KEY,
  current_sql TEXT,
  tables TEXT,              -- JSON数组: ["orders", "customers"]
  columns TEXT,             -- JSON数组: ["amount", "region"]
  where_conditions TEXT,    -- JSON数组: ["region='华东'", "year=2024"]
  group_by_columns TEXT,    -- JSON数组: ["region"]
  order_by_columns TEXT,    -- JSON数组: ["amount DESC"]
  result_summary TEXT,      -- "返回12行数据"
  last_intent TEXT,         -- "new_query" | "refine" | "drill_down" | ...
  updated_at TEXT NOT NULL
);
```

#### 2. 新增 `query-state.ts` 模块

负责 QueryState 的解析和更新逻辑：

```typescript
interface QueryState {
  conversation_id: string;
  current_sql: string | null;
  tables: string[];
  columns: string[];
  where_conditions: string[];
  group_by_columns: string[];
  order_by_columns: string[];
  result_summary: string | null;
  last_intent: string | null;
  updated_at: string;
}

// 从SQL和执行结果中提取结构化状态
export function parseQueryState(
  sql: string,
  result: { row_count: number },
  intent?: string
): Omit<QueryState, 'conversation_id' | 'updated_at'>

// 格式化为prompt注入文本
export function formatQueryStateForPrompt(state: QueryState | null): string
```

`parseQueryState` 使用简单正则提取（不引入SQL parser库）：

| 提取目标 | 正则策略 |
|---------|---------|
| 表名 | `FROM\s+(\w+)`、`JOIN\s+(\w+)` |
| 列名 | `SELECT\s+(.+?)\s+FROM` → 按`,`分割，取列名部分 |
| WHERE条件 | `WHERE\s+(.+?)(?:GROUP|ORDER|LIMIT|$)` → 按`AND`/`OR`分割 |
| GROUP BY | `GROUP\s+BY\s+(.+?)(?:HAVING|ORDER|LIMIT|$)` |
| ORDER BY | `ORDER\s+BY\s+(.+?)(?:LIMIT|$)` |

`result_summary` 使用简单格式：`"返回{N}行数据"`，不生成自然语言摘要。

#### 3. `store.ts` — 新增 QueryState CRUD

```typescript
export function getQueryState(conversationId: string): QueryState | null
export function upsertQueryState(conversationId: string, state: Partial<QueryState>): void
```

#### 4. `chat-handler.ts` — 注入 QueryState

```typescript
// handleMessage 中
const queryState = getQueryState(conversationId);
const statePrefix = formatQueryStateForPrompt(queryState);
// 拼接到 prompt 前缀（在 recentSql 上下文之后）
```

#### 5. `execute-sql.ts` — 执行后更新 QueryState

SQL执行成功后，调用 `parseQueryState` 解析结果，然后 `upsertQueryState` 持久化：

```typescript
// execute-sql.ts 成功执行后
const stateUpdate = parseQueryState(sql, { row_count: result.rows.length }, intent);
upsertQueryState(conversationId, stateUpdate);
```

#### 6. Prompt格式示例

```
【当前查询状态】
SQL: SELECT region, SUM(amount) FROM orders WHERE year=2024 GROUP BY region
涉及表: orders
筛选条件: year=2024
分组: region
结果: 返回5行数据
上次意图: new_query
```

当 QueryState 为 null（新对话首条查询）时，不注入此段。

### 影响范围

- 新增文件：`query-state.ts`
- 修改文件：`store.ts`（新增表+2函数）、`chat-handler.ts`（注入QueryState）、`execute-sql.ts`（更新QueryState）、`prompt-builder.ts`（格式化函数）
- 数据模型：新增 `query_state` 表
- 前端：无直接改动（可选：ChatWindow 展示查询状态摘要，后续迭代）

---

## P1-4 意图→SQL修改的结构化映射

### 设计决策：增强提示词方案（零额外API调用）

当前提示词已有意图分类指令（`prompt-builder.ts` 第59-66行），让主Agent在内部自行分类意图。问题是LLM不一定遵守，尤其在没有结构化上下文时容易"忘记"上一条SQL的状态。

**方案选择**：不额外调API做意图分类，而是通过注入结构化QueryState + 增强意图规则表，让主Agent在生成SQL时自行判断意图并遵循修改规则。理由：
- 零额外API成本、零延迟
- QueryState提供了结构化上下文（当前SQL、表、筛选条件、分组），LLM有了明确参考后遵守率显著提升
- 避免意图分类与主Agent判断不一致的问题（外部分类说refine，主Agent却判断为new_query）

### 核心设计

#### 1. 增强意图分类提示词

在现有意图分类指令基础上，替换为更结构化的版本：

```
- 意图分类与SQL修改规则（严格遵守）：
  每条用户消息必须先判断意图，再决定SQL修改策略。参考【当前查询状态】判断意图。

  | 意图 | 判断依据 | SQL修改动作 | 约束 |
  |------|---------|------------|------|
  | new_query | 无查询状态，或问题与上条SQL无关 | 从头生成，不参考上条SQL | — |
  | refine | 修改筛选条件（时间范围、地区、状态等） | 在上条SQL基础上修改WHERE条件 | 保留SELECT和GROUP BY不变 |
  | drill_down | 要求更细粒度（"按城市拆分""按月看"） | 增加GROUP BY维度 + 保留原维度 | 不移除已有维度 |
  | roll_up | 要求更粗粒度（"只看全国汇总""去掉地区"） | 减少GROUP BY维度 | 保留核心维度 |
  | compare | 要求对比（"和去年比""同比环比"） | 增加对比计算（CASE WHEN/UNION/LAG） | 保留原查询结构 |
  | explain | 问"为什么""什么原因" | 不执行SQL，解释上条SQL含义 | — |
  | sort | 要求排序（"按销售额降序"） | 修改ORDER BY | 保留其他部分不变 |
  | chat | 非数据查询类对话 | 不执行SQL | — |

  关键规则：
  - 当【当前查询状态】存在时，refine/drill_down/roll_up/compare/sort 必须基于上条SQL修改，而非从头生成
  - 修改SQL时，先输出意图判断（如"[意图: drill_down]"），再输出修改后的SQL
```

#### 2. QueryState 作为意图判断的结构化参考

P1-2 的 QueryState 为意图判断提供了关键上下文：

- `last_intent`：上一轮意图，帮助判断当前是延续还是新查询
- `current_sql` + `tables` + `where_conditions` + `group_by_columns`：让LLM明确知道"当前在查什么"，从而判断用户是在修改还是新建
- `result_summary`：让LLM知道上次查询是否有结果，影响是否需要refine

当 QueryState 为 null 时，LLM自然判断为 `new_query`，无需特殊处理。

#### 3. 意图结果写入 QueryState

主Agent在 `execute_sql` 工具调用时，通过工具参数 `intent_type` 传入意图分类结果。`execute-sql.ts` 将其记录到 `sql_query_history.intent_type` 和 `query_state.last_intent`：

```typescript
// execute-sql.ts 中
const intentType = typedParams.intent_type ?? null;
// 写入 sql_query_history
createSqlQueryHistory({ ..., intent_type: intentType });
// 更新 query_state
upsertQueryState(conversationId, { ..., last_intent: intentType });
```

`execute_sql` 工具参数增加 `intent_type`：

```typescript
intent_type: Type.Optional(Type.String({
  description: "The classified intent of this query: new_query|refine|drill_down|roll_up|compare|explain|sort|chat"
})),
```

#### 4. 意图结果影响 `lookup_examples` 检索

从 QueryState 读取 `last_intent`，传入 `lookup_examples` 工具上下文，调整检索策略：

```typescript
// chat-handler.ts 中构建工具上下文时
const queryState = getQueryState(conversationId);
// 传入 last_intent 给 lookup_examples
toolContext.current_intent = queryState?.last_intent ?? null;
```

```typescript
// lookup-examples.ts 中
if (context.current_intent === 'refine' || context.current_intent === 'drill_down') {
  // 提升与当前QueryState同表的示例权重
  // 降低完全不同表的示例权重
}
```

### 影响范围

- 修改文件：`prompt-builder.ts`（增强意图规则表）、`execute-sql.ts`（增加intent_type参数+写入QueryState）、`chat-handler.ts`（传入last_intent到工具上下文）、`lookup-examples.ts`（意图感知检索）
- 无新增文件（取消 `intent-classifier.ts`）
- 无数据模型变更（复用 `sql_query_history.intent_type` 和 `query_state.last_intent`）
- 前端：无改动

---

## P1-5 错误SQL反模式学习

### 核心设计

#### 1. `store.ts` — 新增聚合函数

```typescript
interface ErrorPattern {
  error_type: string;        // "syntax" | "table_not_found" | "column_not_found" | "timeout" | "other"
  pattern_signature: string; // 错误模式签名
  example_sql: string;       // 代表性错误SQL
  error_message: string;     // 错误信息
  occurrence_count: number;  // 出现次数
  last_seen: string;         // 最后出现时间
  suggested_fix: string;     // 建议修正
}

// 聚合Top N高频错误模式（出现2次以上）
export function getTopErrorPatterns(datasourceId: string, limit = 5): ErrorPattern[]

// 按表聚合错误
export function getErrorPatternsByTable(datasourceId: string, tableName: string): ErrorPattern[]
```

SQL实现（聚合查询）—— `pattern_signature` 在查询时从 `sql` + `error_message` 实时计算生成，不存储在表中：

```typescript
// 实时生成签名并聚合
function aggregateErrorPatterns(datasourceId: string, limit: number): ErrorPattern[] {
  const errors = getRecentErrors(datasourceId); // 查询 status='error' 的记录
  const patternMap = new Map<string, { sql: string; msg: string; count: number; lastSeen: string }>();

  for (const err of errors) {
    const sig = generateErrorSignature(err.sql, err.error_message);
    const existing = patternMap.get(sig);
    if (existing) {
      existing.count++;
      if (err.executed_at > existing.lastSeen) {
        existing.lastSeen = err.executed_at;
        existing.msg = err.error_message; // 保留最新的错误信息
      }
    } else {
      patternMap.set(sig, { sql: err.sql, msg: err.error_message, count: 1, lastSeen: err.executed_at });
    }
  }

  return [...patternMap.entries()]
    .filter(([_, v]) => v.count >= 2) // 仅出现2次以上的模式
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([sig, v]) => ({
      error_type: sig.split(':')[0],
      pattern_signature: sig,
      example_sql: v.sql,
      error_message: v.msg,
      occurrence_count: v.count,
      last_seen: v.lastSeen,
      suggested_fix: generateSuggestedFix(sig, v.msg),
    }));
}
```

#### 2. 错误模式签名生成

不存储原始SQL（太具体），而是生成归一化签名：

```typescript
function generateErrorSignature(sql: string, errorMessage: string): string {
  // 提取错误类型
  const errorType = classifyErrorType(errorMessage);
  // "syntax" | "table_not_found" | "column_not_found" | "timeout" | "other"

  // 提取涉及的表/列名
  const entities = extractErrorEntities(errorMessage, sql);

  // 组合签名: "column_not_found:orders.amount"
  return `${errorType}:${entities.join('.')}`;
}

function classifyErrorType(msg: string): string {
  if (/syntax|parse/i.test(msg)) return 'syntax';
  if (/doesn't exist|not found|unknown table/i.test(msg)) {
    if (/table/i.test(msg)) return 'table_not_found';
    if (/column|field/i.test(msg)) return 'column_not_found';
  }
  if (/timeout|exceeded/i.test(msg)) return 'timeout';
  return 'other';
}
```

#### 3. `prompt-builder.ts` — 注入反模式警告

仅在存在错误模式时注入（避免空提示浪费token）：

```
【⚠️ 常见错误模式警告】
以下SQL模式在本数据源中经常失败，请避免：
1. 在orders表中引用amount列 → 正确列名为order_amount (出现5次)
2. 直接查询大表不加LIMIT → 建议添加LIMIT子句 (出现3次)
```

格式化函数：

```typescript
export function formatErrorPatternsForPrompt(patterns: ErrorPattern[]): string {
  if (!patterns.length) return '';
  const lines = patterns.map((p, i) =>
    `${i + 1}. ${p.suggested_fix} (出现${p.occurrence_count}次)`
  );
  return `【⚠️ 常见错误模式警告】\n以下SQL模式在本数据源中经常失败，请避免：\n${lines.join('\n')}`;
}
```

#### 4. `suggested_fix` 自动生成

对于常见错误类型，自动生成修正提示：

| 错误类型 | suggested_fix 生成逻辑 |
|---------|----------------------|
| `column_not_found` | 利用 Levenshtein 建议生成："列X不存在，正确列名为Y" |
| `table_not_found` | 利用 schema_cache 生成："表X不存在，相似表名：Y, Z" |
| `timeout` | 通用提示："查询超时，建议添加LIMIT或缩小时间范围" |
| `syntax` | 通用提示："SQL语法错误，请检查关键字和括号匹配" |
| `other` | 直接使用 error_message |

#### 5. `lookup-examples.ts` — 排除与错误模式相似的示例

在示例评分中，检查示例SQL是否匹配已知错误模式，匹配则降权：

```typescript
// 获取当前数据源的错误模式
const errorPatterns = getTopErrorPatterns(datasourceId, 5);
const errorSignatures = new Set(errorPatterns.map(p => p.pattern_signature));

// 评分时检查
for (const example of allExamples) {
  const sig = generateErrorSignature(example.sql, '');
  if (errorSignatures.has(sig)) {
    example.score -= 5; // 大幅降权
  }
}
```

#### 6. `chat-handler.ts` — 加载反模式

```typescript
// handleMessage 中
const errorPatterns = getTopErrorPatterns(datasourceId, 5);
const patternsPrefix = formatErrorPatternsForPrompt(errorPatterns);
// 拼接到 prompt 前缀
```

#### 7. `InsightsPage.tsx` — 新增"常见查询错误"卡片

展示内容：
- 错误类型分布（饼图/条形图）
- 高频失败SQL列表（表格：SQL、错误信息、出现次数、建议修正）
- 数据来源：新增 API 端点 `GET /api/datasources/:dsId/insights/error-patterns`

### 影响范围

- 修改文件：`store.ts`（2函数+签名生成）、`prompt-builder.ts`（格式化函数）、`chat-handler.ts`（加载反模式）、`lookup-examples.ts`（错误模式降权）、`routes/insights.ts`（新端点）
- 前端：`InsightsPage.tsx` 新增错误模式卡片、`api/client.ts` 新增API方法
- 无数据模型变更（复用 `sql_query_history` 表聚合查询）

---

## P1-1 语义相似度示例检索（轻量方案）

### 核心设计

采用轻量替代方案，不引入embedding基础设施，通过三层同义词体系+意图分类+改进检索策略提升质量。

#### 1. 三层同义词体系

| 层级 | 来源 | 优先级 | 管理方式 |
|------|------|--------|---------|
| 内置层 | 代码内置通用同义词 | 最低 | 随版本更新 |
| 语义层 | `semantic_metrics.aliases` + `semantic_dimensions.aliases` | 中 | 用户在指标/维度定义时设置 |
| 自定义层 | `app_config` 中按数据源存储 | 最高 | 用户在设置页面添加 |

**内置层**（代码中）：

```typescript
const BUILTIN_SYNONYMS: Record<string, string[]> = {
  "销售额": ["营收", "收入", "营业额", "销售金额"],
  "客户": ["用户", "会员", "买家"],
  "订单": ["交易", "购买"],
  "利润": ["收益", "净利"],
  "地区": ["区域", "地带"],
  "数量": ["件数", "笔数", "个数"],
  "金额": ["数额", "总价", "价款"],
  "日期": ["时间", "日期"],
  "分类": ["类别", "类型", "种类"],
};
```

**自定义层**（app_config 表，按数据源隔离）：

```
key: "synonyms:{datasourceId}"
value: JSON: {"毛利": ["毛利率", "gross_margin"], "SKU": ["商品", "货品"]}
```

**合并逻辑**：

```typescript
function buildSynonymMap(datasourceId: string): Map<string, string[]> {
  const map = new Map<string, string[]>();

  // 1. 内置层
  for (const [k, v] of Object.entries(BUILTIN_SYNONYMS)) {
    map.set(k, v);
  }

  // 2. 语义层（从 metrics/dimensions 的 aliases 字段提取）
  const metrics = listMetrics(datasourceId);
  for (const m of metrics) {
    if (m.aliases?.length) {
      const existing = map.get(m.name) || [];
      map.set(m.name, [...existing, ...m.aliases]);
    }
  }
  const dimensions = listDimensions(datasourceId);
  for (const d of dimensions) {
    if (d.aliases?.length) {
      const existing = map.get(d.name) || [];
      map.set(d.name, [...existing, ...d.aliases]);
    }
  }

  // 3. 自定义层（覆盖前两层）
  const custom = getCustomSynonyms(datasourceId);
  for (const [k, v] of Object.entries(custom)) {
    const existing = map.get(k) || [];
    map.set(k, [...existing, ...v]);
  }

  return map;
}
```

#### 2. `store.ts` — 同义词管理函数

```typescript
export function getCustomSynonyms(datasourceId: string): Record<string, string[]>
export function saveCustomSynonyms(datasourceId: string, synonyms: Record<string, string[]>): void
```

#### 3. 改进分词策略

替代当前的 `split(/(?=[一-鿿])/)` 单字拆分：

```typescript
function tokenizeWithSynonyms(text: string, synonymMap: Map<string, string[]>): string[] {
  const tokens: string[] = [];
  let remaining = text;

  // 1. 优先匹配同义词表中的长词（从长到短匹配）
  const allWords = [...synonymMap.keys(), ...synonymMap.values().flat()]
    .sort((a, b) => b.length - a.length); // 长词优先

  for (const word of allWords) {
    if (remaining.includes(word)) {
      tokens.push(word);
      remaining = remaining.replace(word, ' ');
    }
  }

  // 2. 剩余部分按单字拆分（保留原逻辑作为兜底）
  const chars = remaining.split(/(?=[一-鿿])/).filter(s => s.trim());
  tokens.push(...chars);

  return [...new Set(tokens)]; // 去重
}
```

#### 4. LLM意图分类影响检索（复用 P1-4）

P1-4 的意图分类结果直接用于 `lookup_examples`：

| 意图 | 检索策略 |
|------|---------|
| `new_query` | 语义相似完整查询（默认行为） |
| `refine`/`drill_down` | 结构相似SQL（同表不同GROUP BY/WHERE），提升同表示例权重 |
| `compare` | 含JOIN/子查询的复杂示例，提升 difficulty='complex' 权重 |
| `sort`/`roll_up` | 同表示例，不特别调整 |

#### 5. 返回 top-5 + 简单多样性

当前返回 top-3，改为 top-5。不做完整MMR，用简单去重策略：

- 同一表的示例最多返回2个
- 同一SQL模式（`tables_used` + `difficulty` 相同）的示例最多返回1个

```typescript
function applyDiversityFilter(examples: ScoredExample[], limit = 5): ScoredExample[] {
  const result: ScoredExample[] = [];
  const tableCount = new Map<string, number>();
  const patternCount = new Map<string, number>();

  for (const ex of examples) {
    if (result.length >= limit) break;

    const tableKey = ex.tables_used?.[0] || 'unknown';
    const patternKey = `${ex.tables_used?.join(',')}_${ex.difficulty}`;

    if ((tableCount.get(tableKey) || 0) >= 2) continue;
    if ((patternCount.get(patternKey) || 0) >= 1) continue;

    result.push(ex);
    tableCount.set(tableKey, (tableCount.get(tableKey) || 0) + 1);
    patternCount.set(patternKey, (patternCount.get(patternKey) || 0) + 1);
  }

  return result;
}
```

#### 6. 前端同义词管理

在字典页面（DictionaryPage）增加"同义词管理"Tab页（与现有的"浏览"/"最近变更"Tab并列）：
- 查看当前生效的同义词（三层合并结果，标注来源：内置/语义层/自定义）
- 添加/编辑/删除自定义同义词
- API端点：`GET /api/datasources/:dsId/synonyms`、`PUT /api/datasources/:dsId/synonyms`

### 影响范围

- 修改文件：`lookup-examples.ts`（重构评分+分词+多样性）、`store.ts`（同义词管理函数）、`routes/insights.ts` 或新路由（同义词API）
- 前端：同义词管理UI组件、`api/client.ts` 新增API方法
- 无数据模型变更（复用 `app_config` 表存储自定义同义词）

---

## 改动文件汇总

### 后端文件改动矩阵

| 文件 | P1-3 | P1-2 | P1-4 | P1-5 | P1-1 |
|------|------|------|------|------|------|
| `store.ts` | ● 修改getRecentSqlContext | ● 新增query_state表+CRUD | | ● 新增2聚合函数 | ● 新增同义词管理函数 |
| `chat-handler.ts` | ● 传conversationId | ● 注入QueryState | ● 传入last_intent到工具上下文 | ● 加载反模式 | |
| `execute-sql.ts` | | ● 执行后更新QueryState | ● 增加intent_type参数+写入QueryState | | |
| `prompt-builder.ts` | ● 标注来源 | ● 格式化QueryState | ● 增强意图规则表 | ● 格式化反模式 | |
| `lookup-examples.ts` | | | ● 意图感知检索 | ● 错误模式降权 | ● 重构评分+分词+多样性 |
| 🆕 `query-state.ts` | | ● 新增 | | | |
| `routes/insights.ts` | | | | ● error-patterns端点 | ● synonyms端点 |
| `types.ts` | ● SqlContextItem增加source | ● QueryState接口 | | ● ErrorPattern接口 | |

### 前端文件改动矩阵

| 文件 | P1-3 | P1-2 | P1-4 | P1-5 | P1-1 |
|------|------|------|------|------|------|
| `InsightsPage.tsx` | | | | ● 错误模式卡片 | |
| `api/client.ts` | | | | ● error-patterns API | ● synonyms API |
| 🆕 `SynonymManager.tsx` | | | | | ● 同义词管理组件 |
| `DictionaryPage.tsx` | | | | | ● 嵌入同义词管理 |

### 数据库迁移汇总

| 优化项 | 新增表 | 修改表 |
|--------|--------|--------|
| P1-2 | `query_state` | — |
| P1-1 | — | 复用 `app_config` 表 |

---

## 实施顺序与依赖关系

```
P1-3 (上下文隔离修复)
  ↓
P1-2 (结构化多轮上下文 — QueryState)
  ↓
P1-4 (意图→SQL修改映射 — 依赖QueryState)
  ↓
P1-5 (错误SQL反模式学习 — 独立但串行避免冲突)
  ↓
P1-1 (语义相似度检索 — 复用P1-4意图分类)
```

每个需求完成后：
1. 运行现有测试确保无回归
2. 手动测试核心场景验证效果
3. Git commit 对应完整需求

---

*文档完 — 待用户审核后进入实施规划阶段*
