## 1. Phase 1 — Schema 增强 + AI 注释 + SQL 验证纠错 + 结果总结 (Week 1-2)

### 1.1 Schema 增强 — 列值域发现

- [ ] 1.1.1 扩展 `schema_annotations` 表：增加 `status` (TEXT, "draft"/"confirmed", default "confirmed"), `domain_type` (TEXT, "enum"/"range"/null), `domain_values` (TEXT, JSON/null) 字段；编写 SQLite migration
- [ ] 1.1.2 在 `discovery.ts` 中实现 `discoverValueDomains()` 函数：对 VARCHAR/ENUM 列执行 `SELECT DISTINCT col FROM table LIMIT 20`，对数值列执行 `SELECT MIN/MAX/AVG`；大表(>10万行)加 5s 超时
- [ ] 1.1.3 在 `discover_schema` 流程中集成值域发现：发现后自动写入 `schema_annotations` 表（domain_type + domain_values），status 为 "confirmed"
- [ ] 1.1.4 扩展 `formatSchemaForPrompt()`：对有 domain_type 的列渲染 `Values: [v1, v2, ...]` 或 `Range: min~max (avg: X)`

### 1.2 Schema 增强 — 常见查询示例

- [ ] 1.2.1 创建 `table_query_examples` SQLite 表：id, datasource_id, table_name, question, sql, is_verified, created_at, updated_at
- [ ] 1.2.2 实现 `table_query_examples` CRUD 函数在 `store.ts` 中：create, list, update, delete
- [ ] 1.2.3 实现 REST API 路由 `packages/server/src/routes/schemas.ts`：POST/GET/PUT/DELETE `/api/datasources/:dsId/table-query-examples`
- [ ] 1.2.4 扩展 `formatSchemaForPrompt()`：对有 query examples 的表渲染 `### Common Queries:` 部分
- [ ] 1.2.5 前端 Schema 页面增加 "Common Queries" 编辑区：每个表下可添加/编辑/删除 2-3 个示例

### 1.3 AI 自动注释

- [ ] 1.3.1 创建 `packages/server/src/agent/tools/ai-annotate-schema.ts`：Agent 工具 `ai_annotate_schema`，接收 datasource_id + table_names，获取 DDL + 5 行样本数据，调 LLM 生成注释，保存为 draft
- [ ] 1.3.2 实现 AI 注释 Prompt 模板：输入 DDL + 样本数据，输出 JSON（table_description, columns[{name, business_semantics, value_domain, is_identifier}], inferred_foreign_keys）
- [ ] 1.3.3 实现 REST API `POST /api/datasources/:dsId/ai-annotate`：复用 AI 注释逻辑，供前端直接调用
- [ ] 1.3.4 实现 `PUT /api/datasources/:dsId/annotations/:id/confirm`：将 draft 注释更新为 confirmed
- [ ] 1.3.5 修改 `formatSchemaForPrompt()`：仅包含 status="confirmed" 的注释，draft 注释排除
- [ ] 1.3.6 在 `harness-factory.ts` 中注册 `ai_annotate_schema` 工具
- [ ] 1.3.7 前端 Schema 页面增加 "AI Annotate" 按钮：选择表 → 触发 AI 注释 → 展示 draft 结果 → 逐条确认/编辑/拒绝
- [ ] 1.3.8 前端增加 Schema Prompt 预览功能：调用 `GET /api/datasources/:dsId/schema-prompt-preview` 展示 Agent 看到的增强 Schema

### 1.4 SQL 验证纠错

- [ ] 1.4.1 在 `execute_sql` 工具中启用 `isSelectQuery()` 校验：不通过则返回错误，不执行
- [ ] 1.4.2 实现表名/列名存在性检查：从已缓存的 schema 中提取表名/列名集合，校验 SQL 中引用的名称；不匹配时用 Levenshtein 距离 ≤2 推荐替代
- [ ] 1.4.3 实现大表 WHERE 检查：查询 `INFORMATION_SCHEMA.TABLES.TABLE_ROWS`，>10万行且无 WHERE 则返回 warning
- [ ] 1.4.4 实现探测执行模式：NL→SQL 生成的查询先 LIMIT 10 探测，空结果返回纠错建议；语义层查询跳过探测
- [ ] 1.4.5 在 System Prompt 中增加空结果自动纠错指令：Agent 遇到空结果应分析原因并重试，最多 2 次
- [ ] 1.4.6 扩展 WebSocket 事件：增加 `validation_warning` 和 `validation_error` 事件类型
- [ ] 1.4.7 前端 `ChatMessage` 增加 `validationStatus` 字段；渲染 warning 为黄色横幅、error 为红色横幅

