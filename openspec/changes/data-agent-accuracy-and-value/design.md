## Context

DataNova 是一个 AI 驱动的 SQL 数据查询助手，当前架构为 Hono + Node.js 后端 + React 19 前端，通过 WebSocket 实现流式对话。Agent 基于 `@earendil-works/pi-agent-core` 的 `AgentHarness`，拥有 `discover_schema` 和 `execute_sql` 两个工具。

**当前核心问题**：
- Schema 信息以裸 DDL 形式提供给 LLM，缺少业务语义（值域、常见查询、列间关系）
- SQL 验证形同虚设（`isSelectQuery()` 存在但未调用）
- 查询结果只有表格，缺乏业务解读
- 无语义层，NL→SQL 准确率天花板约 55-60%
- 无知识积累，每次查询从零开始
- 无反馈闭环，系统不会越用越准

**现有数据存储**：SQLite（`better-sqlite3`）存储数据源、Schema 注释、对话、消息；MySQL 存储用户查询数据。

**约束**：
- 暂不引入向量数据库（pgvector 等），当前数据源规模（几十张表）可用增强 Schema 覆盖
- 保持单 WebSocket 连接架构
- 前端使用 React 19 + Zustand 5 + TailwindCSS 3
- 后端使用 Hono + better-sqlite3 + mysql2

## Goals / Non-Goals

**Goals:**
- Phase 1：将 SQL 生成准确率从 ~55% 提升到 ~72%，让用户第一次查询就能得到靠谱结果
- Phase 2：引入语义层，将指标准确率提升到 ~90%+，支持多轮追问
- Phase 3：从"看数"到"用数"，支持归因分析
- Phase 4：完整数据 Agent 能力（报告、定时查询、数据字典）
- 所有功能在前端可看、可管理、可更新

**Non-Goals:**
- 不做向量检索/RAG（后续数据源规模增长时再引入）
- 不做安全权限/行级权限控制
- 不做多数据源联合查询
- 不做实时数据流/流式数据源
- 不做移动端适配

## Decisions

### D1: Schema 增强策略 — 增强现有 formatSchemaForPrompt 而非引入 RAG

**选择**：在现有 `formatSchemaForPrompt()` 基础上增加列值域、常见查询示例、列间关系说明，而非引入向量检索。

**理由**：
- 当前企业数据源通常几十张表，增强 Schema 完全能塞进 LLM 上下文
- 增强现有函数改动最小，不需要引入新依赖
- 向量检索需要 pgvector 或独立向量数据库，运维复杂度高
- 语义层本身就是"确定性检索"，比向量相似度更可靠

**替代方案**：引入 pgvector 做向量检索 — 延后到数据源规模上百张表时。

### D2: AI 自动注释 — 作为独立工具 `ai_annotate_schema` 实现

**选择**：新增 Agent 工具 `ai_annotate_schema`，接收表名列表，基于 DDL + 样本数据调 LLM 生成注释草稿，返回给用户确认。

**理由**：
- 作为 Agent 工具可以复用现有 LLM 调用基础设施
- 用户在对话中就能触发，交互自然
- 生成结果需要用户确认，避免错误注释污染系统

**替代方案**：作为 REST API 独立实现 — 也可以，但作为工具更符合 Agent 交互模式。最终两种入口都提供：Agent 工具 + REST API（前端 Schema 页面触发）。

### D3: SQL 验证 — 三阶段渐进式验证

**选择**：
1. Stage 1（确定性，<100ms）：`isSelectQuery()` 强制校验 + 表名/列名存在性检查 + 大表 WHERE 检查
2. Stage 2（经验性，<5s）：LIMIT 10 探测执行 + 空结果检测
3. Stage 3（LLM 辅助）：空结果/异常结果自动纠错，最多 2 次重试

**理由**：
- Stage 1 零成本，必须做
- Stage 2 探测执行成本低，能发现大部分问题
- Stage 3 LLM 纠错有成本但价值高，限制重试次数控制开销

