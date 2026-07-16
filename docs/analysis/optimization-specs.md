# DataNova 优化项详细规格文档

> **版本**: v2.0 | **日期**: 2026-06-26 | **基于**: query-accuracy-deep-analysis.md v1.0

---

## 目录

- [改进后的查询流程全景图](#改进后的查询流程全景图)
- [优化项详细规格](#优化项详细规格)
  - [P0-1 用户反馈闭环](#p0-1-用户反馈闭环)
  - [P0-2 Self-Correction 机制](#p0-2-self-correction-机制)
  - [P0-3 列名校验](#p0-3-列名校验)
  - [P1-1 语义相似度示例检索](#p1-1-语义相似度示例检索)
  - [P1-2 结构化多轮上下文](#p1-2-结构化多轮上下文)
  - [P1-3 修复上下文隔离问题](#p1-3-修复上下文隔离问题)
  - [P1-4 意图→SQL修改的结构化映射](#p1-4-意图sql修改的结构化映射)
  - [P1-5 错误SQL反模式学习](#p1-5-错误sql反模式学习)
  - [P2-1 Schema大小自适应策略](#p2-1-schema大小自适应策略)
  - [P2-2 语义层扩展](#p2-2-语义层扩展)
  - [P2-3 增强数据采样](#p2-3-增强数据采样)
  - [P2-4 数据血缘及追踪](#p2-4-数据血缘及追踪)
  - [P2-5 协作与共享](#p2-5-协作与共享)
  - [P3-1 多候选SQL生成](#p3-1-多候选sql生成)
  - [P3-2 结果合理性检查](#p3-2-结果合理性检查)
  - [P3-3 统一示例表](#p3-3-统一示例表)
  - [P3-4 主动同步query_examples](#p3-4-主动同步query_examples)
  - [P3-5 buildSemanticSql参数化](#p3-5-buildsemanticsql参数化)
  - [P3-6 中文分词优化](#p3-6-中文分词优化)
  - [P3-7 Schema Cache预加载](#p3-7-schema-cache预加载)

---

## 改进后的查询流程全景图

### 改进后端到端数据流

```
[用户输入自然语言]
    │
    ▼
[1] ChatInput → ChatWindow.handleSend() → 乐观UI更新
    │
    ▼
[2] useAgentStream.sendMessage() → WebSocket { type:"message", text, conversationId }
    │
    ▼
[3] chat-handler.ts :: handleMessage()
    ├── saveMessage() 持久化用户消息
    ├── 🆕 getQueryState(conversationId) ← query_state 获取结构化查询状态
    ├── 🆕 getNegativePatterns(datasourceId) ← sql_query_history 获取反模式
    ├── 🆕 getRecentSqlContext(conversationId, datasourceId, 5) ← sql_query_history 优先当前对话
    └── harness.prompt(contextPrefix + text)
    │
    ▼
[4] AgentHarness 多轮工具调用循环
    │
    ├── [4a] lookup_semantic_layer ───────────── 优先级1
    │   ├── listMetrics() → 过滤 published 状态
    │   ├── 🆕 语义匹配：embedding相似度 + 别名扩展 + 关键词匹配
    │   ├── listDimensions() → 🆕 含时间粒度层级
    │   ├── listModels() → 找关联 model
    │   ├── 🆕 buildSemanticSql() → 支持窗口函数/HAVING/ORDER BY/CTE
    │   └── 返回: metric定义 + generated_sql + dimensions + models
    │
    ├── [4b] lookup_examples ────────────────── 优先级2
    │   ├── 🆕 主动同步 syncQueryExamplesFromHistory() (execute_sql成功后已触发)
    │   ├── listAutoQueryExamples() → 🆕 含 question_embedding
    │   ├── getQueryExecutionStats() ← sql_query_history 聚合
    │   ├── 🆕 混合排序: 0.5*语义相似度 + 0.3*关键词重叠 + 0.2*执行可靠性
    │   ├── 🆕 MMR多样性采样 → top5 Few-Shot 示例 (非top3)
    │   └── 🆕 排除 negative feedback 降权的示例
    │
    ├── [4c] discover_schema ────────────────── 优先级3（兜底/前置）
    │   ├── discoverSchema() ← INFORMATION_SCHEMA
    │   ├── getAnnotations() ← schema_annotations (confirmed + 🆕 draft带置信度)
    │   ├── 🆕 discoverValueDomains() → 增加时间列范围/行数/null率/distinct_count
    │   ├── 🆕 discoverTableRelationships() → 结构化关系摘要
    │   ├── 🆕 formatSchemaForPrompt() → 自适应大小 (全量/摘要/子集)
    │   ├── listQueryExamples() ← 🆕 统一示例源
    │   └── setSchemaCache() → 🆕 含列名集合 (validator预加载)
    │
    └── [4d] execute_sql ───────────────────── 最终执行
        ├── 🆕 validateSqlAgainstSchema() → 表名 + 列名校验
        ├── checkLargeTableWithoutWhere() → 大表无WHERE警告
        ├── executeSql() → MySQL执行 (30s timeout, 1000 row limit)
        ├── 🆕 createSqlQueryHistory() → 记录 conversation_id + intent_type + parent_query_id
        ├── 🆕 Self-Correction循环 (最多3轮):
        │   ├── 执行失败 → 错误信息+原始SQL反馈LLM修正
        │   ├── 0行结果 → 分析WHERE条件宽松化建议
        │   └── 记录 correction_round 到 sql_query_history
        ├── 🆕 结果合理性检查 (负值/越界日期/百分比范围)
        ├── 🆕 主动触发 syncQueryExamplesFromHistory()
        └── 🆕 更新 QueryState → query_state 表
    │
    ▼
[5] AgentHarness 返回最终文本响应
    │
    ▼
[6] chat-handler.ts :: saveMessage() 持久化助手消息(含steps)
    │
    ▼
[7] forwardEvent() → WebSocket → processWsEvent() → React渲染
    │
    ▼
[8] 🆕 用户反馈 → FeedbackButtons → saveFeedback()
    └── 🆕 feedback 写入后 → lookup_examples 示例降权/提权
    └── 🆕 反馈统计 → Insights 页面展示
```

### 改进后每个环节的数据/上下文清单

| 环节 | 数据源 | 传递给LLM | 改进前状态 |
|------|--------|-----------|-----------|
| **chat-handler** | `query_state` | ✅ 结构化查询状态(当前SQL/表/列/筛选/结果摘要) | ❌ 不存在 |
| | `sql_query_history` | ✅ 最近5条成功查询(优先当前对话) | ✅ 3条，不区分对话 |
| | `sql_query_history`(错误) | ✅ 反模式Top5(高频失败SQL模式) | ❌ 未回传 |
| **lookup_semantic_layer** | `semantic_metrics` | ✅ 含embedding匹配结果 | ✅ 仅关键词 |
| | `semantic_dimensions` | ✅ 含时间粒度层级(grain) | ✅ 无粒度 |
| | `semantic_models` | ✅ 含Derived指标依赖解析 | ✅ 无依赖解析 |
| **lookup_examples** | `query_examples` | ✅ top5 + embedding语义排序 + MMR多样性 | ✅ top3关键词 |
| | `query_feedback` | ✅ negative降权 / positive提权 | ❌ 未回传 |
| | `sql_query_history`(聚合) | ✅ 含错误率排除 | ✅ 仅成功统计 |
| **discover_schema** | `INFORMATION_SCHEMA` | ✅ 含行数/时间范围/null率/distinct_count | ✅ 无统计 |
| | `schema_annotations` | ✅ confirmed + draft(带置信度标签) | ✅ 仅confirmed |
| | 🆕 `table_relationships` | ✅ 结构化关系摘要("每个客户可有多个订单") | ❌ 不存在 |
| **execute_sql** | `schema_cache`(内存) | - 🆕 含列名集合 | ✅ 仅表名 |
| | 🆕 `query_state` | ✅ 每轮更新SQL状态 | ❌ 不存在 |
| | 🆕 correction_history | ✅ 修正历史(避免重复修正) | ❌ 不存在 |
| **系统提示词** | 🆕 反模式列表 | ✅ 高频失败SQL模式 | ❌ 不存在 |
| | 🆕 意图→SQL修改规则 | ✅ 结构化映射表 | ✅ 仅自然语言 |

---

## 优化项详细规格

---

### P0-1 用户反馈闭环

#### 现状

- `query_feedback` 表存储了 `rating`（positive/negative）、`issue_type`、`issue_detail`
- `saveFeedback()` 函数在 `store.ts:566` 写入数据
- **没有任何读取路径**：没有 `listFeedback()` 或 `getFeedbackByMessage()` 导出函数
- 前端 `MessageItem.tsx` 中有 👍👎 按钮，点击后调用 `api/client.ts` 的 `submitFeedback()` → `POST /api/conversations/:convId/messages/:msgId/feedback`
- 反馈数据完全沉睡，不影响后续查询的任何环节

#### 改进后

- negative feedback 自动降权对应的 query_examples 示例
- positive feedback 自动提权对应示例
- 累计 negative 超阈值的示例自动标记 `is_verified = 0`
- 反馈统计展示在 Insights 页面
- 反馈关联到具体 SQL（通过 `sql_query_history_id` 外键）

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `store.ts` | 新增函数 | `listFeedbackByDatasource(datasourceId, limit)` — 按数据源列出反馈 |
| `store.ts` | 新增函数 | `getFeedbackStatsBySQL(sql)` — 统计某条SQL的正负反馈数 |
| `store.ts` | 新增函数 | `updateExampleVerification(exampleId, isVerified)` — 更新示例验证状态 |
| `store.ts` | 修改 | `saveFeedback()` 增加 `sql_query_history_id` 和 `feedback_category` 参数 |
| `store.ts` | DB迁移 | `query_feedback` 表增加 `sql_query_history_id TEXT`、`feedback_category TEXT` 列 |
| `lookup-examples.ts` | 修改 | 示例评分中引入反馈权重：`score = base_score + 0.2 * (positive_count - negative_count)`；negative 累计 ≥ 3 时排除该示例 |
| `prompt-builder.ts` | 修改 | 系统提示词注入"最近反馈问题"摘要："最近用户反馈以下查询模式有问题：..." |
| `routes/insights.ts` | 新增路由 | `GET /api/datasources/:dsId/insights/feedback-stats` — 反馈统计 |
| `routes/conversations.ts` | 修改 | `POST /:convId/messages/:msgId/feedback` 增加接收 `feedback_category` 参数 |
| `types.ts` | 修改 | `QueryFeedback` 接口增加 `sql_query_history_id`、`feedback_category` 字段 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `MessageItem.tsx` | 修改 | 👍👎 按钮点击后增加反馈类别选择弹窗：`wrong_result`(结果不对)/`slow_query`(查询太慢)/`wrong_table`(查错表了)/`missing_data`(数据不全) |
| `api/client.ts` | 修改 | `submitFeedback()` 增加 `feedback_category` 参数 |
| `InsightsPage.tsx` | 新增区块 | "查询反馈统计"卡片：正负反馈比例、高频问题类别分布、最近负反馈SQL列表 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 点击👎 | 仅记录，无后续效果 | 弹出反馈类别选择 → 选择后系统自动降权 → 后续相似查询不再使用该示例 |
| 点击👍 | 仅记录，无后续效果 | 系统自动提权 → 后续相似查询优先使用该示例 |
| 查看 Insights | 无反馈数据 | 可看到反馈统计、问题SQL分布 |
| LLM生成SQL | 不考虑反馈 | 自动避开被多次👎的SQL模式 |

#### 数据模型变更

```sql
-- query_feedback 表新增列
ALTER TABLE query_feedback ADD COLUMN sql_query_history_id TEXT;
ALTER TABLE query_feedback ADD COLUMN feedback_category TEXT;
  -- 枚举: 'wrong_result' | 'slow_query' | 'wrong_table' | 'missing_data' | 'other'
```

---

### P0-2 Self-Correction 机制

#### 现状

- `execute_sql` 执行失败时，返回 `isError: true` + 错误信息
- 系统提示词中有"0行结果时最多重试2次"的自然语言指令
- 完全依赖 LLM 自行决定是否重试，无结构化修正循环
- 没有修正历史追踪，LLM 可能重复相同的修正尝试
- `sql_query_history` 中不记录修正关系（哪条SQL是修正哪条的）

#### 改进后

- 执行失败时自动将错误信息 + 原始SQL + schema上下文反馈给 LLM 要求修正
- 执行成功但0行时，分析 WHERE 条件过于严格的可能性
- 最多3轮修正，每轮记录修正历史避免重复错误
- `sql_query_history` 中通过 `parent_query_id` 追踪修正链
- 修正成功后，将修正前后的SQL对作为"修正示例"存储

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `execute-sql.ts` | 重构 | 在 `execute` 函数内实现修正循环：`for (let round = 0; round < maxCorrections; round++)` |
| `execute-sql.ts` | 新增逻辑 | 失败时构造修正prompt：`"SQL执行失败: {error_message}\n原SQL: {sql}\n请修正SQL。已尝试的修正: {correction_history}"` |
| `execute-sql.ts` | 新增逻辑 | 0行结果时构造分析prompt：`"查询返回0行结果。当前WHERE条件: {conditions}\n可能原因：条件过于严格/数据不存在/表名错误。请尝试放宽条件或检查表名。"` |
| `execute-sql.ts` | 修改 | `createSqlQueryHistory()` 增加 `parent_query_id`、`correction_round`、`intent_type` 参数 |
| `store.ts` | DB迁移 | `sql_query_history` 表增加 `parent_query_id TEXT`、`correction_round INTEGER DEFAULT 0`、`intent_type TEXT` 列 |
| `store.ts` | 新增函数 | `getCorrectionChain(queryHistoryId)` — 查询修正链 |
| `store.ts` | 新增函数 | `saveCorrectionExample(originalSQL, correctedSQL, question)` — 存储修正示例 |
| `prompt-builder.ts` | 修改 | 系统提示词增加结构化修正规则："执行失败时必须分析错误原因并修正，而非简单重试。修正策略：1)语法错误→修正语法 2)表/列不存在→调用discover_schema 3)条件过于严格→放宽WHERE" |
| `chat-handler.ts` | 修改 | 将 `conversation_id` 传入工具执行上下文（当前缺失） |
| `types.ts` | 修改 | `SqlQueryHistory` 接口增加 `parent_query_id`、`correction_round`、`intent_type` 字段 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `MessageItem.tsx` | 修改 | 展示修正过程：当SQL经过修正时，显示"查询已自动修正"标签，可展开查看修正前后对比 |
| `useAgentStream.ts` | 修改 | 处理新的 WebSocket 事件类型 `correction_start`、`correction_result` |
| `ChatWindow.tsx` | 修改 | 在消息中展示修正轮次信息 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| SQL执行失败 | LLM可能不重试或盲目重试 | 自动结构化修正，最多3轮，避免重复 |
| 查询返回0行 | LLM可能不重试 | 自动分析原因并尝试放宽条件 |
| 查看修正过程 | 无法看到 | 消息中显示"已自动修正"标签，可展开查看对比 |
| 修正失败 | 用户需重新提问 | 3轮修正后仍失败，提供失败原因和修改建议 |

#### 数据模型变更

```sql
ALTER TABLE sql_query_history ADD COLUMN parent_query_id TEXT;
ALTER TABLE sql_query_history ADD COLUMN correction_round INTEGER DEFAULT 0;
ALTER TABLE sql_query_history ADD COLUMN intent_type TEXT;
  -- 枚举: 'new_query' | 'refine' | 'drill_down' | 'compare' | 'explain' | 'correction'
```

---

### P0-3 列名校验

#### 现状

- `validator.ts` 的 `validateSqlAgainstSchema()` 只校验表名是否存在
- schema_cache (`Map<datasourceId, SchemaCache>`) 仅存储表名集合和列名集合，但列名集合未被使用
- LLM 经常生成不存在的列名（幻觉），例如将 `order_amount` 误写为 `amount`
- 不存在的列名导致 SQL 执行失败，用户看到错误信息

#### 改进后

- 扩展 `validateSqlAgainstSchema()` 同时校验列名
- 支持两种模式：严格模式（拒绝未知列名）和宽松模式（警告但允许执行）
- 对不存在的列名提供 Levenshtein 拼写建议（与现有表名校验一致）
- 当 schema_cache 无列信息时，自动触发 `discoverSchema` 补充

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `validator.ts` | 修改 | `SchemaCache` 接口增加 `columns: Map<string, Set<string>>`（表名→列名集合） |
| `validator.ts` | 修改 | `setSchemaCache()` 同时存储列名集合 |
| `validator.ts` | 新增函数 | `extractColumnReferences(sql: string): Array<{table: string, column: string}>` — 从SQL中提取列引用 |
| `validator.ts` | 修改 | `validateSqlAgainstSchema()` 增加列名校验步骤：提取列引用 → 查找schema_cache → 不存在时Levenshtein建议 |
| `validator.ts` | 新增 | 校验模式配置：`VALIDATION_MODE = 'strict' | 'warn'`（默认 warn） |
| `discovery.ts` | 修改 | `discoverSchema()` 返回的 `TableSchema` 已含列信息，确保 `setSchemaCache` 时一并缓存 |
| `execute-sql.ts` | 修改 | 列名校验结果（warning/error）附加到 tool result 中 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `MessageItem.tsx` | 修改 | 展示列名校验警告："列 'amount' 不存在于表 'orders' 中，您是否指 'order_amount'？" |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| LLM幻觉列名 | SQL执行失败，错误信息不友好 | 执行前校验拦截，提供拼写建议 |
| 列名大小写错误 | MySQL可能不报错（取决于配置） | 校验时提示正确大小写 |
| schema_cache无列信息 | 跳过校验 | 自动触发discover_schema补充后重新校验 |

---

### P1-1 语义相似度示例检索

#### 现状

- `lookup-examples.ts` 使用关键词重叠评分：`split(/(?=[一-鿿])/)` 将中文拆成单字
- "销售额"被拆成"销""售""额"，导致"销售额"和"营收"匹配度为0
- 返回 top-3 最相似示例，无多样性策略
- 示例可能高度同质（3个都是简单SELECT）
- 不利用意图分类信息（prompt中定义了但检索时未用）

#### 改进后

- 增加 embedding 向量相似度检索（混合排序）
- MMR 多样性采样（在相似度和多样性之间平衡）
- 意图感知检索（refine/drill_down 时检索结构相似SQL而非语义相似完整查询）
- 返回 top-5 示例（非 top-3）

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `store.ts` | DB迁移 | `query_examples` 表增加 `question_embedding TEXT` 列（JSON数组） |
| `store.ts` | 新增函数 | `saveExampleEmbedding(exampleId, embedding)` — 保存embedding |
| `store.ts` | 新增函数 | `searchExamplesByEmbedding(datasourceId, queryEmbedding, limit)` — 向量检索 |
| `lookup-examples.ts` | 重构评分 | 混合排序：`score = 0.5 * semantic_similarity + 0.3 * keyword_overlap + 0.2 * execution_reliability` |
| `lookup-examples.ts` | 新增逻辑 | MMR多样性采样：`MMR_score = λ * sim(q, d) - (1-λ) * max(sim(d, d_i))` |
| `lookup-examples.ts` | 修改 | 返回 top-5（非 top-3） |
| `lookup-examples.ts` | 新增逻辑 | 意图感知：传入当前意图，refine/drill_down时检索结构相似SQL |
| 🆕 `embedding-service.ts` | 新增文件 | Embedding服务：调用embedding API（OpenAI/本地模型），生成问题向量 |
| `types.ts` | 修改 | `QueryExample` 接口增加 `question_embedding` 字段 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| 无直接前端改动 | — | 此项为纯后端优化，前端无需改动 |

#### 轻量替代方案（无需embedding基础设施）

如果暂不引入 embedding，可先实施以下轻量方案：

1. **别名扩展**：利用 metric 的 `aliases` 字段扩展关键词匹配范围
2. **同义词表**：在 `store.ts` 中维护一个简单的同义词映射表（如 "销售额→营收→收入→营业额"）
3. **LLM意图分类**：在 `lookup_examples` 调用前，用 LLM 对用户问题做意图分类，将分类结果用于检索策略选择

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 问"各区域营收" | 可能找不到示例（因为历史记录是"销售额"） | 语义匹配找到"销售额"相关示例 |
| 问"各区域销售额" | 返回3个相似示例，可能都是简单查询 | 返回5个多样示例（含JOIN、子查询等不同模式） |
| 多轮对话"按城市拆分" | 检索语义相似完整查询 | 检索结构相似SQL模板（同表但不同GROUP BY） |

---

### P1-2 结构化多轮上下文

#### 现状

- `chat-handler.ts` 用 `getRecentSqlContext(datasourceId, 3)` 获取最近3条成功SQL
- 按 `datasource_id` 查询，不区分 `conversation_id`，跨对话上下文污染
- 上下文以文本形式拼接：`"最近的查询上下文:\n1. 问题: xxx\nSQL: yyy\n"`
- 多轮对话中完全依赖 LLM 从对话历史推断指代（如"按地区拆分"→指的是哪条SQL）
- 没有"查询状态"概念，无法结构化追踪当前查询的表/列/筛选条件

#### 改进后

- 维护结构化 `QueryState` 对象，每次SQL执行后更新
- 在 prompt 前缀注入结构化摘要（替代文本拼接）
- 按 `conversation_id` 隔离上下文（优先当前对话，不足时补充同datasource）
- `execute_sql` 中传入 `conversation_id`（修复硬编码 null）

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| 🆕 `query-state.ts` | 新增文件 | `QueryState` 接口定义 + 更新逻辑 |
| `store.ts` | 新增表 | `query_state` 表：`conversation_id, current_sql, tables, columns, where_conditions, group_by_columns, result_summary, last_intent, updated_at` |
| `store.ts` | 新增函数 | `getQueryState(conversationId)` — 获取查询状态 |
| `store.ts` | 新增函数 | `upsertQueryState(conversationId, state)` — 更新查询状态 |
| `store.ts` | 修改 | `getRecentSqlContext()` 增加 `conversationId` 参数，优先查当前对话 |
| `chat-handler.ts` | 修改 | `handleMessage()` 中获取 `QueryState` 并注入 prompt |
| `chat-handler.ts` | 修改 | SQL执行后更新 `QueryState` |
| `chat-handler.ts` | 修改 | 将 `conversation_id` 传入 harness 工具上下文 |
| `execute-sql.ts` | 修改 | `createSqlQueryHistory()` 使用传入的 `conversation_id`（而非 null） |
| `prompt-builder.ts` | 修改 | 增加 `formatQueryStateForPrompt(state)` — 格式化查询状态为结构化摘要 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `ChatWindow.tsx` | 修改 | 展示当前查询状态摘要（可选，如"当前查询: orders表, WHERE region='华东', GROUP BY city"） |

#### QueryState 数据结构

```typescript
interface QueryState {
  conversation_id: string;
  current_sql: string | null;          // 上一条执行的SQL
  tables: string[];                    // 涉及的表
  columns: string[];                   // 涉及的列
  where_conditions: string[];          // WHERE条件列表
  group_by_columns: string[];          // GROUP BY列
  order_by_columns: string[];          // ORDER BY列
  result_summary: string | null;       // "返回12行，包含3个地区的销售额数据"
  last_intent: string | null;          // "new_query" | "refine" | "drill_down" | ...
  updated_at: string;
}
```

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 多轮对话"按地区拆分" | LLM从对话历史推断指代 | 系统注入结构化上下文："当前查询: orders表, SELECT SUM(amount), 无GROUP BY" |
| 切换对话 | 上一对话SQL上下文可能污染新对话 | 按 conversation_id 隔离，优先当前对话 |
| 复杂分析（5轮+） | 早期上下文可能丢失 | QueryState 持久化，不依赖对话历史长度 |

---

### P1-3 修复上下文隔离问题

#### 现状

- `getRecentSqlContext(datasourceId, 3)` 在 `store.ts` 中按 `datasource_id` 查询
- `chat-handler.ts:168` 调用时只传 `datasourceId`
- 不同对话共享同一 datasource 时，SQL上下文互相污染
- `execute_sql` 工具中 `conversation_id` 硬编码为 `null`
- 导致 `sql_query_history` 中无法关联查询到具体对话

#### 改进后

- `getRecentSqlContext(conversationId, datasourceId, limit)` 优先查当前对话
- 当前对话历史不足时，补充同 datasource 最近查询（标注来源）
- `execute_sql` 中传入实际 `conversation_id`

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `store.ts` | 修改 | `getRecentSqlContext()` 增加 `conversationId` 参数，SQL改为 `WHERE conversation_id = ? UNION WHERE datasource_id = ? LIMIT ?` |
| `chat-handler.ts` | 修改 | 调用 `getRecentSqlContext` 时传入 `conversationId` |
| `chat-handler.ts` | 修改 | 将 `conversationId` 注入到 harness 工具执行上下文 |
| `execute-sql.ts` | 修改 | `createSqlQueryHistory()` 使用上下文中的 `conversation_id` |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| 无直接前端改动 | — | 此项为纯后端修复 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 新建对话查询 | 可能看到其他对话的SQL上下文 | 仅看到当前对话的上下文（不足时补充同datasource通用查询） |
| 查看查询历史 | 无法按对话筛选 | 可按 `conversation_id` 筛选 |

---

### P1-4 意图→SQL修改的结构化映射

#### 现状

- `prompt-builder.ts` 中有意图分类指令：`new_query/refine/drill_down/compare/explain/chat`
- 仅有自然语言指导："refine时修改条件"、"drill_down时增加维度"
- LLM 不一定遵守，可能对 refine 意图从头生成全新SQL
- 没有意图到具体SQL修改动作的结构化规则

#### 改进后

- 为每种意图定义明确的SQL修改规则
- 在系统提示词中注入结构化规则表
- 意图分类结果传递给 `lookup_examples`（影响检索策略）
- 支持新意图：`roll_up`（上卷，减少GROUP BY维度）

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `prompt-builder.ts` | 修改 | 注入结构化意图→SQL修改规则表 |
| `chat-handler.ts` | 修改 | 意图分类结果注入工具调用上下文 |
| `lookup-examples.ts` | 修改 | 根据意图调整检索策略（refine→结构相似SQL，new_query→语义相似完整查询） |

#### 意图→SQL修改规则表

| 意图 | SQL修改动作 | 示例 |
|------|-----------|------|
| `new_query` | 从头生成，不参考上条SQL | "各地区的销售额" → 新建 SELECT ... GROUP BY region |
| `refine` | 在上条SQL基础上修改WHERE条件 | "只看华东地区" → 添加 AND region='华东' |
| `drill_down` | 增加GROUP BY维度 + 保留原维度 | "按城市拆分" → 添加 city 到 GROUP BY |
| `roll_up` | 减少GROUP BY维度 | "只看全国汇总" → 移除 region 从 GROUP BY |
| `compare` | 增加对比计算（CASE WHEN / UNION / LAG） | "和去年同期对比" → 添加同比计算列 |
| `explain` | 不执行SQL，解释上条SQL含义 | "这个查询是什么意思" → 文字解释 |
| `sort` | 修改ORDER BY | "按销售额降序" → 添加/修改 ORDER BY |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `ChatInput.tsx` | 可选 | 快捷意图按钮：用户可点击"下钻"/"对比"/"筛选"等预设意图 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| "按城市拆分" | LLM可能从头生成新SQL | 系统识别为drill_down，在上条SQL基础上增加GROUP BY |
| "只看华东" | LLM可能生成完全不同的SQL | 系统识别为refine，仅修改WHERE条件 |

---

### P1-5 错误SQL反模式学习

#### 现状

- `sql_query_history` 记录了失败SQL的 `error_message`，但从未被利用
- `syncQueryExamplesFromHistory()` 只同步成功查询
- LLM 可能反复生成相同的错误SQL模式
- 没有任何机制让 LLM 知道"哪些SQL模式经常失败"

#### 改进后

- 从 `sql_query_history` 聚合高频失败SQL模式
- 在系统提示词中注入"反模式"警告
- 失败SQL按错误类型分类（语法错误/表不存在/列不存在/超时等）
- 反模式与 schema_annotations 关联（标记"易错列"）

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `store.ts` | 新增函数 | `getTopErrorPatterns(datasourceId, limit)` — 聚合Top N高频错误模式 |
| `store.ts` | 新增函数 | `getErrorPatternsByTable(datasourceId, tableName)` — 按表聚合错误 |
| `prompt-builder.ts` | 修改 | 注入反模式警告："⚠️ 以下SQL模式经常失败，请避免：1. 在orders表中引用amount列（正确列名为order_amount）..." |
| `lookup-examples.ts` | 修改 | 排除与高频错误SQL相似的示例 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `InsightsPage.tsx` | 新增区块 | "常见查询错误"卡片：错误类型分布、高频失败SQL列表 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| LLM生成错误SQL | 反复犯错 | 系统注入反模式警告，LLM主动规避 |
| 查看Insights | 无错误统计 | 可看到常见错误模式、易错列提示 |

---

### P2-1 Schema大小自适应策略

#### 现状

- `discover_schema` 返回全量schema（所有表/列/外键/注释/域值）
- 大数据库可能有数百张表，全部返回会撑爆LLM上下文窗口
- 没有schema大小检测或自适应逻辑
- `formatSchemaForPrompt()` 无大小限制

#### 改进后

- 三级自适应策略：全量注入 → 核心表全量+边缘表摘要 → schema linking过滤
- 计算 `formatSchemaForPrompt()` 输出的token数
- 当schema过大时，按用户问题相关性筛选表

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `discovery.ts` | 新增函数 | `estimateSchemaTokenCount(schema)` — 估算schema token数 |
| `discovery.ts` | 新增函数 | `filterSchemaByRelevance(schema, question, maxTokens)` — 按相关性筛选表 |
| `discovery.ts` | 新增函数 | `summarizeTableSchema(tableSchema)` — 表级摘要（仅表名+列名列表，无详细注释） |
| `discover-schema.ts` (tool) | 修改 | 根据schema大小选择策略：全量/摘要/子集 |

#### 自适应策略

| Schema Token 数 | 策略 | 行为 |
|----------------|------|------|
| < 4000 tokens | 全量注入 | 所有表/列/注释/域值完整返回 |
| 4000-8000 tokens | 混合策略 | 核心表（与问题相关的）全量 + 边缘表仅摘要 |
| > 8000 tokens | Schema Linking | 仅返回与用户问题相关的表和列 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| 无直接前端改动 | — | 此项为纯后端优化 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 小数据库(<50表) | 正常工作 | 无变化 |
| 大数据库(200+表) | 可能token溢出/LLM困惑 | 自动筛选相关表，保证核心信息完整 |

---

### P2-2 语义层扩展

#### 现状

- `buildSemanticSql()` 只支持基础 SELECT-FROM-JOIN-WHERE-GROUP BY
- 缺少：窗口函数（累计/同比环比）、HAVING、ORDER BY、子查询/CTE
- 不支持 Derived 类型指标（如 `revenue - cost`）
- 时间维度无粒度层级（日/周/月/季/年）
- metric 保存时无强制SQL验证

#### 改进后

- 支持窗口函数（累计指标、同比环比计算）
- 支持 Derived 类型指标（引用其他metric）
- 时间维度增加粒度层级
- 保存metric时自动 EXPLAIN 验证
- buildSemanticSql 支持 HAVING/ORDER BY

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `semantic-sql-builder.ts` | 扩展 | 支持窗口函数：`SUM(amount) OVER (PARTITION BY dim ORDER BY date)` |
| `semantic-sql-builder.ts` | 扩展 | 支持 HAVING：metric.filters 中增加 `having` 类型 |
| `semantic-sql-builder.ts` | 扩展 | 支持 ORDER BY：从 metric.default_sort 读取 |
| `semantic-sql-builder.ts` | 扩展 | 支持 CTE：Derived 类型指标 `WITH base AS (...), derived AS (SELECT ... FROM base)` |
| `store.ts` | DB迁移 | `semantic_metrics` 增加 `metric_type TEXT DEFAULT 'simple'`（simple/derived/cumulative/ratio） |
| `store.ts` | DB迁移 | `semantic_metrics` 增加 `depends_on TEXT`（依赖的其他metric名称JSON数组） |
| `store.ts` | DB迁移 | `semantic_metrics` 增加 `default_sort TEXT`（排序规则JSON） |
| `store.ts` | DB迁移 | `semantic_dimensions` 增加 `grain TEXT`（时间粒度：day/week/month/quarter/year） |
| `store.ts` | DB迁移 | `semantic_dimensions` 增加 `date_column TEXT`（对应的时间列名） |
| `routes/semantic.ts` | 修改 | 创建/更新 metric 时自动执行 `EXPLAIN` 验证SQL语法 |
| `types.ts` | 修改 | `SemanticMetric` 增加 `metric_type`、`depends_on`、`default_sort` 字段 |
| `types.ts` | 修改 | `SemanticDimension` 增加 `grain`、`date_column` 字段 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `MetricForm.tsx` | 修改 | 增加 metric_type 选择器（Simple/Derived/Cumulative/Ratio） |
| `MetricForm.tsx` | 修改 | Derived类型时显示"依赖指标"选择器 |
| `DimensionForm.tsx` | 修改 | 时间维度增加 grain 选择器（日/周/月/季/年） |
| `MetricsPage.tsx` | 修改 | 指标列表显示类型标签 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 定义"累计销售额"指标 | 不可能（不支持窗口函数） | 选择 Cumulative 类型，自动生成窗口函数SQL |
| 定义"利润率"指标 | 不可能（不支持Derived） | 选择 Ratio 类型，引用 revenue 和 cost 两个指标 |
| 问"按月看销售额趋势" | LLM自由生成，可能不准确 | 时间维度有grain属性，自动按月聚合 |
| 保存metric | 无验证，可能SQL语法错误 | 自动EXPLAIN验证，语法错误时提示 |

---

### P2-3 增强数据采样

#### 现状

- `discoverValueDomains()` 采样枚举值（50个以内）和数值范围（min/max/avg）
- 缺少时间列的日期范围和分布
- 缺少表行数信息
- 缺少列的 null_percentage 和 distinct_count
- LLM 无法判断列的区分度和数据质量

#### 改进后

- 时间列采样 MIN/MAX/分布
- 注入表行数到 prompt
- 增加 null_percentage 和 distinct_count
- 增加列间关系提示（如 order_id 与 orders.id 的对应关系）

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `discovery.ts` | 新增函数 | `discoverTimeColumnRanges(datasourceId, tables)` — 采样时间列的 MIN/MAX |
| `discovery.ts` | 新增函数 | `discoverTableStats(datasourceId)` — 获取表行数估计 |
| `discovery.ts` | 新增函数 | `discoverColumnStats(datasourceId, tableName)` — null_rate/distinct_count |
| `discovery.ts` | 新增函数 | `discoverColumnRelationships(datasourceId)` — 列间关系推断 |
| `discover-schema.ts` (tool) | 修改 | `formatSchemaForPrompt()` 注入统计信息 |

#### 增强后的Schema Prompt格式

```
Table: orders (≈1,250,000 行)
  Columns:
    id (INT, PK, NOT NULL) — 订单ID
    customer_id (INT, NOT NULL) → customers.id  — 客户ID (1,200 distinct values, 0% null)
    order_date (DATE, NOT NULL) — 订单日期 (范围: 2023-01-01 ~ 2026-06-20)
    status (VARCHAR) — 订单状态 [enum: pending/shipped/delivered/cancelled] (4 distinct, 0% null)
    amount (DECIMAL, NULL) — 订单金额 (range: 0.01 ~ 999,999.99, 2% null)
```

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `EntryDetail.tsx` | 修改 | 数据字典详情页展示增强统计信息 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| LLM判断是否需要LIMIT | 不知道表有多大 | 看到行数估计，自动加LIMIT |
| 时间筛选查询 | 不知道数据时间范围 | 看到日期范围，生成合理的BETWEEN条件 |
| 遇到null值 | 不知道哪些列有空值 | 看到null_rate，可能添加IS NOT NULL |

---

### P2-4 数据血缘及追踪

#### 现状

- 没有数据血缘（Data Lineage）概念
- 无法追踪某个查询结果的数据来源链路
- 无法追踪某个表的下游使用（哪些查询/指标/仪表板引用了它）
- 语义层定义的 metric 依赖关系不明确
- 修改表结构时无法评估影响范围

#### 改进后

- 建立 SQL→表→列 的血缘关系图
- 语义层 metric 的依赖链追踪（哪些metric引用了哪些表/列/其他metric）
- 表结构变更影响分析（修改某列会影响哪些metric/查询/仪表板）
- 血缘可视化展示（表级和列级）

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `store.ts` | 新增表 | `column_lineage` 表：`id, datasource_id, source_table, source_column, target_type(metric/query/bookmark), target_id, target_name, created_at` |
| `store.ts` | 新增函数 | `saveColumnLineage(lineage)` — 保存血缘关系 |
| `store.ts` | 新增函数 | `getUpstreamLineage(datasourceId, tableName, columnName?)` — 查询上游血缘 |
| `store.ts` | 新增函数 | `getDownstreamImpact(datasourceId, tableName, columnName?)` — 查询下游影响 |
| `store.ts` | 新增函数 | `rebuildLineageForDatasource(datasourceId)` — 重建血缘（扫描所有SQL和metric定义） |
| 🆕 `lineage-parser.ts` | 新增文件 | SQL解析器：从SQL中提取表→列引用关系（使用简单正则或SQL parser库） |
| `execute-sql.ts` | 修改 | SQL执行成功后，解析SQL并保存血缘到 `column_lineage` |
| `routes/semantic.ts` | 修改 | metric保存时解析 `sql_expression` 并保存血缘 |
| `routes/bookmarks.ts` | 修改 | bookmark保存时解析SQL并保存血缘 |
| 🆕 `routes/lineage.ts` | 新增文件 | 血缘API：`GET /api/datasources/:dsId/lineage/upstream?table=xxx`、`GET /api/datasources/:dsId/lineage/downstream?table=xxx` |
| `index.ts` | 修改 | 注册 lineage 路由 |
| `types.ts` | 新增接口 | `ColumnLineage { id, datasource_id, source_table, source_column, target_type, target_id, target_name }` |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| 🆕 `LineageGraph.tsx` | 新增文件 | 血缘关系可视化组件（使用D3.js或reactflow渲染DAG图） |
| `DictionaryPage.tsx` | 修改 | 数据字典增加"血缘"Tab页，展示选中表的上游/下游关系 |
| `SchemaPage.tsx` | 修改 | Schema页面增加"影响分析"按钮：修改某表/列前查看下游影响 |
| `MetricsPage.tsx` | 修改 | 指标详情展示依赖的表/列列表 |
| `api/client.ts` | 修改 | 增加 `getUpstreamLineage()`、`getDownstreamImpact()` API |

#### 数据模型变更

```sql
CREATE TABLE column_lineage (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_column TEXT,
  target_type TEXT NOT NULL,  -- 'metric' | 'query' | 'bookmark' | 'scheduled_query'
  target_id TEXT NOT NULL,
  target_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_lineage_source ON column_lineage(datasource_id, source_table);
CREATE INDEX idx_lineage_target ON column_lineage(target_type, target_id);
```

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 修改表结构 | 无法评估影响范围 | 查看下游影响：哪些metric/查询/仪表板会受影响 |
| 查看数据字典 | 仅看到表/列定义 | 增加"血缘"Tab，可视化展示数据流向 |
| metric定义错误 | 不清楚影响范围 | 展示依赖链：哪些其他metric依赖当前metric |
| 数据异常排查 | 需要人工追溯来源 | 通过血缘图快速定位数据来源 |

---

### P2-5 协作与共享

#### 现状

- `query_bookmarks` 表支持保存SQL查询为书签
- Insight 页面展示书签卡片，可执行书签SQL
- 但缺少：共享机制（用户间共享查询/仪表板）、评论/讨论、版本控制、权限管理
- 当前系统假定单用户使用

#### 改进后

- 查询共享：用户可将查询/书签分享给团队其他成员
- 仪表板共享：Insights页面的图表组合可保存为仪表板并分享
- 评论/讨论：对查询结果添加评论，团队协作分析
- 查询模板：将高频查询保存为模板，团队可一键使用
- 权限控制：数据源级别的读写权限管理

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `store.ts` | 新增表 | `users` 表：`id, name, email, role, created_at` |
| `store.ts` | 新增表 | `shared_items` 表：`id, item_type(bookmark/dashboard/template), item_id, shared_by, shared_with, permission(view/edit), created_at` |
| `store.ts` | 新增表 | `comments` 表：`id, item_type, item_id, user_id, content, parent_comment_id, created_at` |
| `store.ts` | 新增表 | `dashboards` 表：`id, datasource_id, name, layout(JSON), created_by, is_shared, created_at, updated_at` |
| `store.ts` | 新增表 | `query_templates` 表：`id, datasource_id, name, description, sql_template, parameters(JSON), category, created_by, usage_count, created_at` |
| `store.ts` | 新增表 | `datasource_permissions` 表：`id, datasource_id, user_id, permission(query/manage/admin)` |
| `store.ts` | 新增函数 | 各CRUD函数：`createDashboard()`、`shareItem()`、`addComment()`、`createQueryTemplate()` 等 |
| 🆕 `routes/sharing.ts` | 新增文件 | 共享API：`POST /api/share`、`GET /api/shared-with-me`、`POST /api/comments` |
| 🆕 `routes/dashboards.ts` | 新增文件 | 仪表板API：CRUD + 共享 |
| 🆕 `routes/templates.ts` | 新增文件 | 模板API：CRUD + 使用统计 |
| `index.ts` | 修改 | 注册新路由 |
| `types.ts` | 新增接口 | `User`、`SharedItem`、`Comment`、`Dashboard`、`QueryTemplate`、`DatasourcePermission` |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| 🆕 `DashboardEditor.tsx` | 新增文件 | 仪表板编辑器：拖拽布局 + 图表组件 |
| 🆕 `ShareDialog.tsx` | 新增文件 | 分享弹窗：选择用户/权限 |
| 🆕 `CommentSection.tsx` | 新增文件 | 评论组件：评论列表 + 添加评论 |
| 🆕 `TemplateGallery.tsx` | 新增文件 | 模板库：分类浏览 + 一键使用 |
| `InsightsPage.tsx` | 修改 | 增加"保存为仪表板"按钮 |
| `BookmarkDialog.tsx` | 修改 | 增加"分享"和"保存为模板"按钮 |
| `ChatWindow.tsx` | 修改 | 查询结果区域增加"评论"按钮 |
| `App.tsx` | 修改 | AppView 增加 `"dashboard"` 和 `"templates"` |

#### 数据模型变更

```sql
-- 用户（简化版，初期可不接入认证系统）
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT DEFAULT 'user',  -- 'admin' | 'user'
  created_at TEXT NOT NULL
);

-- 共享
CREATE TABLE shared_items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,   -- 'bookmark' | 'dashboard' | 'template' | 'conversation'
  item_id TEXT NOT NULL,
  shared_by TEXT NOT NULL,
  shared_with TEXT,          -- NULL = 公开, 具体user_id = 指定用户
  permission TEXT DEFAULT 'view',  -- 'view' | 'edit'
  created_at TEXT NOT NULL
);

-- 评论
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  parent_comment_id TEXT,    -- 支持回复
  created_at TEXT NOT NULL
);

-- 仪表板
CREATE TABLE dashboards (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  name TEXT NOT NULL,
  layout TEXT NOT NULL,      -- JSON: 图表布局配置
  created_by TEXT NOT NULL,
  is_shared INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 查询模板
CREATE TABLE query_templates (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sql_template TEXT NOT NULL,
  parameters TEXT,            -- JSON: 可参数化变量 [{name, type, default}]
  category TEXT,
  created_by TEXT NOT NULL,
  usage_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 数据源权限
CREATE TABLE datasource_permissions (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permission TEXT NOT NULL,  -- 'query' | 'manage' | 'admin'
  created_at TEXT NOT NULL,
  UNIQUE(datasource_id, user_id)
);
```

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 想分享好的查询 | 复制SQL发给同事 | 一键分享到团队，同事直接使用 |
| 想做仪表板 | 不支持 | Insights页面组合图表后保存为仪表板 |
| 团队协作分析 | 各自独立 | 评论/讨论功能，团队共享分析结果 |
| 高频查询模板 | 每次重新输入 | 保存为模板，团队一键使用 |
| 数据源权限 | 所有用户平等 | 管理员可控制谁能查询哪些数据源 |

---

### P3-1 多候选SQL生成

#### 现状

- 每次只生成一条SQL
- LLM不确定时没有备选方案
- 无法通过执行结果对比选择最优SQL

#### 改进后

- 对高不确定性查询（首次查询某表、复杂JOIN），生成2-3个候选SQL
- 执行所有候选，对比结果一致性
- 选择结果一致且正确的SQL作为最终答案

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `prompt-builder.ts` | 修改 | 系统提示词增加："当查询涉及3个以上表JOIN或首次查询某表时，请生成2个不同写法的SQL候选" |
| `execute-sql.ts` | 修改 | 支持批量执行候选SQL，返回对比结果 |
| `chat-handler.ts` | 修改 | 候选SQL的选择逻辑 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `MessageItem.tsx` | 修改 | 展示候选SQL对比：显示多个SQL及其执行结果 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 复杂JOIN查询 | 只有一条SQL，可能错误 | 展示2-3个候选，用户可选择最合理的 |
| API成本 | 每次一条SQL | 高不确定性场景成本翻倍（可配置开关） |

---

### P3-2 结果合理性检查

#### 现状

- 执行结果直接返回，无合理性校验
- 数值可能为负、日期越界、百分比超范围

#### 改进后

- 对数值结果做简单合理性检查
- 对日期结果做范围检查
- 对百分比/比例做 0-100/0-1 范围检查
- 不合理结果添加警告标记

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `execute-sql.ts` | 新增逻辑 | 结果合理性检查函数：检查数值列是否有负值（列名含amount/price/quantity时）、日期是否在合理范围、百分比是否0-100 |
| `schema_annotations` | 扩展 | annotation 中增加 `validation_rules` 字段（JSON: {min, max, type}） |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `TableResult.tsx` | 修改 | 不合理值用警告色高亮 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 查询结果含负数金额 | 不提示 | 显示警告"⚠️ amount列存在负值，可能存在数据质量问题" |

---

### P3-3 统一示例表

#### 现状

- `table_query_examples`：手动创建的per-table查询示例（discover_schema使用）
- `query_examples`：从执行历史自动同步的示例（lookup_examples使用）
- 两个表结构不同、来源不同，LLM可能收到重复或矛盾的示例
- `table_query_examples` 有 `is_verified` 和手动管理
- `query_examples` 有 `success_count` 和自动管理

#### 改进后

- 合并为单一 `query_examples` 表
- 增加 `source` 字段区分来源（'manual' | 'auto' | 'imported'）
- 统一检索接口

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `store.ts` | DB迁移 | `query_examples` 增加 `source TEXT DEFAULT 'auto'` |
| `store.ts` | 迁移脚本 | 将 `table_query_examples` 数据迁移到 `query_examples`（source='manual'） |
| `discover-schema.ts` | 修改 | 使用统一的 `listQueryExamples()` 替代 `listQueryExamples(tableName)` |
| `lookup-examples.ts` | 修改 | 使用统一的检索接口 |
| `store.ts` | 废弃 | 标记 `table_query_examples` 相关函数为deprecated |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `SchemaPage.tsx` | 修改 | 查询示例管理使用统一接口 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| LLM看到示例 | 可能收到重复/矛盾示例 | 统一来源，去重后返回 |

---

### P3-4 主动同步query_examples

#### 现状

- `syncQueryExamplesFromHistory()` 仅在 `lookup_examples` 工具被调用时触发
- 新的成功查询不会立即成为示例，存在延迟
- 用户成功执行一个查询后，下一次对话可能还找不到这个示例

#### 改进后

- 在 `execute_sql` 成功后主动触发 `syncQueryExamplesFromHistory()`
- 保持惰性同步作为备份

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `execute-sql.ts` | 修改 | 成功执行后调用 `syncQueryExamplesFromHistory(datasourceId)` |
| `lookup-examples.ts` | 修改 | 保留惰性同步作为备份（防止遗漏） |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| 无 | — | 纯后端改动 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 成功执行查询A | 下次查询可能还找不到A作为示例 | 立即可作为示例被检索 |

---

### P3-5 buildSemanticSql参数化

#### 现状

- `semantic-sql-builder.ts:35` 直接拼接 filter value：`'${f.value}'`
- 如果 value 包含单引号，会造成SQL语法错误或注入
- 没有参数化查询或值转义

#### 改进后

- 对 filter value 使用参数化或转义
- 使用 MySQL 的 `mysql2.escape()` 方法转义值

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `semantic-sql-builder.ts` | 修改 | 将 `'${f.value}'` 改为使用 `escape(f.value)` 或参数化占位符 |
| `semantic-sql-builder.ts` | 新增 | `escapeFilterValue(value)` 函数 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| 无 | — | 纯后端安全修复 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| filter含单引号(如 "O'Brien") | SQL语法错误 | 正确转义，正常执行 |

---

### P3-6 中文分词优化

#### 现状

- `lookup-examples.ts` 使用 `split(/(?=[一-鿿])/)` 将中文拆成单字
- "销售额"被拆成"销""售""额"三字，与"营收"(营/收)无匹配
- `lookup-semantic-layer.ts` 同样使用简单的 `includes()` 子串匹配

#### 改进后

- 集成中文分词库（如 `nodejieba` 或 `@aspect/segmenter`）
- "销售额"→["销售", "销售额", "额"]，"营收"→["营收", "收"]
- "销售"与"营收"可通过同义词表映射

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| 🆕 `tokenizer.ts` | 新增文件 | 中文分词模块：封装分词库调用 + 同义词映射 |
| `lookup-examples.ts` | 修改 | 使用 `tokenize(question)` 替代 `split(/(?=[一-鿿])/)` |
| `lookup-semantic-layer.ts` | 修改 | 使用 `tokenize(query)` + 同义词扩展进行匹配 |
| `package.json` | 修改 | 增加 `nodejieba` 或 `@aspect/segmenter` 依赖 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| 无 | — | 纯后端优化 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 问"各区域营收" | 匹配不到"销售额"示例 | 分词后通过同义词映射匹配 |

---

### P3-7 Schema Cache预加载

#### 现状

- `validator.ts` 的 `schemaCaches` Map 仅在 `discover_schema` 工具被调用时填充
- 如果 LLM 跳过 `discover_schema` 直接执行 SQL，validator 无缓存可校验
- `validateSqlAgainstSchema()` 在无缓存时返回 `{passed: true}`（跳过校验）
- 首次查询可能执行引用不存在表的SQL

#### 改进后

- 在 harness 创建时（`handleInit`）自动调用 `discoverSchema` 填充缓存
- 缓存带TTL，避免频繁刷新

#### 涉及的后端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| `chat-handler.ts` | 修改 | `handleInit()` 中调用 `discoverSchema(datasourceId)` 并 `setSchemaCache()` |
| `validator.ts` | 修改 | `SchemaCache` 增加 `cachedAt` 时间戳，TTL=1小时 |
| `validator.ts` | 修改 | `getSchemaCache()` 检查TTL，过期时返回null触发重新发现 |

#### 涉及的前端改动

| 文件 | 改动类型 | 具体内容 |
|------|---------|---------|
| 无 | — | 纯后端优化 |

#### 用户操作影响

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 首次查询 | 可能引用不存在的表名 | 初始化时已缓存schema，校验生效 |
| LLM跳过discover_schema | 校验被跳过 | 已有缓存，校验正常工作 |

---

## 改动文件汇总

### 后端文件改动矩阵

| 文件 | P0-1 | P0-2 | P0-3 | P1-1 | P1-2 | P1-3 | P1-4 | P1-5 | P2-1 | P2-2 | P2-3 | P2-4 | P2-5 | P3-1 | P3-2 | P3-3 | P3-4 | P3-5 | P3-6 | P3-7 |
|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|
| `store.ts` | ● | ● | | ● | ● | ● | | ● | | ● | | ● | ● | | | ● | ● | | | |
| `execute-sql.ts` | | ● | ● | | | ● | | | | | | ● | | ● | ● | | ● | | | |
| `validator.ts` | | | ● | | | | | | | | | | | | | | | | | ● |
| `lookup-examples.ts` | ● | | | ● | | | ● | ● | | | | | | | | | | | ● | |
| `lookup-semantic-layer.ts` | | | | | | | | | | ● | | | | | | | | ● | |
| `discover-schema.ts` | | | | | | | | | ● | | ● | | | | | | | | | |
| `discovery.ts` | | | | | | | | | ● | | ● | | | | | | | | | |
| `semantic-sql-builder.ts` | | | | | | | | | | ● | | | | | | | ● | | |
| `prompt-builder.ts` | ● | ● | | | ● | | ● | ● | | | | | | ● | | | | | | |
| `chat-handler.ts` | | ● | | | ● | ● | ● | | | | | | | | | | | | | ● |
| `types.ts` | ● | ● | | ● | ● | | | | | ● | | ● | ● | | | ● | | | | |
| `routes/insights.ts` | ● | | | | | | | | | | | | | | | | | | | |
| 🆕 `lineage-parser.ts` | | | | | | | | | | | | ● | | | | | | | | |
| 🆕 `routes/lineage.ts` | | | | | | | | | | | | ● | | | | | | | | |
| 🆕 `routes/sharing.ts` | | | | | | | | | | | | | ● | | | | | | | |
| 🆕 `routes/dashboards.ts` | | | | | | | | | | | | | ● | | | | | | | |
| 🆕 `routes/templates.ts` | | | | | | | | | | | | | ● | | | | | | | |
| 🆕 `embedding-service.ts` | | | | ● | | | | | | | | | | | | | | | |
| 🆕 `query-state.ts` | | | | | ● | | | | | | | | | | | | | | | |
| 🆕 `tokenizer.ts` | | | | | | | | | | | | | | | | | | ● | | |
| `routes/semantic.ts` | | | | | | | | | | ● | | ● | | | | | | | | |
| `routes/bookmarks.ts` | | | | | | | | | | | | ● | | | | | | | | |
| `index.ts` | | | | | | | | | | | | ● | ● | | | | | | | |

### 前端文件改动矩阵

| 文件 | P0-1 | P0-2 | P0-3 | P1-1 | P1-2 | P1-3 | P1-4 | P1-5 | P2-1 | P2-2 | P2-3 | P2-4 | P2-5 | P3-1 | P3-2 | P3-3 | P3-4 | P3-5 | P3-6 | P3-7 |
|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|
| `MessageItem.tsx` | ● | ● | ● | | | | | | | | | | | ● | | | | | | |
| `InsightsPage.tsx` | ● | | | | | | | ● | | | | | ● | | | | | | | |
| `api/client.ts` | ● | | | | | | | | | | | ● | ● | | | | | | | |
| `ChatWindow.tsx` | | ● | | | ● | | | | | | | | | | | | | | | |
| `useAgentStream.ts` | | ● | | | | | | | | | | | | | | | | | | |
| `ChatInput.tsx` | | | | | | | ● | | | | | | | | | | | | | |
| `MetricForm.tsx` | | | | | | | | | | ● | | | | | | | | | | |
| `DimensionForm.tsx` | | | | | | | | | | ● | | | | | | | | | | |
| `EntryDetail.tsx` | | | | | | | | | | | ● | | | | | | | | | |
| `DictionaryPage.tsx` | | | | | | | | | | | | ● | | | | | | | | |
| `SchemaPage.tsx` | | | | | | | | | | | | ● | | | | ● | | | | |
| `MetricsPage.tsx` | | | | | | | | | | | | ● | | | | | | | | |
| `BookmarkDialog.tsx` | | | | | | | | | | | | | ● | | | | | | | |
| `TableResult.tsx` | | | | | | | | | | | | | | | ● | | | | | |
| 🆕 `LineageGraph.tsx` | | | | | | | | | | | | ● | | | | | | | | |
| 🆕 `DashboardEditor.tsx` | | | | | | | | | | | | | ● | | | | | | | |
| 🆕 `ShareDialog.tsx` | | | | | | | | | | | | | ● | | | | | | | |
| 🆕 `CommentSection.tsx` | | | | | | | | | | | | | ● | | | | | | | |
| 🆕 `TemplateGallery.tsx` | | | | | | | | | | | | | ● | | | | | | | |
| `App.tsx` | | | | | | | | | | | | | ● | | | | | | | |

### 数据库迁移汇总

| 优化项 | 新增表 | 修改表 | 新增索引 |
|--------|--------|--------|---------|
| P0-1 | — | `query_feedback` +2列 | — |
| P0-2 | — | `sql_query_history` +3列 | — |
| P1-1 | — | `query_examples` +1列 | — |
| P1-2 | `query_state` | — | — |
| P2-2 | — | `semantic_metrics` +3列, `semantic_dimensions` +2列 | — |
| P2-4 | `column_lineage` | — | 2个索引 |
| P2-5 | `users`, `shared_items`, `comments`, `dashboards`, `query_templates`, `datasource_permissions` | — | 多个索引 |

---

*文档完 — 可基于此逐一讨论各优化项的实施细节*