### 1.5 结果总结增强

- [ ] 1.5.1 在 System Prompt 中增加结构化总结指令：Agent 执行 SQL 后必须输出 **关键发现** / **趋势** / **异常** 格式的总结
- [ ] 1.5.2 前端创建 `ResultSummaryCard` 组件：解析 Agent 总结文本中的 **关键发现**/**趋势**/**异常** 标记，渲染为带图标(🔑📈⚠️)的卡片，可折叠
- [ ] 1.5.3 前端 `MessageItem.tsx` 中集成 `ResultSummaryCard`：在表格结果上方展示
- [ ] 1.5.4 实现趋势标注：检测时间序列数据（日期列+数值列），自动计算环比变化，在表格中增加"环比"列（绿色↑/红色↓）
- [ ] 1.5.5 实现异常高亮：对数值列计算 2σ 异常值，标红背景 + ⚠️ hover 提示
- [ ] 1.5.6 实现"解释结果"按钮：点击后发送追问消息给 Agent，请求解释 SQL 逻辑

## 2. Phase 2 — 语义层 + 多轮对话 + Few-Shot + 反馈闭环 (Week 3-4)

### 2.1 语义层 — 数据模型与存储

- [ ] 2.1.1 创建 `semantic_metrics` SQLite 表：id, datasource_id, name, display_name, description, sql_expression, filters (JSON), dimensions (JSON), default_granularity, unit, category, aliases (JSON), status ("draft"/"published"/"deprecated"), created_at, updated_at；UNIQUE(datasource_id, name)
- [ ] 2.1.2 创建 `semantic_dimensions` SQLite 表：id, datasource_id, name, display_name, sql_expression, data_type, hierarchy (JSON), values (JSON), created_at, updated_at；UNIQUE(datasource_id, name)
- [ ] 2.1.3 创建 `semantic_models` SQLite 表：id, datasource_id, name, description, base_table, joins (JSON), metrics (JSON), dimensions (JSON), created_at, updated_at
- [ ] 2.1.4 在 `store.ts` 中实现 metrics/dimensions/models 的 CRUD 函数
- [ ] 2.1.5 实现 REST API 路由 `packages/server/src/routes/semantic.ts`：metrics/dimensions/models 的完整 CRUD

### 2.2 语义层 — Agent 集成

- [ ] 2.2.1 创建 `packages/server/src/agent/tools/lookup-semantic-layer.ts`：Agent 工具，搜索匹配的 metrics/dimensions，返回 SQL 表达式、filters、可用维度
- [ ] 2.2.2 在 `harness-factory.ts` 中注册 `lookup_semantic_layer` 工具
- [ ] 2.2.3 修改 System Prompt：增加语义层使用指令——优先走语义层，命中指标则确定性生成 SQL，未命中走 NL→SQL
- [ ] 2.2.4 实现语义层 SQL 生成逻辑：组合 metric.sql_expression + model.joins + metric.filters + 用户指定维度/时间过滤
- [ ] 2.2.5 语义层生成的 SQL 标记 `source: "semantic_layer"`，跳过探测执行

### 2.3 语义层 — AI 辅助构建

- [ ] 2.3.1 创建 `packages/server/src/agent/tools/ai-suggest-semantic.ts`：Agent 工具，分析 schema + 样本数据，推荐 metrics/dimensions/models
- [ ] 2.3.2 实现 REST API `POST /api/datasources/:dsId/ai-suggest-semantic`：复用推荐逻辑
- [ ] 2.3.3 AI 推荐结果保存为 `status: "draft"`，需用户确认

### 2.4 语义层 — 前端管理 UI

- [ ] 2.4.1 前端增加 "Metrics" 视图（Zustand store view: "metrics"），侧边栏导航入口
- [ ] 2.4.2 创建 `MetricsPage.tsx`：指标列表（按 category 分组），支持创建/编辑/删除/发布/废弃
- [ ] 2.4.3 创建 `MetricForm.tsx`：指标编辑表单（name, display_name, description, sql_expression, filters, dimensions, aliases, unit, category）
- [ ] 2.4.4 创建 `DimensionForm.tsx`：维度编辑表单（name, display_name, sql_expression, data_type, hierarchy, values）
- [ ] 2.4.5 创建 `ModelForm.tsx`：模型编辑表单（name, base_table, joins, metrics, dimensions）
- [ ] 2.4.6 实现 "AI Recommend" 按钮：触发 AI 推荐流程，展示 draft 结果供确认
- [ ] 2.4.7 实现 "Test Metric" 功能：调用 `POST /api/datasources/:dsId/metrics/:id/test`，LIMIT 10 执行预览
- [ ] 2.4.8 实现 draft 确认/拒绝流程：draft 指标卡片有 Confirm/Reject 按钮