**替代方案**：引入 SQL AST 解析器（node-sql-parser）做深度验证 — 好但复杂度高，Phase 1 先用轻量方案，Phase 2 再考虑。

### D4: 语义层 — 最小可用指标层优先

**选择**：先实现指标定义（`semantic_metrics`）+ 维度定义（`semantic_dimensions`）+ 关系模型（`semantic_models`），Agent 流程改造为"优先走语义层，兜底走 NL→SQL"。

**理由**：
- 语义层是准确率的根本解法，行业实践证明可从 60% 提升到 95%+
- 最小可用版本只需指标+维度+关系，不需要完整的语义建模引擎
- AI 辅助构建降低配置门槛

**数据模型**：三张 SQLite 表（`semantic_metrics`、`semantic_dimensions`、`semantic_models`），字段设计见 specs。

### D5: Few-Shot 知识积累 — 关键词匹配而非向量检索

**选择**：成功查询保存到 `query_examples` 表，检索时用关键词+编辑距离匹配，不用向量检索。

**理由**：
- 避免引入向量数据库依赖
- 关键词匹配对中文场景够用（分词后匹配表名、列名、业务术语）
- 后续可升级为向量检索

### D6: 前端架构 — 扩展现有 Zustand + 视图切换模式

**选择**：继续使用 Zustand store 管理状态，通过 `view` 字段扩展新页面（`metrics`、`dictionary`、`scheduled`），不引入 React Router。

**理由**：
- 现有架构简单有效，新页面不多
- 避免引入路由库的迁移成本
- 保持代码风格一致

### D7: 结果总结 — 通过 System Prompt 指令 + 前端总结卡片实现

**选择**：在 System Prompt 中增加"执行 SQL 后必须生成结构化总结"的指令，前端增加 `ResultSummary` 组件解析和展示总结内容。

**理由**：
- 不需要新增 Agent 工具，LLM 本身具备总结能力
- 通过 prompt 指令控制输出格式，前端解析展示
- 成本最低，效果立竿见影

### D8: 反馈闭环 — WebSocket 事件 + SQLite 存储

**选择**：前端发送反馈通过 REST API（`POST /api/conversations/:id/messages/:msgId/feedback`），存储到 `query_feedback` 表。

**理由**：
- 反馈不需要实时推送，REST API 更简单
- 与现有 REST API 风格一致
- 反馈数据用于标记 Few-Shot 示例质量

### D9: 定时查询 — Node.js 定时器 + SQLite 存储

**选择**：使用 `node-cron` 实现定时任务，任务定义存储在 SQLite `scheduled_queries` 表，执行结果存储在 `query_results` 表。

**理由**：
- 不需要引入外部任务队列（Redis/Bull）
- 单进程部署足够
- node-cron 轻量，与现有架构一致

## Risks / Trade-offs

- **[Schema 增大导致 token 超限]** → 当数据源超过 50 张表时，增强 Schema 可能超出上下文窗口。缓解：按相关性筛选表（基于用户问题关键词匹配表名/注释），只发送相关表的 Schema。
- **[AI 自动注释质量不稳定]** → LLM 生成的注释可能不准确。缓解：所有 AI 生成注释标记为"草稿"状态，必须用户确认后才生效；用户可随时修改。
- **[语义层配置门槛]** → 要求用户手动配置指标/维度可能阻碍采用。缓解：AI 辅助构建 + 预置常见指标模板 + 从 Few-Shot 示例自动提取指标。
- **[探测执行增加延迟]** → LIMIT 10 探测会额外执行一次查询。缓解：仅对首次生成的 SQL 做探测，已验证的 SQL（语义层生成）跳过；探测超时设为 5s。
- **[定时查询单点故障]** → node-cron 在进程重启后丢失运行时状态。缓解：启动时从 SQLite 加载任务定义并重新注册；执行结果持久化到 SQLite。
- **[Few-Shot 关键词匹配精度]** → 关键词匹配可能检索不到语义相似但用词不同的历史查询。缓解：同时匹配问题文本和涉及的表名；后续升级为向量检索。
