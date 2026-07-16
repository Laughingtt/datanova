# DataNova 查询准确性深度分析报告

> **版本**: v2.0 | **日期**: 2026-06-26 | **分析方法**: 三智能体并行分析（查询流程 + NL2SQL最佳实践 + 数据缺口）

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [当前查询流程全景图](#2-当前查询流程全景图)
3. [改进后查询流程全景图](#3-改进后查询流程全景图)
4. [数据辅助机制现状评估](#4-数据辅助机制现状评估)
5. [反馈循环分析：已建立 vs 断裂](#5-反馈循环分析已建立-vs-断裂)
6. [数据缺口与遗漏维度](#6-数据缺口与遗漏维度)
7. [业界最佳实践对标](#7-业界最佳实践对标)
8. [改进建议与优先级](#8-改进建议与优先级)
9. [实施路线图](#9-实施路线图)
10. [参考文献](#10-参考文献)

> 📋 **优化项详细规格文档**：[optimization-specs.md](./optimization-specs.md) — 每个优化项的现状、改进后、涉及内容、前后端影响、用户操作影响、数据模型变更

---

## 1. 执行摘要

DataNova 作为 AI 驱动的 SQL 查询助手，已构建了从数据源连接→Schema发现→语义层匹配→历史示例检索→SQL生成→执行校验的完整链路。**当前系统的核心优势在于**：语义层优先策略（确定性SQL优于LLM自由生成）、Schema注释与域值发现、历史查询自动同步为Few-Shot示例。

**但系统存在三个关键短板**：

| 短板           | 严重度   | 核心问题                                    |
| ------------ | ----- | --------------------------------------- |
| **反馈闭环断裂**   | 🔴 关键 | 用户反馈（👍👎）被存储但从未回传，错误SQL模式未被学习，性能数据未被利用 |
| **上下文检索粗糙**  | 🟡 重要 | 关键词匹配遗漏语义等价查询，中文分词精度低，示例选择无多样性策略        |
| **校验与自修复不足** | 🟡 重要 | 只校验表名不校验列名，无结构化Self-Correction，无结果合理性检查 |

本报告将逐一展开分析，并给出分优先级的改进建议。

---

## 2. 当前查询流程全景图（改进前基线）

> ⚠️ 此为改进前基线，改进后流程见[第3节](#3-改进后查询流程全景图)

### 2.1 端到端数据流

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
    ├── getRecentSqlContext(datasourceId, 3) ← sql_query_history 最近3条成功查询
    └── harness.prompt(contextPrefix + text)
    │
    ▼
[4] AgentHarness 多轮工具调用循环
    │
    ├── [4a] lookup_semantic_layer ───────────── 优先级1
    │   ├── listMetrics() → 过滤 published 状态
    │   ├── listDimensions() → 关键词匹配
    │   ├── listModels() → 找关联 model
    │   ├── buildSemanticSql() → 确定性SQL生成
    │   └── 返回: metric定义 + generated_sql + dimensions + models
    │
    ├── [4b] lookup_examples ────────────────── 优先级2
    │   ├── syncQueryExamplesFromHistory() ← sql_query_history → query_examples
    │   ├── listAutoQueryExamples() → query_examples 表
    │   ├── getQueryExecutionStats() ← sql_query_history 聚合
    │   └── 关键词匹配 + 评分排序 → top3 Few-Shot 示例
    │
    ├── [4c] discover_schema ────────────────── 优先级3（兜底/前置）
    │   ├── discoverSchema() ← INFORMATION_SCHEMA
    │   ├── getAnnotations() ← schema_annotations (仅 confirmed)
    │   ├── listQueryExamples() ← table_query_examples (手动验证)
    │   ├── formatSchemaForPrompt() → 文本格式化
    │   └── setSchemaCache() → validator 缓存
    │
    └── [4d] execute_sql ───────────────────── 最终执行
        ├── validateSqlAgainstSchema() → 表名校验 + 只读校验
        ├── checkLargeTableWithoutWhere() → 大表无WHERE警告
        ├── executeSql() → MySQL执行 (30s timeout, 1000 row limit)
        ├── createSqlQueryHistory() → 记录到 sql_query_history
        └── 格式化结果 (最多20行给LLM, 全量给前端)
    │
    ▼
[5] AgentHarness 返回最终文本响应
    │
    ▼
[6] chat-handler.ts :: saveMessage() 持久化助手消息(含steps)
    │
    ▼
[7] forwardEvent() → WebSocket → processWsEvent() → React渲染
```

### 2.2 每个环节的数据/上下文清单

| 环节 | 数据源 | 传递给LLM | 仅存储未回传 |
|------|--------|-----------|-------------|
| **chat-handler** | `sql_query_history` | ✅ 最近3条成功查询 (question/sql/tables/rows/time) | ❌ 全量历史、conversation_id |
| **lookup_semantic_layer** | `semantic_metrics` | ✅ name, display_name, sql_expression, filters, aliases | - |
| | `semantic_dimensions` | ✅ name, display_name, sql_expression, data_type, values | - |
| | `semantic_models` | ✅ name, base_table, joins, metrics列表 | - |
| **lookup_examples** | `query_examples` | ✅ top3: question, sql, tables, success_count, verified | ❌ 其余47条(限制50) |
| | `sql_query_history`(聚合) | ✅ per-SQL successCount/errorCount/avgTimeMs | ❌ 原始执行记录 |
| **discover_schema** | `INFORMATION_SCHEMA` | ✅ 表名/列名/类型/默认值/注释/外键 | ❌ 索引信息、行数统计 |
| | `schema_annotations` | ✅ 仅 confirmed 的注释 + domain_type + domain_values | ❌ draft 状态注释 |
| | `table_query_examples` | ✅ 手动验证的per-table查询示例 | - |
| **execute_sql** | `schema_cache`(内存) | - | ❌ 仅用于validator校验 |
| | `INFORMATION_SCHEMA.TABLES` | ✅ 大表警告(>100K行无WHERE) | ❌ 行数统计未注入prompt |
| **系统提示词** | `datasources` | ✅ 所有enabled数据源列表 | - |
| | `skills/` | ✅ SKILL.md 文件内容 | - |
| | `query_feedback` | ❌ **完全未回传** | ❌ 用户👍👎反馈 |
| | `sql_query_history`(错误) | ❌ **完全未回传** | ❌ 失败SQL及错误信息 |

---

## 3. 改进后查询流程全景图

### 3.1 改进后端到端数据流

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

### 3.2 改进后每个环节的数据/上下文清单

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

### 3.3 改进前后数据流对比

| 数据维度 | 改进前 | 改进后 | 对应优化项 |
|---------|--------|--------|-----------|
| 用户反馈 | 写入即沉睡 | 降权/提权示例 + 反模式注入 | P0-1 |
| 错误SQL | 仅记录 | 反模式学习 + prompt注入 | P1-5 |
| 修正历史 | 不存在 | 3轮修正链 + parent_query_id追踪 | P0-2 |
| 列名校验 | 不存在 | schema_cache含列名 + Levenshtein建议 | P0-3 |
| 示例检索 | 关键词top3 | embedding+MMR top5 + 意图感知 | P1-1 |
| 查询上下文 | 3条文本拼接(跨对话污染) | QueryState结构化 + conversation隔离 | P1-2, P1-3 |
| 意图处理 | 自然语言指导 | 结构化意图→SQL修改规则表 | P1-4 |
| Schema大小 | 全量注入(可能溢出) | 三级自适应(全量/摘要/子集) | P2-1 |
| 语义层 | 基础SELECT-JOIN-GROUP BY | 窗口函数/CTE/Derived/时间粒度 | P2-2 |
| 数据采样 | 枚举值+数值范围 | +时间范围/行数/null率/distinct_count | P2-3 |
| 数据血缘 | 不存在 | SQL→表→列血缘图 + 影响分析 | P2-4 |
| 协作共享 | 仅书签 | 仪表板/评论/模板/权限 | P2-5 |

---

## 4. 数据辅助机制现状评估

### 4.1 已有的数据辅助机制（✅ 有效）

#### 4.1.1 语义层优先策略

**机制**：`lookup_semantic_layer` → `buildSemanticSql()` 优先于 LLM 自由生成

**评估**：⭐⭐⭐⭐ 这是当前最有效的准确性保障。确定性SQL构建避免了LLM的不确定性，对于已定义的metric/dimension组合，准确率接近100%。

**局限**：
- `buildSemanticSql` 只支持基础 SELECT-FROM-JOIN-WHERE-GROUP BY 模式
- 缺少窗口函数（累计指标、同比环比）、HAVING、ORDER BY、子查询/CTE
- 不支持 Derived 类型指标（如 `revenue - cost`）

#### 4.1.2 Schema注释与域值发现

**机制**：`discoverValueDomains()` + `schema_annotations` → `formatSchemaForPrompt()`

**评估**：⭐⭐⭐⭐ 显著帮助 LLM 理解业务语义。枚举值列表（如 status: ['active', 'inactive', 'pending']）让 LLM 能精确使用 WHERE 条件。

**局限**：
- 仅注入 confirmed 状态注释，draft 注释被忽略
- 缺少时间列的日期范围采样（对时间筛选查询至关重要）
- 缺少表行数信息（影响 LLM 判断是否需要 LIMIT）

#### 4.1.3 历史查询自动同步

**机制**：`syncQueryExamplesFromHistory()` → 成功≥2次的SQL自动成为Few-Shot示例

**评估**：⭐⭐⭐ 有效利用了执行历史。高频成功的SQL模式能间接提升后续相似查询的准确性。

**局限**：
- 同步是惰性的（仅在 `lookup_examples` 被调用时触发）
- 只同步成功查询，错误SQL模式未被学习
- 阈值"成功≥2次"无数据支撑

#### 4.1.4 最近SQL上下文注入

**机制**：`getRecentSqlContext(datasourceId, 3)` → 拼接到 prompt 前缀

**评估**：⭐⭐⭐ 支持多轮对话中的 refine/drill_down/compare 意图。

**局限**：
- **按 datasource_id 查询而非 conversation_id** — 跨对话上下文污染
- 硬编码 limit=3，复杂分析场景可能不够
- 不区分当前用户，多用户场景会互相干扰

### 4.2 数据辅助机制缺失项（❌ 需补充）

| 缺失项 | 影响范围 | 严重度 |
|--------|---------|--------|
| 用户反馈闭环 | 查询质量持续优化 | 🔴 关键 |
| 列名校验 | SQL执行成功率 | 🟡 重要 |
| 语义相似度检索 | 查询示例覆盖面 | 🟡 重要 |
| 错误SQL反模式学习 | 避免重复错误 | 🟡 重要 |
| 结构化多轮上下文 | 多轮对话准确性 | 🟡 重要 |
| Schema大小自适应 | 大数据库token溢出 | 🟠 中等 |
| 时间维度标准化 | 时间分析查询 | 🟠 中等 |
| 执行计划信息 | 查询性能优化 | 🟢 次要 |

---

## 5. 反馈循环分析：已建立 vs 断裂

### 5.1 已建立的反馈循环

```
sql_query_history ──(syncQueryExamplesFromHistory)──→ query_examples ──(lookup_examples)──→ LLM Few-Shot
     ↑                                                                                    ↓
     │                                                                              生成更准确的SQL
     │                                                                                    │
     └──────────────────────────(createSqlQueryHistory)──────────────────────────────────┘

schema_annotations ──(getAnnotations, confirmed only)──→ formatSchemaForPrompt ──→ LLM Schema理解
```

### 5.2 断裂的反馈循环

#### 🔴 断裂1：用户反馈 → 无回传

```
用户点击👎 ──(saveFeedback)──→ query_feedback 表 ──❌ 无读取路径──→ /dev/null
```

**问题**：`query_feedback` 表有完整的 `rating`、`issue_type`、`issue_detail` 字段，但**从未被任何代码读取**。没有 `listFeedback()` 或 `getFeedbackByMessage()` 导出函数。用户明确告诉系统"这个查询有问题"，系统完全忽略。

**影响**：这是当前最大的数据浪费。用户反馈是最高质量的训练信号。

#### 🔴 断裂2：错误SQL → 无学习

```
execute_sql失败 ──(createSqlQueryHistory, status=error)──→ sql_query_history ──❌ 无回传──→ /dev/null
```

**问题**：`sql_query_history` 记录了失败SQL的 `error_message`，但错误模式从未被用于：
- 排除错误示例
- 学习常见错误模式
- 提示LLM避免类似错误

#### 🟡 断裂3：执行性能 → 无优化

```
慢查询记录 ──(execution_time_ms)──→ sql_query_history ──❌ 无回传──→ /dev/null
```

**问题**：慢查询数据未用于标记低效SQL、建议优化、或在示例中降权慢查询。

#### 🟡 断裂4：conversation_id → 无关联

```
execute_sql ──(conversation_id: null)──→ sql_query_history ──❌ 硬编码null──→ 无法关联对话
```

**问题**：`execute_sql` 工具无法获取当前 `conversation_id`，导致历史记录无法关联到具体对话，多轮对话上下文追踪断裂。

---

## 6. 数据缺口与遗漏维度

### 6.1 数据收集缺口

| 当前字段                                | 缺失的关键信息  | 建议                                                                      |
| ----------------------------------- | -------- | ----------------------------------------------------------------------- |
| `sql_query_history.question`        | 用户原始意图分类 | 增加 `intent_type` 字段（new_query/refine/drill_down/compare/explain）        |
| `sql_query_history.conversation_id` | 硬编码 null | 传入实际 conversation_id                                                    |
| `sql_query_history`                 | 查询修正追踪   | 增加 `parent_query_id` 追踪SQL修正链                                           |
| `sql_query_history`                 | 执行计划信息   | 增加 `explain_plan` 字段（可选）                                                |
| `query_feedback`                    | 细粒度反馈    | 增加 `feedback_category`：wrong_result/slow_query/wrong_table/missing_data |
| `query_feedback`                    | 关联SQL    | 增加 `sql_query_history_id` 外键                                            |
| `schema_annotations`                | 利用率      | draft 注释也应可被检索，标注置信度                                                    |
| `discover_schema`                   | 表行数统计    | 增加 `estimated_row_count` 到 prompt                                       |
| `discover_schema`                   | 时间列范围    | 增加 `date_min`/`date_max` 采样                                             |
| `discover_schema`                   | 列数据分布    | 增加 `null_percentage`、`distinct_count`                                   |

### 6.2 上下文检索缺口

| 当前机制                                      | 缺口     | 影响示例                          |
| ----------------------------------------- | ------ | ----------------------------- |
| 关键词重叠匹配                                   | 无语义相似度 | "销售额" ≠ "营收"，但语义等价            |
| 简单中文分词 `split(/(?=[一-鿿])/)`               | 分词精度低  | "销售额"被拆成"销""售""额"三字           |
| Top-3 最相似                                 | 无多样性策略 | 3个示例可能都是简单JOIN，缺少窗口函数示例       |
| 意图分类（prompt中定义）                           | 未用于检索  | refine意图应检索结构相似SQL，而非语义相似完整查询 |
| `query_examples` + `table_query_examples` | 双表未统一  | LLM可能收到重复或矛盾的示例               |

### 6.3 校验与安全缺口

| 当前校验 | 缺口 | 影响 |
|---------|------|------|
| 表名校验（validator.ts） | 无列名校验 | LLM可能生成不存在的列名（常见幻觉） |
| 大表无WHERE警告 | 无结果集大小预估 | 可能返回超大结果集 |
| SQL白名单（SELECT/SHOW/DESCRIBE/EXPLAIN） | `buildSemanticSql` 注入风险 | filter value 直接拼接 `'${f.value}'` |
| schema_cache 生命周期 | 无预加载 | LLM跳过discover_schema时校验失效 |

### 6.4 竞品对比缺失维度

| 维度              | Metabase      | ThoughtSpot | Tableau AI | Chat2DB    | **DataNova**       |
| --------------- | ------------- | ----------- | ---------- | ---------- | ------------------ |
| 查询意图分类          | ✅ 自动          | ✅ NLU引擎     | ✅ AskData  | ✅ 规则+LLM   | ⚠️ prompt定义但未结构化执行 |
| Self-Correction | ✅ 自动重试        | ✅ 修正建议      | ✅ 结果验证     | ✅ 错误修正     | ❌ 仅靠LLM自行决定        |
| 列名模糊匹配          | ✅ Levenshtein | ✅ 语义匹配      | ✅ 模糊搜索     | ✅ 相似度      | ⚠️ 仅表名有Levenshtein |
| 执行结果可视化推断       | ✅ 自动          | ✅ AI推荐      | ✅ ShowMe   | ✅ 智能推荐     | ⚠️ 需LLM自行判断        |
| 查询性能优化建议        | ✅ Performance | ✅ 优化提示      | ✅ 优化器      | ⚠️ EXPLAIN | ❌ 无                |
| 协作与共享           | ✅ Dashboard   | ✅ Board     | ✅ Workbook | ✅ 分享       | ⚠️ Bookmarks（基础）   |
| 数据血缘追踪          | ✅ Lineage     | ❌           | ✅ 血缘       | ❌          | ❌                  |

---

## 7. 业界最佳实践对标

### 7.1 Schema理解增强

| 方法 | 代表论文/系统 | 核心思路 | DataNova适用性 |
|------|-------------|---------|---------------|
| **全量Schema注入** | "The Death of Schema Linking?" (BIRD榜单#1, 71.83%) | 现代LLM上下文窗口足够时，全量注入优于过滤；不完美schema linking误删必要列代价远大于冗余列噪声 | ⭐⭐⭐ 高 — 当schema能放入上下文时采用全量注入，超出时才做schema linking |
| **Augmentation > Selection > Correction** | 同上 | 三步策略：增广有用上下文 → 选择有效示例 → 修正生成结果 | ⭐⭐⭐ 高 — 当前只有Selection，缺少Augmentation和Correction |
| **数据值理解** | BIRD Benchmark (NeurIPS 2023) | 真实场景中"脏数据"和外部知识是核心瓶颈（人类92.96% vs AI 40.08%） | ⭐⭐⭐ 高 — `discoverValueDomains`已有基础，需增加时间列采样和行数统计 |
| **任务分解式Schema理解** | DIN-SQL (Spider 85.3%) | 先识别相关表 → 确定列和关系 → 生成SQL | ⭐⭐ 中 — 适合大schema场景 |

### 7.2 上下文检索增强

| 方法                | 代表论文/系统                 | 核心思路                                  | DataNova适用性            |
| ----------------- | ----------------------- | ------------------------------------- | ---------------------- |
| **Embedding语义检索** | DAIL-SQL (Spider 86.6%) | 用向量相似度替代关键词重叠，捕获语义等价                  | ⭐⭐⭐ 高 — 解决"销售额"≠"营收"问题 |
| **MMR多样性采样**      | DAIL-SQL                | 在相似度和多样性之间取平衡，避免示例同质                  | ⭐⭐⭐ 高 — 低成本高收益         |
| **一致性解码+执行过滤**    | SQL-PaLM                | 生成多候选SQL，执行过滤错误结果，self-consistency选最优 | ⭐⭐ 中 — 成本翻倍但提升显著       |
| **双向数据增强**        | CodeS (SIGMOD 2024)     | NL→SQL和SQL→NL双向增强训练数据                 | ⭐ 低 — 需要模型微调，不适合当前架构   |

### 7.3 语义层设计

| 方法                   | 代表系统               | 核心思路                                                        | DataNova适用性             |
| -------------------- | ------------------ | ----------------------------------------------------------- | ----------------------- |
| **5种指标类型**           | dbt Semantic Layer | Simple/Cumulative/Derived/Ratio/Conversion + MetricFlow依赖解析 | ⭐⭐⭐ 高 — 当前只支持Simple，需扩展 |
| **Pre-aggregations** | Cube.dev           | 预聚合缓存 + Semantic SQL接口                                      | ⭐⭐ 中 — 性能优化场景           |
| **时间粒度标准化**          | dbt + Cube         | `agg_time_dimension` + grain（日/周/月/季/年）                     | ⭐⭐⭐ 高 — 时间分析查询的基础       |

### 7.4 数据质量与校验

| 方法                 | 代表论文/系统                    | 核心思路                             | DataNova适用性          |
| ------------------ | -------------------------- | -------------------------------- | -------------------- |
| **Self-Debugging** | arXiv:2304.05128           | LLM生成后解释代码并检查执行结果，Spider最难题目提升9% | ⭐⭐⭐ 高 — 低成本高收益       |
| **多Agent修正**       | MAC-SQL (COLING 2025 Oral) | 专门修正Agent基于执行错误修复SQL             | ⭐⭐ 中 — 架构变更较大        |
| **列名存在性校验**        | 基础工程实践                     | 从schema_cache校验SQL中引用的列名         | ⭐⭐⭐ 高 — 低成本解决LLM列名幻觉 |

### 7.5 多轮对话与上下文管理

| 方法 | 代表系统 | 核心思路 | DataNova适用性 |
|------|---------|---------|---------------|
| **结构化上下文摘要** | 工程实践 | 每轮注入：上一条SQL + 涉及的表/列/筛选条件 + 结果摘要 | ⭐⭐⭐ 高 — 替代从对话历史推断指代 |
| **QueryState追踪** | 工程实践 | 维护结构化查询状态对象，每轮更新 | ⭐⭐⭐ 高 — 显式状态管理比隐式推断可靠 |
| **意图→SQL修改映射** | 工程实践 | refine=修改WHERE, drill_down=增加GROUP BY, compare=增加CASE WHEN/UNION | ⭐⭐⭐ 高 — 将自然语言指导转化为结构化规则 |

---

## 8. 改进建议与优先级

### P0 — 关键改进（直接影响查询准确性）

#### P0-1: 建立用户反馈闭环

**现状**：`query_feedback` 表有数据但无读取路径

**改进方案**：

```
query_feedback ──(新增 listFeedbackBySQL)──→ lookup_examples ──(评分降权)──→ LLM
                     │
                     └──(新增 getNegativePatterns)──→ prompt-builder ──(反模式注入)──→ LLM
```

**具体实现**：
1. 在 `store.ts` 新增 `listFeedbackBySqlPattern(sql: string)` 函数
2. 在 `lookup_examples` 工具中：negative feedback 的示例降权，positive feedback 的示例提权
3. 在 `prompt-builder.ts` 中注入"常见错误模式"：从 `sql_query_history` 聚合高频失败SQL模式
4. 当 negative feedback 累计超过阈值时，自动将对应示例标记为 `is_verified = 0`

**新增数据字段**：
- `query_feedback` 增加 `sql_query_history_id` 外键
- `query_feedback` 增加 `feedback_category` 枚举（wrong_result / slow_query / wrong_table / missing_data / other）

#### P0-2: 实现结构化 Self-Correction

**现状**：完全依赖 LLM 自行决定是否重试

**改进方案**：

```typescript
// execute_sql 工具内嵌修正循环
interface CorrectionLoop {
  maxRounds: 3;
  onExecutionError: (sql: string, error: string) => string;  // 错误反馈给LLM修正
  onEmptyResult: (sql: string, result: QueryResult) => string; // 0行结果分析
  trackCorrectionHistory: boolean;  // 避免重复相同修正
}
```

**具体实现**：
1. 执行失败时：将错误信息 + 原始SQL + schema上下文反馈给LLM，要求修正
2. 执行成功但0行时：分析 WHERE 条件是否过于严格，建议放宽
3. 最多3轮修正，每轮记录 `correction_round` 到 `sql_query_history`
4. 在 `sql_query_history` 增加 `parent_query_id` 字段追踪修正链

#### P0-3: 扩展校验覆盖列名

**现状**：`validator.ts` 只校验表名

**改进方案**：
1. 从 `schema_cache` 中提取列名集合
2. 解析SQL中引用的列名（正则提取 `table.column` 和裸 `column`）
3. 校验列名是否存在于对应表中
4. 不存在时提供 Levenshtein 拼写建议（与现有表名校验一致）

---

### P1 — 重要改进（显著提升查询质量）

#### P1-1: 语义相似度示例检索

**现状**：关键词重叠匹配，遗漏语义等价查询

**改进方案**：
1. 对 `query_examples` 表增加 `question_embedding` 列（VECTOR 类型或 JSON）
2. 新查询时：用 embedding 计算用户问题与历史问题的余弦相似度
3. 混合排序：`score = 0.6 * semantic_similarity + 0.3 * keyword_overlap + 0.1 * execution_reliability`
4. 增加多样性采样（MMR策略）：在相似度和多样性之间取平衡

**轻量替代方案（无需 embedding 基础设施）**：
- 利用 LLM 做查询意图分类，将相似意图的历史查询作为示例
- 利用 metric 的 `aliases` 字段扩展关键词匹配范围

#### P1-2: 结构化多轮上下文摘要

**现状**：依赖LLM从对话历史推断指代

**改进方案**：

```typescript
interface QueryState {
  currentSQL: string;
  tables: string[];
  columns: string[];
  whereConditions: string[];
  groupByColumns: string[];
  resultSummary: string;  // "返回12行，包含3个地区的销售额数据"
  lastIntent: string;     // "new_query" | "refine" | "drill_down" | ...
}
```

1. 每次SQL执行后更新 `QueryState`
2. 在 prompt 前缀注入结构化摘要，替代当前 `getRecentSqlContext` 的文本拼接
3. 按 `conversation_id` 隔离上下文（修复当前跨对话污染问题）

#### P1-3: 修复 getRecentSqlContext 隔离问题

**现状**：按 `datasource_id` 查询，不区分 `conversation_id`

**改进方案**：
1. `getRecentSqlContext` 增加 `conversationId` 参数
2. 优先返回当前对话的历史，不足时再补充同 datasource 的其他对话历史
3. 修复 `execute_sql` 中 `conversation_id: null` 的硬编码

#### P1-4: 意图→SQL修改的结构化映射

**现状**：prompt中只有自然语言指导

**改进方案**：

| 意图 | SQL修改规则 | 示例 |
|------|-----------|------|
| `new_query` | 从头生成 | "各地区的销售额" |
| `refine` | 修改WHERE条件 | "只看华东地区" → 添加 `WHERE region='华东'` |
| `drill_down` | 增加GROUP BY维度 | "按城市拆分" → 添加 `city` 到 GROUP BY |
| `compare` | 增加CASE WHEN/UNION | "和去年同期对比" → 添加同比计算 |
| `roll_up` | 减少GROUP BY维度 | "只看全国汇总" → 移除地区维度 |
| `explain` | 不执行SQL，解释上条SQL | "这个查询是什么意思" |

---

### P2 — 中等改进（扩展查询能力）

#### P2-1: Schema大小自适应策略

**改进方案**：
1. 计算 `formatSchemaForPrompt()` 输出的 token 数
2. 当 schema < 4000 tokens → 全量注入
3. 当 schema 4000-8000 tokens → 保留核心表全量 + 边缘表摘要
4. 当 schema > 8000 tokens → 触发 schema linking，按用户问题相关性筛选表

#### P2-2: 语义层扩展

**改进方案**：
1. 增加时间粒度层级：为时间维度增加 `grain` 属性（日/周/月/季/年）
2. 支持 Derived 类型指标：`sql_expression` 可引用其他 metric
3. `buildSemanticSql` 扩展支持窗口函数、HAVING、ORDER BY
4. 保存 metric 时自动执行 `EXPLAIN` 验证语法正确性

#### P2-3: 增强数据采样

**改进方案**：
1. 时间列：采样 `MIN(date)` / `MAX(date)` / 数据分布
2. 表行数：注入 `estimated_row_count` 到 prompt（影响LLM判断是否需要LIMIT）
3. 列统计：`null_percentage`、`distinct_count`（帮助LLM判断列的区分度）

---

### P3 — 次要改进（锦上添花）

| 编号 | 改进项 | 预期收益 | 实施难度 |
|------|--------|---------|---------|
| P3-1 | 多候选SQL生成（temperature采样+执行对比） | 高不确定性场景提升 | 高（成本翻倍） |
| P3-2 | 结果合理性检查（负值、越界日期等） | 辅助验证 | 低 |
| P3-3 | 统一 table_query_examples 和 query_examples | 避免重复矛盾 | 低 |
| P3-4 | 主动同步 query_examples（execute_sql成功后触发） | 示例时效性 | 低 |
| P3-5 | buildSemanticSql 参数化查询（防SQL注入） | 安全性 | 低 |
| P3-6 | 中文分词优化（jieba/IK分词） | 检索精度 | 中 |
| P3-7 | Schema cache 预加载（harness创建时自动发现） | 首次查询校验可靠性 | 低 |

---

## 9. 实施路线图

### Phase 1: 基础闭环（2-3周）

**目标**：建立反馈闭环，修复关键断裂

```
Week 1:
├── [P0-1] 用户反馈闭环 — store.ts 新增读取函数 + lookup_examples 降权逻辑
├── [P0-3] 列名校验 — 扩展 validator.ts
└── [P1-3] 修复 getRecentSqlContext 隔离 — 增加 conversationId 参数

Week 2-3:
├── [P0-2] Self-Correction 机制 — execute_sql 内嵌修正循环
├── [P1-4] 意图→SQL修改映射 — prompt 结构化规则
└── [P1-2] 结构化多轮上下文 — QueryState 追踪
```

### Phase 2: 智能检索（3-4周）

**目标**：从关键词匹配升级为语义检索

```
Week 4-5:
├── [P1-1] 语义相似度示例检索 — embedding 存储 + 混合排序
├── [P2-3] 增强数据采样 — 时间列范围、行数统计、列分布
└── [P3-3] 统一示例表 — 合并 table_query_examples 和 query_examples

Week 6-7:
├── [P2-1] Schema大小自适应 — token计数 + 分级策略
├── [P2-2] 语义层扩展 — 时间粒度 + Derived指标 + builder增强
└── [P3-4/5/7] 低成本快速修复 — 主动同步 + 参数化 + 预加载
```

### Phase 3: 高级优化（4-6周）

**目标**：多候选生成、结果验证、性能优化

```
Week 8-10:
├── [P3-1] 多候选SQL生成 — temperature采样 + 执行过滤
├── [P3-2] 结果合理性检查 — 规则引擎
├── [P3-6] 中文分词优化 — jieba分词
└── 监控体系 — SQL成功率指标、反馈闭环效果度量
```

---

## 10. 参考文献

### 学术论文

| 论文                           | 会议/排名                               | 核心贡献                                               |
| ---------------------------- | ----------------------------------- | -------------------------------------------------- |
| The Death of Schema Linking? | arXiv:2408.07702, BIRD榜单#1 (71.83%) | 全量Schema注入优于过滤；Augmentation-Selection-Correction策略 |
| DIN-SQL                      | arXiv:2304.11015, Spider 85.3%      | 任务分解式Schema理解 + 自我修正                               |
| DAIL-SQL                     | arXiv:2308.15363, Spider 86.6%      | 系统化Prompt工程：问题表示+示例选择+示例组织                         |
| CodeS                        | arXiv:2402.16347, SIGMOD 2024       | 增量预训练 + 双向数据增强                                     |
| MAC-SQL                      | arXiv:2312.11242, COLING 2025 Oral  | 多Agent协作：分解+选择+修正                                  |
| SQL-PaLM                     | arXiv:2306.00739                    | 多候选生成 + 执行过滤 + self-consistency                    |
| BIRD Benchmark               | arXiv:2305.03111, NeurIPS 2023      | 真实数据库场景评测，揭示数据值理解瓶颈                                |
| Self-Debugging               | arXiv:2304.05128                    | LLM自我解释+检查执行结果，Spider最难题目+9%                       |

### 产品参考

| 产品 | 参考价值 |
|------|---------|
| [dbt Semantic Layer](https://docs.getdbt.com/docs/build/metrics-overview) | 5种指标类型 + MetricFlow依赖解析 |
| [Cube Semantic Layer](https://docs.cube.dev/docs/introduction) | Pre-aggregations + Semantic SQL + AI/MCP接口 |
| [Metabase](https://www.metabase.com/) | 自动可视化推断 + 性能优化建议 |
| [ThoughtSpot](https://www.thoughtspot.com/) | NLU引擎 + 意图分类 + 修正建议 |
| [Chat2DB](https://github.com/chat2db/Chat2DB) | 开源NL2SQL产品参考 |

---

## 附录A：当前数据模型详细字段

### sql_query_history

```sql
CREATE TABLE sql_query_history (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  datasource_name TEXT,
  conversation_id TEXT,          -- ⚠️ 当前硬编码为 null
  question TEXT,                 -- 用户原始问题
  sql TEXT NOT NULL,             -- 执行的SQL
  executed_at TEXT NOT NULL,     -- 执行时间
  execution_time_ms INTEGER,     -- 执行耗时
  row_count INTEGER,             -- 返回行数
  status TEXT NOT NULL,          -- 'success' | 'error'
  error_message TEXT,            -- 失败时的错误信息（未回传！）
  created_at TEXT NOT NULL
);
-- 缺失字段: parent_query_id, intent_type, correction_round, explain_plan
```

### query_feedback

```sql
CREATE TABLE query_feedback (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  rating TEXT NOT NULL,          -- 'positive' | 'negative'
  issue_type TEXT,               -- 反馈类型（已有但未利用）
  issue_detail TEXT,             -- 反馈详情（已有但未利用）
  created_at TEXT NOT NULL
);
-- ⚠️ 从未被读取！
-- 缺失字段: sql_query_history_id, feedback_category
```

### query_examples

```sql
CREATE TABLE query_examples (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  conversation_id TEXT,
  question TEXT NOT NULL,
  sql TEXT NOT NULL,
  tables_used TEXT,              -- JSON array
  difficulty TEXT,               -- 'simple' | 'medium' | 'complex'
  success_count INTEGER DEFAULT 0,
  is_verified INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- 缺失字段: question_embedding, last_executed_at, avg_execution_time_ms
```

### schema_annotations

```sql
CREATE TABLE schema_annotations (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  field_name TEXT,               -- null = 表级注释
  annotation TEXT NOT NULL,      -- 业务描述
  status TEXT DEFAULT 'draft',   -- 'draft' | 'confirmed'（仅confirmed被回传）
  domain_type TEXT,              -- 'enum' | 'range'
  domain_values TEXT,            -- JSON: 枚举值列表或范围
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- 缺失: confidence_score, source ('ai' | 'user' | 'imported')
```

---

## 附录B：改进前后对比

### 查询准确性提升预期

| 场景 | 当前准确率预估 | 改进后预估 | 关键改进项 |
|------|--------------|-----------|-----------|
| 简单单表查询 | ~90% | ~95% | 列名校验、Self-Correction |
| 带条件的单表查询 | ~80% | ~90% | 域值采样增强、反馈闭环 |
| 多表JOIN查询 | ~65% | ~80% | 结构化关系摘要、示例多样性 |
| 语义层匹配查询 | ~95% | ~98% | 语义层扩展（时间粒度、Derived指标） |
| 多轮对话修改查询 | ~60% | ~80% | QueryState追踪、意图→SQL映射 |
| 同义词/近义词查询 | ~40% | ~70% | 语义相似度检索、别名扩展 |
| 失败查询自动修复 | ~0% | ~60% | Self-Correction机制 |

> 注：以上准确率为基于代码分析和业界基准的预估，需实际A/B测试验证。

---

*报告完*