### 2.5 多轮对话增强

- [ ] 2.5.1 在 System Prompt 中增加意图分类指令：Agent 对每条用户消息分类为 new_query/refine/drill_down/roll_up/compare/explain/chat
- [ ] 2.5.2 在 System Prompt 中增加追问处理指令：refine/drill_down/compare 类型应继承上轮 SQL 上下文，修改而非重新生成
- [ ] 2.5.3 在 System Prompt 中增加维度层级感知指令：drill_down/roll_up 使用语义层维度层级
- [ ] 2.5.4 前端增加 "追问" 标签：当 Agent 响应追问时，在消息上方显示 "追问：基于上轮查询「...」" 标签
- [ ] 2.5.5 前端增加 "New Topic" 按钮：点击后发送 `reset_context` WebSocket 消息，重置追问上下文
- [ ] 2.5.6 后端处理 `reset_context` 消息：在 chat-handler.ts 中识别该消息类型，通知 Agent 后续消息为新话题

### 2.6 Few-Shot 知识积累

- [ ] 2.6.1 创建 `query_examples` SQLite 表：id, datasource_id, conversation_id, question, sql, tables_used (JSON), difficulty, success_count, is_verified, created_at, updated_at
- [ ] 2.6.2 实现成功查询自动保存：在 `execute_sql` 工具执行成功且结果非空时，自动保存 question-SQL 对
- [ ] 2.6.3 实现重复查询更新：相同 question-SQL 对已存在时，increment success_count
- [ ] 2.6.4 创建 `packages/server/src/agent/tools/lookup-examples.ts`：Agent 工具，关键词匹配检索相似历史查询，返回 top 3
- [ ] 2.6.5 在 `harness-factory.ts` 中注册 `lookup_examples` 工具
- [ ] 2.6.6 在 System Prompt 中增加 Few-Shot 使用指令：Agent 应先查找相似示例作为参考

### 2.7 用户反馈闭环

- [ ] 2.7.1 创建 `query_feedback` SQLite 表：id, message_id, conversation_id, rating, issue_type, issue_detail, created_at
- [ ] 2.7.2 实现 REST API `POST /api/conversations/:convId/messages/:msgId/feedback`
- [ ] 2.7.3 实现反馈驱动知识管理：positive → 标记 query_example 为 verified；3次 negative → 标记为 unverified 并 flag
- [ ] 2.7.4 前端 `MessageItem.tsx` 增加 👍👎 反馈按钮：👎 点击后展开反馈表单（issue_type 选择 + 可选文本输入）
- [ ] 2.7.5 负面反馈触发 Agent 纠错：👎 提交后自动发送追问消息给 Agent 请求修正 SQL
- [ ] 2.7.6 前端 Metrics 页面增加 "Query Examples" 区：浏览/验证/删除示例，查看反馈统计

## 3. Phase 3 — 语义层闭环 + 智能归因 (Week 5-6)

### 3.1 语义层 Phase 3 — 闭环优化

- [ ] 3.1.1 实现指标版本管理：`semantic_metrics` 增加 `version` (INTEGER) 字段，更新时自动 +1
- [ ] 3.1.2 实现指标测试查询 REST API：`POST /api/datasources/:dsId/metrics/:id/test`，执行指标 SQL LIMIT 10 返回预览
- [ ] 3.1.3 实现反馈修正指标：当用户反馈某指标查询不准确时，在指标详情页显示反馈记录，支持一键修正
- [ ] 3.1.4 实现指标废弃流程：published → deprecated，deprecated 指标不在 Agent 查找中返回，前端有 "Show deprecated" 开关

### 3.2 智能归因

- [ ] 3.2.1 在 System Prompt 中增加归因分析指令：Agent 识别 "为什么" 类问题时，执行多维拆解归因流程
- [ ] 3.2.2 实现维度感知拆解：Agent 使用语义层维度层级，对每个维度执行对比查询（当前期 vs 上期）
- [ ] 3.2.3 实现贡献因子识别：Agent 分析各维度值的变化量，识别最大贡献因子
- [ ] 3.2.4 实现交叉定位：Agent 对最大贡献维度值进一步按其他维度拆解，定位根因
- [ ] 3.2.5 前端创建 `AttributionView` 组件：事实确认 → 维度拆解 → 根因定位 → 行动建议 四段式渲染
- [ ] 3.2.6 前端实现贡献度图表：水平条形图，正值绿色、负值红色，展示各维度值对变化的贡献
- [ ] 3.2.7 归因分析作为 `explain` 意图自动触发：追问 "为什么" 时自动进入归因流程

## 4. Phase 4 — 智能报告 + 定时查询 + 数据字典 (Week 7+)

### 4.1 智能报告

- [ ] 4.1.1 在 System Prompt 中增加报告生成指令：Agent 识别报告请求时，自动编排多查询生成结构化报告
- [ ] 4.1.2 定义报告模板结构：Executive Summary / Key Metrics / Dimensional Analysis / Trend / Anomalies / Recommendations
- [ ] 4.1.3 前端创建 `ReportView` 组件：报告卡片渲染，各 section 可折叠，内嵌表格和图表
- [ ] 4.1.4 实现报告导出：Markdown 和 HTML 格式，客户端生成下载
- [ ] 4.1.5 实现报告模板自定义：`app_config` 存储模板 JSON，前端模板编辑器
- [ ] 4.1.6 实现从模板生成报告：用户选择模板 → Agent 按模板结构生成报告

### 4.2 定时查询与告警

- [ ] 4.2.1 安装 `node-cron` npm 包到 packages/server
- [ ] 4.2.2 创建 `scheduled_queries` SQLite 表：id, datasource_id, name, description, sql, cron_expression, timezone, enabled, alert_conditions (JSON), last_run_at, last_run_status, last_run_result (JSON), created_at, updated_at
- [ ] 4.2.3 创建 `query_alerts` SQLite 表：id, scheduled_query_id, severity, condition_triggered, actual_value, threshold, created_at
- [ ] 4.2.4 在 `store.ts` 中实现 scheduled_queries 和 query_alerts 的 CRUD
- [ ] 4.2.5 实现 REST API 路由 `packages/server/src/routes/scheduled.ts`：CRUD + 手动执行 + 历史查询
- [ ] 4.2.6 实现定时执行引擎：node-cron 注册/注销，执行 SQL，存储结果摘要，检查告警条件
- [ ] 4.2.7 实现服务器启动时恢复 cron 任务：从 SQLite 加载 enabled 任务并注册
- [ ] 4.2.8 实现告警通知：告警触发时通过 WebSocket 推送到前端，显示为系统消息
- [ ] 4.2.9 前端增加 "Scheduled" 视图：定时查询列表、创建/编辑/删除、启用/禁用、手动执行、执行历史、告警配置
- [ ] 4.2.10 前端告警通知展示：在聊天界面显示 ⚠️ 告警系统消息

### 4.3 数据字典

- [ ] 4.3.1 实现 REST API `GET /api/datasources/:dsId/dictionary/search?q=<query>`：跨 metrics/dimensions/tables/columns 搜索，返回分组结果
- [ ] 4.3.2 实现 REST API `GET /api/datasources/:dsId/dictionary/tables/:tableName`：表详情（列+注释+值域+FK+示例+关联指标）
- [ ] 4.3.3 实现 REST API `GET /api/datasources/:dsId/dictionary/recent-changes`：7天内更新的条目
- [ ] 4.3.4 前端增加 "Dictionary" 视图：搜索框 + 分组结果列表
- [ ] 4.3.5 前端实现字典条目详情面板：metric/dimension/table/column 四种详情视图
- [ ] 4.3.6 前端实现交叉引用导航：metric → table → column 之间可点击跳转
- [ ] 4.3.7 前端实现分类浏览：Metrics 按 category、Dimensions 按 data_type、Tables 按字母序、Recent Changes
- [ ] 4.3.8 前端实现同义词展示：metric 详情中显示 aliases 列表，可点击确认同义关系

## 5. 跨 Phase 基础设施

- [ ] 5.1 扩展 `types.ts`：增加 SemanticMetric, SemanticDimension, SemanticModel, QueryExample, QueryFeedback, ScheduledQuery, QueryAlert 等类型定义
- [ ] 5.2 扩展前端 Zustand store：增加 view 类型 ("metrics"/"scheduled"/"dictionary")，增加 selectedMetricId 等状态
- [ ] 5.3 扩展前端 API client：增加 semantic/dictionary/scheduled/feedback 相关 API 调用函数
- [ ] 5.4 扩展前端侧边栏导航：增加 Metrics / Dictionary / Scheduled 入口
- [ ] 5.5 增量 schema sync：在 `discover_schema` 中支持 `incremental: true` 参数，基于 `app_config` 中的上次同步时间戳
