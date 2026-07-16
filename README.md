# DataNova

AI 驱动的 SQL 数据查询助手。通过自然语言对话，自动发现数据库 Schema、生成并执行 SQL 查询，以表格和图表形式展示结果。内置语义层（指标/维度/模型），支持确定性 SQL 生成、定时查询调度、数据字典管理、智能报告生成等企业级功能。支持多 Agent 架构，包含智能问数和指标开发两个专业 Agent。UI 全部使用简体中文。

---

## 目录

- [架构全景图](#架构全景图)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [多 Agent 架构](#多-agent-架构)
- [查询流程全景图](#查询流程全景图)
- [语义层体系](#语义层体系)
- [查询技能体系](#查询技能体系)
- [指标开发 Agent](#指标开发-agent)
- [后端 Agent 处理流](#后端-agent-处理流)
- [前端功能模块](#前端功能模块)
- [数据组件与可视化](#数据组件与可视化)
- [定时查询与告警](#定时查询与告警)
- [数据存储](#数据存储)
- [REST API](#rest-api)
- [WebSocket 协议](#websocket-协议)
- [项目结构](#项目结构)
- [关键设计决策](#关键设计决策)

---

## 架构全景图

```
┌──────────────────────────────────────────────────────────────────────┐
│  packages/web (React 19 + Vite 6 + TailwindCSS 3)                   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  10 个视图 (AppView)                                          │  │
│  │  dashboard │ chat │ datasources │ schemas │ metrics            │  │
│  │  querySkills │ analysis │ dictionary │ queryHistory            │  │
│  │  insights                                              │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐             │
│  │ ChatInput │→│ ChatWindow   │→│ useAgentStream     │             │
│  └──────────┘  └──────┬───────┘  └────────┬──────────┘             │
│                       │ Zustand           │ WebSocket               │
│                       │ (app store)       │ (useWebSocket)          │
│              ┌────────┴────────┐          └──────┬──────┘           │
│              │ 消息渲染组件     │                 │                   │
│              │ MessageList     │                 │                   │
│              │ StepIndicator   │                 │                   │
│              │ SqlBlock        │                 │                   │
│              │ TableResult     │                 │                   │
│              │ ChartView       │                 │                   │
│              │ MarkdownContent │                 │                   │
│              │ ResultSummary   │                 │                   │
│              │ ConfirmActionCard│                │                   │
│              │ MetricCard      │                 │                   │
│              │ DimensionCard   │                 │                   │
│              │ ValidationResult│                 │                   │
│              └─────────────────┘                 │                   │
│                                                   │                   │
│  ┌──────────────────────────────────────────────┐│                   │
│  │ 数据组件                                      ││                   │
│  │ ChartRenderers (Bar/Line/Area/Pie/Scatter/KPI)│                   │
│  │ chart-inference.ts (自动推断图表类型)         ││                   │
│  └──────────────────────────────────────────────┘│                   │
│  ┌──────────────────────────────────────────────┐│                   │
│  │ Agent 注册表                                  ││                   │
│  │ agents/registry.ts (AGENT_REGISTRY)          ││                   │
│  │ agents/types.ts (AgentInfo, EntryPoint)      ││                   │
│  │ ChannelTabs → AgentWelcome → 按Agent路由     ││                   │
│  └──────────────────────────────────────────────┘│                   │
└───────────────────────────────────────────────────┼───────────────────┘
                                                    │ WS
                              Vite Proxy ───────────┼──────────┐
                              /api → :3000/api                  │
                              /ws  → ws://:3000/ws              │
                                                                │
┌────────────────────────────────────────────────────────────────┼───┐
│  packages/server (Hono + Node.js ESM)                          │   │
│                                                                │   │
│  ┌────────────────────────────────────────────────────────────┐ │   │
│  │ REST API (/api/*) — 工厂路由模式                           │ │   │
│  │  /datasources  /schemas  /skills  /conversations  /models  │ │   │
│  │  /metrics  /dimensions  /models  /scheduled-queries         │ │   │
│  │  /dictionary  /insights  /bookmarks  /query-skills /query-history       │ │   │
│  │  /ai-suggest-semantic  /ai-preview-semantic                 │ │   │
│  │  /bulk-import-metrics  /batch-create-suggestions            │ │   │
│  │  /dictionary/enums  /ai-suggest-dimensions                  │ │   │
│  └────────────────────────────────────────────────────────────┘ │   │
│                                                                │   │
│  ┌────────────────────────────────────────────────────────────┐ │   │
│  │ WebSocket (/ws/chat) — 实时对话通道                        │←┼───┘
│  │  chat-handler.ts → agentType 路由:                         │ │
│  │    "query"     → harness-factory.ts → AgentHarness         │ │
│  │    "metric_dev"→ agentRegistry → metric-dev-harness.ts     │ │
│  │       ↓ event forwarding          ↓                        │ │
│  │  forwardEvent(ws)          prompt-builder.ts               │ │
│  │                             prompt-builder-metric-dev.ts    │ │
│  │                             skill-manager.ts               │ │
│  │                             semantic-sql-builder.ts        │ │
│  │                             tools/                         │ │
│  │                               discover-schema.ts           │ │
│  │                               execute-sql.ts               │ │
│  │                               ai-annotate-schema.ts        │ │
│  │                               lookup-semantic-layer.ts     │ │
│  │                               lookup-examples.ts           │ │
│  │                               read-skill.ts                │ │
│  │                               validate-and-test-metric.ts  │ │
│  │                               check-metric-conflict.ts     │ │
│  │                               create-metric-draft.ts       │ │
│  │                               create-dimension-draft.ts    │ │
│  │                               request-confirm.ts           │ │
│  │                               tokenizer.ts (nodejieba)     │ │
│  └────────────────────────────────────────────────────────────┘ │   │
│                                                                │   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │   │
│  │ store.ts     │  │ mysql/       │  │ crypto.ts        │      │   │
│  │ (SQLite WAL) │  │ pool.ts      │  │ (AES-256-GCM)    │      │   │
│  │ datanova.db  │  │ executor.ts  │  │                  │      │   │
│  │              │  │ discovery.ts │  │                  │      │   │
│  │              │  │ validator.ts │  │                  │      │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘      │   │
│  ┌──────────────┐  ┌──────────────┐                            │   │
│  │ scheduler.ts │  │ routes/      │                            │   │
│  │ Cron 定时调度│  │ 语义层 CRUD  │                            │   │
│  │ 告警引擎     │  │ AI 推荐接口  │                            │   │
│  └──────────────┘  └──────────────┘                            │   │
└────────────────────────────────────────────────────────────────────┘
         │                                    │
    better-sqlite3                        mysql2
         │                                    │
    datanova.db                          MySQL Server
    (元数据/语义层/配置)                 (用户业务数据库)
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19, Vite 6, TailwindCSS 3, Zustand 5, TanStack Table, Recharts |
| 后端 | Hono, @hono/node-server, @hono/node-ws, ESM (`"type": "module"`) |
| AI Agent | @earendil-works/pi-agent-core (AgentHarness), @earendil-works/pi-ai (多 Provider) |
| AI 辅助 | DeepSeek API (语义层推荐、查询技能生成、SQL 生成、Schema 注解) |
| 中文 NLP | nodejieba (中文分词, 用于语义层搜索和示例查询的关键词匹配) |
| 数据库 | better-sqlite3 (元数据), mysql2 (用户查询) |
| 校验 | @sinclair/typebox (JSON Schema + 类型安全) |
| 加密 | AES-256-GCM (数据源密码加密) |
| 调度 | node-cron (定时查询执行) |
| 测试 | Vitest (单元), Playwright (E2E) |

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY 或其他 LLM API Key

# 3. 启动开发服务器
npm run dev:server   # 后端 :3000
npm run dev:web      # 前端 :5173 (自动代理到后端)

# 4. 打开浏览器
open http://localhost:5173
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API Key (Agent 主模型) | — |
| `OPENAI_API_KEY` | OpenAI API Key | — |
| `DEEPSEEK_API_KEY` | DeepSeek API Key (语义层推荐、SQL 生成等直接 fetch 调用) | — |
| `DATANOVA_ENCRYPTION_KEY` | 数据源密码加密密钥 (32字节) | `datanova-default-key-32b!` |
| `DATANOVA_DIR` | 数据目录 | `./data` |
| `PORT` | 后端端口 | `3000` |
| `DATANOVA_PROVIDER` | 默认 LLM Provider | `anthropic` |
| `DATANOVA_MODEL` | 默认 LLM Model | `claude-sonnet-4-20250514` |

---

## 多 Agent 架构

DataNova 采用多 Agent 架构，通过 `AgentRegistry` 管理不同专业领域的 Agent。每个 Agent 拥有独立的工具集、系统提示和 Harness 工厂。

### Agent 注册表

| Agent | ID | 图标 | 工具集 | 入口视图 |
|---|---|---|---|---|
| 智能问数 | `query` | 💬 | discover_schema, execute_sql, lookup_semantic_layer, lookup_examples, read_skill, ai_annotate_schema | chat |
| 指标开发 | `metric_dev` | 📊 | discover_schema, execute_sql, lookup_semantic_layer, lookup_examples, read_skill, validate_and_test_metric, check_metric_conflict, create_metric_draft, create_dimension_draft, request_user_confirm | metrics |

### Agent 路由流程

```
前端 ChannelTabs 切换 → activeChannel 变更
  ↓
ChatWindow 发送 init 消息 (含 agentType)
  ↓
chat-handler.ts 读取 agentType:
  "query"     → createHarness() (原有流程)
  "metric_dev"→ agentRegistry.createHarness("metric_dev", opts)
  ↓
AgentRegistry 查找 AgentDefinition → 获取工具集 → 调用 harnessFactory
  ↓
创建 AgentHarness → 订阅事件 → 转发到前端
```

### 核心文件

| 文件 | 职责 |
|---|---|
| `agent-registry.ts` | AgentRegistry 类 — Agent 和工具注册、Harness 创建 |
| `agent-registration.ts` | `registerAllAgents()` + `registerAllTools()`，启动时调用 |
| `tool-registration.ts` | `registerAllTools()` — 将所有工具注册到共享池 |
| `metric-dev-harness.ts` | 指标开发 Agent 的 Harness 工厂 |
| `prompt-builder-metric-dev.ts` | 指标开发 Agent 的系统提示 |
| `agents/registry.ts` (前端) | AGENT_REGISTRY 定义 + getAgentById() |
| `agents/types.ts` (前端) | AgentInfo & EntryPoint 类型 |

---

## 查询流程全景图

从用户输入到结果展示的完整数据流，包含每个阶段的所有内部处理细节。

### 当前 Agent 及其工具

| Agent | ID | 可调用工具 |
|---|---|---|
| 智能问数 | `query` | `discover_schema` · `execute_sql` · `lookup_semantic_layer` · `lookup_examples` · `read_skill` · `ai_annotate_schema` |
| 指标开发 | `metric_dev` | `discover_schema` · `execute_sql` · `lookup_semantic_layer` · `lookup_examples` · `read_skill` · `validate_and_test_metric` · `check_metric_conflict` · `create_metric_draft` · `create_dimension_draft` · `request_user_confirm` |

下面以**智能问数 Agent (query)** 为例，展示完整的查询流程。

### 阶段 1：用户输入

```
┌─────────────────────────────────────────────────────────────────────┐
│ 用户在 ChatInput 输入自然语言 → 按 Enter                            │
│                                                                     │
│ ChatWindow.handleSend(text):                                        │
│   1. 创建 userMsg: { role:"user", content:text }                   │
│   2. setMessages(prev => [...prev, userMsg])  ← 乐观更新           │
│   3. 设置 15s 响应超时 (无 agent_start 则提示超时)                  │
│   4. 判断是否有 selectedConversationId:                             │
│      ├─ 无 → conversationsApi.create() → initSession() → 发消息    │
│      └─ 有 → sendMessage(text, conversationId)                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 阶段 2：WebSocket 传输 + Session 初始化

```
┌─────────────────────────────────────────────────────────────────────┐
│ 前端 → Vite Proxy → :3000/ws/chat                                   │
│                                                                     │
│ 首次对话先发送 init:                                                │
│   send({ type:"init", payload:{                                     │
│     conversationId, datasourceId, datasourceName,                   │
│     modelProvider, modelId, agentType  ← "query" 或 "metric_dev"   │
│   }})                                                               │
│                                                                     │
│ 后端 chat-handler.ts handleInit():                                  │
│   1. 读取 agentType (默认 "query")                                  │
│   2. if agentType === "query":                                      │
│        → createHarness(options) — 创建 6 个工具 + 加载 Skills       │
│        → buildDataNovaSystemPrompt() — 构建系统提示                  │
│      else:                                                          │
│        → agentRegistry.createHarness(agentType, opts)               │
│        → 从工具池获取该 Agent 的工具集 + 构建专用系统提示            │
│   3. 预填充 Schema 缓存:                                            │
│        discoverSchema(datasourceId) → setSchemaCache()              │
│        (使后续 SQL 校验的列名验证能立即工作)                        │
│   4. 订阅 Harness 事件: harness.subscribe(event => ...)             │
│   5. 加载历史消息: listMessages(conversationId)                     │
│        → send({ type:"message_history", messages })                 │
│   6. 发送 init_success                                              │
│   7. 记录 datasourceId → conversationDatasourceMap                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 阶段 3：Agent 决策循环 — System Prompt 注入

```
┌─────────────────────────────────────────────────────────────────────┐
│ handleSend → sendMessage(text, convId) → useWebSocket.send()        │
│   → ws.send({ type:"message", text, payload:{conversationId} })     │
│                                                                     │
│ 后端 handleMessage():                                               │
│   1. 持久化用户消息: saveMessage({ conversationId, role:"user" })   │
│   2. 构建上下文前缀:                                                │
│      a. SQL 上下文: getRecentSqlContext(dsId, 3)                    │
│         → 最近 3 条查询 (问题/表/行数/耗时/SQL)                    │
│      b. conversation_id 注入:                                       │
│         [Current conversation_id: xxx]                              │
│   3. 重置 streaming state (content="", steps=[])                    │
│   4. harness.prompt(contextPrefix + text) ← 触发 Agent Loop        │
└─────────────────────────────────────────────────────────────────────┘

系统提示 (buildDataNovaSystemPrompt) 由以下段落拼接:
┌──────────────────────────────────────────────────────┐
│ ① 基础指令                                           │
│    - 仅 SELECT / 结果摘要格式 / 错误自修正规则       │
│    - 意图分类: new_query/refine/drill_down/           │
│      compare/explain/chat                             │
│    - 归因分析指令 (为什么→验证→拆解→根因)            │
│    - 报告生成指令 (多查询编排→结构化报告)             │
│    - 数据真实性红线 (禁止编造数字/趋势/归因)          │
│──────────────────────────────────────────────────────│
│ ② 数据源信息                                         │
│    - 当前选中的数据源 + 所有可用数据源列表            │
│──────────────────────────────────────────────────────│
│ ③ Skills 摘要 (formatSkillsForSystemPrompt)          │
│    - "qs-{id}: {domain} - {name}" 简短描述           │
│    - Agent 按需调用 read_skill 加载完整内容           │
│──────────────────────────────────────────────────────│
│ ④ Skill 使用指令                                     │
│    - 优先链: lookup_semantic_layer → qs-* skills     │
│      → lookup_examples → discover_schema             │
│    - read_skill 渐进加载说明                          │
│──────────────────────────────────────────────────────│
│ ⑤ 自定义指令 (用户注入的额外规则)                    │
└──────────────────────────────────────────────────────┘
```

### 阶段 4：Agent 智能路由 — 工具调用详解

```
┌─────────────────────────────────────────────────────────────────────┐
│ LLM 根据系统提示和用户问题，决定调用哪个工具                         │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 A: lookup_semantic_layer(datasource_id, query)            │ │
│ │                                                                 │ │
│ │ 内部处理:                                                       │ │
│ │   1. tokenize(query) → nodejieba 中文分词                       │ │
│ │      "上个月销售额" → ["上个月", "销售额"]                       │ │
│ │   2. listMetrics(dsId).filter(m => m.status === "published")   │ │
│ │   3. 搜索匹配:                                                  │ │
│ │      ├─ name/display_name 精确包含                              │ │
│ │      ├─ aliases (JSON数组) 包含                                 │ │
│ │      └─ keywords 分词后逐词匹配 name/display_name/aliases       │ │
│ │   4. listDimensions(dsId).filter(d => d.status === "published")│ │
│ │      ├─ name/display_name 匹配                                 │ │
│ │      ├─ values 枚举值匹配 (key-value / 简单数组)               │ │
│ │      └─ keywords 分词匹配                                       │ │
│ │   5. resolveSemanticSql():                                      │ │
│ │      ├─ 返回指标 SQL + 类型 (atomic/derived/compound)           │ │
│ │      ├─ 关联维度 (含粒度 grain, 枚举值 enum_values)            │ │
│ │      └─ 修改提示 (如 "可调整时间粒度: day/week/month/...")      │ │
│ │                                                                 │ │
│ │ 匹配成功 → 返回确定性 SQL + 维度信息 → 跳到步骤 D              │ │
│ │ 匹配失败 → "未找到匹配" → 继续步骤 B                           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                               │ 未匹配                              │
│                               ▼                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 B: 检查 qs-* 查询技能 (System Prompt 中的 Skills 列表)    │ │
│ │                                                                 │ │
│ │ LLM 自行判断用户问题是否匹配某个 qs-* 技能的描述                │ │
│ │                                                                 │ │
│ │ 匹配到技能 → read_skill(skill_name)                            │ │
│ │   内部处理:                                                     │ │
│ │     1. 从 loadAllSkills() 返回的数组中查找 skill                │ │
│ │     2. formatSkillInvocation(skill) — SDK 格式化完整内容        │ │
│ │     3. 返回完整技能:                                            │ │
│ │        - 核心表 & 关联路径                                      │ │
│ │        - 查询步骤 (1,2,3...)                                    │ │
│ │        - 示例 SQL (可执行)                                      │ │
│ │        - 注意事项 & 常见问题                                    │ │
│ │   → Agent 按攻略步骤生成 SQL → 跳到步骤 D                      │ │
│ │                                                                 │ │
│ │ 无技能匹配 → 继续步骤 C                                        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                               │ 未匹配                              │
│                               ▼                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 C: lookup_examples(datasource_id, query)                  │ │
│ │                                                                 │ │
│ │ 内部处理:                                                       │ │
│ │   1. syncQueryExamplesFromHistory(dsId) — 从执行历史同步示例    │ │
│ │   2. tokenize(query) → nodejieba 分词                          │ │
│ │   3. listAutoQueryExamples(dsId)                                │ │
│ │      → 过滤: is_verified=1 或 success_count≥3                  │ │
│ │      → 排除: negative≥3 且 positive=0 的差评示例               │ │
│ │   4. 评分排序:                                                  │ │
│ │      ├─ 问题关键词匹配 +2/词                                   │ │
│ │      ├─ 表名关键词匹配 +1/词                                   │ │
│ │      ├─ is_verified=1 → +3                                     │ │
│ │      ├─ success_count → +1~5                                   │ │
│ │      ├─ 执行历史成功率 → +1~5                                  │ │
│ │      ├─ 正反馈 → +1~3                                          │ │
│ │      ├─ 负反馈 → -2*n (最多 -10)                               │ │
│ │      └─ 错误>成功 → -3                                         │ │
│ │   5. 取 top 3 → 返回 {question, sql, verified, execution_count}│ │
│ │                                                                 │ │
│ │ 有示例 → 作为 Few-Shot 参考 → Agent 参考 SQL 模式生成新 SQL    │ │
│ │          → 跳到步骤 D                                           │ │
│ │ 无示例 → discover_schema → 从零生成 SQL → 跳到步骤 D           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│                               ▼                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 C-fallback: discover_schema(datasource_id, table_names?)  │ │
│ │                                                                 │ │
│ │ 内部处理:                                                       │ │
│ │   1. 验证 datasource_id 是否有效                                │ │
│ │   2. discoverSchema(dsId, table_names?):                        │ │
│ │      → INFORMATION_SCHEMA 查询:                                 │ │
│ │        - TABLES (表名/引擎/注释)                                │ │
│ │        - COLUMNS (列名/类型/默认值/注释)                        │ │
│ │        - KEY_COLUMN_USAGE (外键关系)                            │ │
│ │   3. setSchemaCache() — 填充 validator 内存缓存                 │ │
│ │   4. discover_domains=true 时:                                  │ │
│ │      → discoverValueDomains() — 逐表逐列发现值域                │ │
│ │      → upsertDomainAnnotation() — 保存为 confirmed 注解        │ │
│ │   5. getAnnotations(dsId) — 获取已有 Schema 注解               │ │
│ │   6. listQueryExamples(dsId) — 获取查询示例                     │ │
│ │   7. formatSchemaForPrompt(schema, annotations, examples)       │ │
│ │      → 返回完整 Schema 文本 (表/列/FK/注解/值域/示例)          │ │
│ │                                                                 │ │
│ │ → Agent 基于完整 Schema 生成 SQL                                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ 其他工具 (按需调用):                                                │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ai_annotate_schema(datasource_id, table_names)                 │ │
│ │   → discoverSchema() + executeSql(LIMIT 5) 取样本数据          │ │
│ │   → 返回 Schema+样本 → LLM 生成业务注解                        │ │
│ │                                                                 │ │
│ │ ai_suggest_semantic_layer(datasource_id)                       │ │
│ │   → discoverSchema() → 返回 Schema 结构                        │ │
│ │   → LLM 分析并推荐 metrics/dimensions/models                   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 阶段 5：SQL 执行管线 (execute_sql)

```
┌─────────────────────────────────────────────────────────────────────┐
│ execute_sql(datasource_id, sql, question?, skip_probe?,             │
│             conversation_id?)                                       │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 第 1 关: 数据源校验                                             │ │
│ │   listDatasources().filter(ds => ds.enabled)                    │ │
│ │   → datasource_id 无效 → 返回可用数据源列表                     │ │
│ └──────────────────────────────────┬──────────────────────────────┘ │
│                                    │ 有效                            │
│                                    ▼                                 │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 第 2 关: validateSqlAgainstSchema(sql, datasource_id)           │ │
│ │                                                                 │ │
│ │ 2a. isSelectQuery() — 白名单检查                                │ │
│ │     仅允许: SELECT / SHOW / DESCRIBE / EXPLAIN                  │ │
│ │     → 不通过 → 返回错误, 阻塞执行                              │ │
│ │                                                                 │ │
│ │ 2b. 表名校验 (Schema 缓存比对)                                  │ │
│ │     extractTableNames(sql) → 正则提取 FROM/JOIN 后的表名        │ │
│ │     → 缓存中不存在 → Levenshtein 距离 ≤2 → 拼写建议           │ │
│ │     → 不通过 → 返回错误, 阻塞执行                              │ │
│ │                                                                 │ │
│ │ 2c. 列名校验 (警告模式, 不阻塞)                                 │ │
│ │     extractColumnReferences(sql) → 正则提取 table.column 对     │ │
│ │     → 跳过聚合函数 (count/sum/avg/min/max/row_number/...)       │ │
│ │     → 缓存中不存在 → Levenshtein ≤3 → 拼写建议 (warning)      │ │
│ │     → 不阻塞执行, 仅附加警告                                   │ │
│ └──────────────────────────────────┬──────────────────────────────┘ │
│                                    │ 通过                            │
│                                    ▼                                 │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 第 3 关: checkLargeTableWithoutWhere() (skip_probe=false 时)    │ │
│ │   → 正则检测 WHERE 关键词                                       │ │
│ │   → 无 WHERE + 表行数 > 100K → 返回警告                        │ │
│ │   → 查询 INFORMATION_SCHEMA.TABLES.TABLE_ROWS                   │ │
│ └──────────────────────────────────┬──────────────────────────────┘ │
│                                    │ 继续                            │
│                                    ▼                                 │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 第 4 关: executor.executeSql(datasource_id, sql)                │ │
│ │                                                                 │ │
│ │ 4a. 获取连接池: getPool(datasourceId) → mysql2 ConnectionPool  │ │
│ │ 4b. 设置超时: SET SESSION max_execution_time = 30000            │ │
│ │ 4c. 智能 LIMIT 注入:                                           │ │
│ │     cleanSql = sql.trim().replace(/;?\s*(--.*)?$/, '')          │ │
│ │     if (!/\bLIMIT\s+\d+/i.test(cleanSql)):                     │ │
│ │       cleanSql += " LIMIT 1000"                                 │ │
│ │ 4d. 执行查询: conn.query(cleanSql)                              │ │
│ │ 4e. 返回 { columns, rows, rowCount, executionTime }             │ │
│ │     → 最多向 Agent 展示 20 行 (防止 token 溢出)                │ │
│ └──────────────────────────────────┬──────────────────────────────┘ │
│                                    │ 完成                            │
│                                    ▼                                 │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 第 5 步: createSqlQueryHistory() — 自动记录                     │ │
│ │   成功: { status:"success", row_count, execution_time_ms }      │ │
│ │   失败: { status:"error", error_message }                       │ │
│ │   → 每次执行均记录, 无论成功失败                                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ 错误自修正 (由 LLM 在 Agent Loop 中执行, 非工具内部):               │
│   SQL 错误 → 分析错误原因 → 修正 SQL → 重新调用 execute_sql       │
│     最多修正 3 次                                                   │
│   0 行结果 → 放宽 WHERE 条件 / 扩大日期范围 → 重试                 │
│     最多修正 2 次                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 阶段 6：事件流转发

```
┌─────────────────────────────────────────────────────────────────────┐
│ AgentHarness 事件 → accumulateStreamingState() + forwardEvent()     │
│                                                                     │
│ 事件类型与处理:                                                     │
│ ┌──────────────────────────────┬──────────────────────────────────┐ │
│ │ Harness 事件                  │ WebSocket 转发 → 前端效果       │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ agent_start                  │ 创建 assistant 消息              │ │
│ │                              │ isStreaming=true                 │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ turn_start                   │ thinking → 添加思考步骤          │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ message_update (text_delta)  │ text_delta → 追加文本内容        │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ message_update (thinking_..) │ thinking → 思考过程              │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ tool_execution_start         │ tool_execution_start             │ │
│ │                              │ → 添加 tool_call 步骤           │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ tool_execution_end           │ tool_execution_end               │ │
│ │  + details.confirmAction?    │  → 更新为 tool_result            │ │
│ │                              │  + confirm_action (如有)         │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ tool_result                  │ tool_result + details            │ │
│ │  + details.confirmAction?    │  + confirm_action (如有)         │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ message_end (stopReason=err) │ error → "AI 服务调用失败..."     │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ agent_end                    │ isStreaming=false                │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ settled                      │ settled → Agent 完全结束         │ │
│ └──────────────────────────────┴──────────────────────────────────┘ │
│                                                                     │
│ 流式状态累积 (accumulateStreamingState):                             │
│   text_delta → state.content += delta                               │
│   tool_execution_start → state.steps.push({type:"tool_call"})       │
│   tool_execution_end → 更新匹配的 step 为 {type:"tool_result"}      │
│                                                                     │
│ 消息持久化:                                                         │
│   agent_end 后 → saveMessage({ role:"assistant",                    │
│     content: state.content, steps: state.steps })                   │
│   → send({ type:"response_complete", content })                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 阶段 7：前端渲染管线

```
┌─────────────────────────────────────────────────────────────────────┐
│ processWsEvent(event, currentAssistantRef)                          │
│   → 返回更新后的 ChatMessage → setMessages() → React 重渲染        │
│                                                                     │
│ MessageItem 渲染助手消息 (按顺序):                                  │
│ ┌──────────────────────────────┬──────────────────────────────────┐ │
│ │ 组件                         │ 渲染内容                         │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ StepIndicator                │ thinking / tool_call /            │ │
│ │                              │ tool_result 步骤折叠             │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ ResultSummaryCard            │ 从 content 提取:                 │ │
│ │  (parseSummarySections)      │ **关键发现** / **趋势** /        │ │
│ │                              │ **异常** / **结果**              │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ ReportView + ReportExport    │ parseReportSections() ≥3 个 ##   │ │
│ │                              │ 标题 → 结构化报告视图 + 导出     │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ ValidationBanner             │ validationStatus (error/warning) │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ SqlBlock                     │ sqlBlock (来自 execute_sql       │ │
│ │                              │ tool_result) 或 content 中       │ │
│ │                              │ ```sql``` 提取 → 复制按钮        │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ DataViewToggle               │ tableData 存在时:                │ │
│ │  ├─ TableResult              │ TanStack Table + 分页 + 排序     │ │
│ │  └─ ChartView                │ inferChartType() 自动推断:       │ │
│ │                              │  KPI/饼图/散点/折线/面积/柱状    │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ ChartView (markdown tables)  │ extractMarkdownTables() →        │ │
│ │                              │ 无 execute_sql 数据时从          │ │
│ │                              │ Markdown 表格生成图表            │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ FeedbackButtons              │ 👍👎 + 反馈类别 + 问题描述       │ │
│ │                              │ → feedbackApi.submit()           │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ ConfirmActionCard            │ confirmAction 存在时:            │ │
│ │                              │ 标题 + 描述 + 待确认项目列表     │ │
│ │                              │ → 确认保存 / 取消 按钮           │ │
│ │                              │ → 确认后发送 "确认保存" 消息     │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ MetricCard                   │ 指标卡片: 名称/SQL/类型/         │ │
│ │                              │ 验证状态/测试行数                │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ DimensionCard                │ 维度卡片: 名称/表达式/           │ │
│ │                              │ 类型/粒度                        │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ ValidationResult             │ 验证结果: 通过✅/失败❌/         │ │
│ │                              │ 错误详情 + 修复建议              │ │
│ ├──────────────────────────────┼──────────────────────────────────┤ │
│ │ MarkdownContent              │ 剩余文本 → Markdown 渲染         │ │
│ │                              │ (已去除 summary 重复部分)        │ │
│ └──────────────────────────────┴──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 完整流程一图总览

```
用户输入
  │
  ▼
ChatWindow.handleSend() ─── 乐观 UI ─── → setMessages([userMsg])
  │
  ▼
useWebSocket.send({ type:"message", text, payload })
  │
  ▼ Vite Proxy
  │
chat-handler.handleMessage()
  ├─ saveMessage({ role:"user" })
  ├─ 构建 SQL 上下文前缀 (最近3条查询 + conversation_id)
  └─ harness.prompt(contextPrefix + text)
       │
       ▼
  ┌───────────── Agent Loop (可能多轮) ─────────────┐
  │                                                   │
  │  LLM 决策 → tool_use ──→ 执行 tool ──→ 结果回传  │
  │       │                                           │
  │       │ 工具调用优先链:                            │
  │       │                                           │
  │       ├─① lookup_semantic_layer                   │
  │       │   tokenize(jieba) → 搜 published 指标/维度│
  │       │   ├─ 匹配 → resolveSemanticSql()           │
  │       │   │        → 返回 SQL + 维度 + 修改提示    │
  │       │   │        → execute_sql(skip_probe=true)  │
  │       │   └─ 未匹配 ↓                              │
  │       │                                            │
  │       ├─② read_skill (qs-* 技能匹配时)            │
  │       │   loadAllSkills().find() → 格式化完整内容  │
  │       │   → 按攻略步骤生成 SQL → execute_sql       │
  │       │   └─ 未匹配 ↓                              │
  │       │                                            │
  │       ├─③ lookup_examples                          │
  │       │   syncFromHistory → tokenize → 评分排序    │
  │       │   → top 3 Few-Shot 示例 → 参考生成 SQL     │
  │       │   └─ 无示例 ↓                               │
  │       │                                            │
  │       └─④ discover_schema                          │
  │           INFORMATION_SCHEMA → 表/列/FK/注解/值域 │
  │           → setSchemaCache() → 从零生成 SQL        │
  │                                                   │
  │  execute_sql 管线:                                │
  │    datasource 校验 → isSelectQuery 白名单         │
  │    → 表名校验 (Schema缓存+Levenshtein) → 阻塞    │
  │    → 列名校验 (警告模式) → 不阻塞                 │
  │    → 大表无WHERE警告                              │
  │    → SET max_execution_time=30000                 │
  │    → 智能 LIMIT 注入 (无LIMIT→+LIMIT 1000)       │
  │    → 执行 → 返回结果 (最多展示20行)               │
  │    → createSqlQueryHistory() 自动记录             │
  │    → 失败/0行 → LLM 自修正 → 重试 (≤3次/≤2次)   │
  │                                                   │
  │  LLM 输出最终文本回复 ←────────────────────────── │
  └───────────────────────────────────────────────────┘
       │
       ▼
  forwardEvent(ws) ──→ WebSocket ──→ processWsEvent()
       │                                  │
       │ agent_start → 创建消息           │
       │ text_delta → 追加文本            │
       │ tool_execution_start → 步骤      │
       │ tool_execution_end → 结果        │
       │ confirm_action → 确认卡片        │
       │ agent_end → 结束流               │
       │                                  ▼
       │                          setMessages() → React 重渲染
       │                                  │
       │                          MessageItem 渲染:
       │                           ├ StepIndicator
       │                           ├ ResultSummaryCard
       │                           ├ ReportView (报告时)
       │                           ├ SqlBlock
       │                           ├ DataViewToggle (TableResult / ChartView)
       │                           ├ ConfirmActionCard (确认时)
       │                           ├ MetricCard / DimensionCard / ValidationResult
       │                           ├ MarkdownContent
       │                           └ FeedbackButtons
       │
  saveMessage({ role:"assistant", content, steps })
  send({ type:"response_complete" })
```

---

## 语义层体系

语义层是 DataNova 的核心数据建模层，将业务指标、维度、模型定义在元数据中，实现 **确定性 SQL 生成**，避免 LLM 直接生成 SQL 的不确定性。

### 三层结构

```
┌─────────────────────────────────────────────────────────────┐
│ 语义模型 (Model)                                            │
│   定义数据源表关系，描述 JOIN 路径                           │
│   base_table: 主表名                                        │
│   joins: [{table, on, type}] 关联配置                       │
│   metrics: [] 引用的指标列表                                │
│   dimensions: [] 引用的维度列表                             │
│   生命周期: draft → published → deprecated                  │
├─────────────────────────────────────────────────────────────┤
│ 语义指标 (Metric)                                           │
│   定义业务度量，含完整可执行 SQL                             │
│   三种类型:                                                 │
│     atomic   → 基础聚合 (SUM/COUNT/MAX/MIN)                 │
│     derived  → 衍生计算 (比率/差值/百分比)                   │
│     compound → 复合逻辑 (窗口函数/CTE/多步计算)              │
│   元数据: business_context / calculation_logic               │
│           applicable_scenarios / data_quality_notes          │
│   生命周期: draft → published → deprecated                  │
│   来源追踪: created_by (manual/agent/ai_suggest)            │
│   验证状态: validation_status (unvalidated/passed/failed)   │
│   Agent 关联: agent_session_id                              │
├─────────────────────────────────────────────────────────────┤
│ 语义维度 (Dimension)                                        │
│   定义分组/筛选属性                                         │
│   sql_expression: 列名或 SQL 表达式                         │
│   data_type: string | number | date                         │
│   grain: 时间粒度 (day/week/month/quarter/year)             │
│   date_column: 源日期列 (如 orders.created_at)              │
│   is_enum_dict: 是否为枚举值字典 (需手动标记)               │
│   values: 枚举值列表 [{key, value}] 或简单数组              │
│   生命周期: draft → published → deprecated                  │
│   来源追踪: created_by (manual/agent/ai_suggest)            │
│   Agent 关联: agent_session_id                              │
└─────────────────────────────────────────────────────────────┘
```

### 指标建立流程

```
方式 1: AI 自动推荐
  用户点击 "AI 推荐" → POST /ai-suggest-semantic
    → discoverSchema() 获取表结构 + executeSql() 获取样本数据
    → DeepSeek API 分析 Schema + 样本
    → 返回 { metrics, dimensions, models } 建议
    → 全部以 draft 状态创建
    → 用户审核后手动发布 (status: published)

方式 2: AI 预览 + 选择性创建
  POST /ai-preview-semantic → 仅返回建议不创建
  → 用户选择需要的项 → POST /batch-create-suggestions

方式 3: 批量导入
  POST /bulk-import-metrics { content, contentType }
  → contentType: "sql" | "document" | "description"
  → DeepSeek 从用户提供的内容 + Schema 生成指标/维度

方式 4: 指标开发 Agent (metric_dev)
  用户在聊天中选择 "指标开发" 频道
  → Agent 自动: 检查冲突 → 探索 Schema → 生成 SQL → 验证测试
  → 展示确认卡片 → 用户确认 → 自动保存草稿
  → 用户在指标管理页面审核后发布

方式 5: 手动创建
  MetricsPage 表单 → 填写指标/维度/模型信息
  → EXPLAIN 验证 SQL 合法性
  → 保存为 draft 或直接 published
```

### 指标查询流程

```
用户提问 "上个月销售额是多少"
  ↓
Agent 调用 lookup_semantic_layer(datasource_id, query="销售额")
  ↓
搜索逻辑 (jieba 中文分词):
  1. tokenize(query) → ["上个月", "销售额"]
  2. 匹配指标 name / display_name / aliases
  3. 关键词分词匹配 (支持中文分词)
  4. 匹配维度 name / display_name / values (枚举值搜索)
  ↓
匹配到指标 → resolveSemanticSql() 解析:
  - 返回指标 SQL + 类型 (atomic/derived/compound)
  - 返回可用维度列表 (含粒度、枚举值)
  - 返回修改提示 (如 "可调整时间粒度: day/week/month/quarter/year")
  ↓
Agent 决定:
  - 直接执行 SQL (skip_probe=true)
  - 修改维度/时间/筛选后执行
  - 标记 /* source: semantic_layer */ 注释
```

### 枚举值字典

维度可标记为 `is_enum_dict=true`，表示其 `values` 字段是人工维护的枚举值字典（如性别 `{1=男, 0=女}`），而非自动发现的值域。枚举字典来源：

1. **维度**: `is_enum_dict=true` + `values` 字段 `[{key, value}]`
2. **Schema 注解**: `domain_type="enum"` + `domain_values`

API: `GET /api/datasources/:dsId/dictionary/enums` 汇聚两种来源的枚举字典。

---

## 查询技能体系

查询技能是让 Agent 掌握复杂业务查询经验的核心机制。与语义层的确定性 SQL 不同，查询技能是**按查询场景划分的完整攻略**——包含核心表、关联路径、查询步骤和常见陷阱，帮助 Agent 处理语义层无法直接回答的复杂路径查询。**按数据源隔离**——电商库和财务库的查询技能完全独立。

### 与语义层的关系

```
用户提问
  ↓
Agent 优先链:
  1. lookup_semantic_layer → 匹配到指标 → 返回确定性 SQL ✅
  2. check qs-* skills    → 匹配到技能 → read_skill 加载完整攻略 → 按步骤查询 ✅
  3. lookup_examples      → 有历史示例 → 作为 Few-Shot 参考
  4. discover_schema      → 从零发现结构 → 生成 SQL (最不可靠)
```

语义层处理标准化的指标查询，查询技能处理需要业务经验的复杂路径查询，两者互补。

### 技能结构

每个查询技能包含以下字段：

| 字段 | 说明 | 示例 |
|---|---|---|
| `domain` | 业务域 | "账单"、"销售" |
| `name` | 技能名称 | "客户账单明细查询" |
| `trigger_keywords` | 触发关键词 (JSON数组) | `["账单", "billing", "客户明细"]` |
| `business_context` | 业务背景 | "客户账单包含主表和明细表，需关联查询" |
| `core_tables` | 核心表列表 (JSON数组) | `[{"table":"ads_bill","purpose":"账单汇总表"}]` |
| `join_path` | 关联路径 | "ads_bill → dim_customer ON customer_id" |
| `query_steps` | 查询步骤 | "1.从ads_bill取汇总 2.关联dim_customer取客户信息" |
| `example_sql` | 示例SQL | 完整可执行SQL，带中文注释 |
| `caveats` | 注意事项 | 数据质量、字段含义、常见陷阱 |
| `common_issues` | 常见问题 | 用户可能遇到的典型问题和处理方式 |

### 技能 → SKILL.md → System Prompt

启用的技能自动生成 `data/skills/qs-{skillId}/SKILL.md` 文件，由 pi-agent-core 的 Skill 机制加载：

```
用户启用/创建技能
  ↓
skill-formatter.ts → syncQuerySkillSkill()
  ↓
生成 data/skills/qs-{skillId}/SKILL.md:
  ---
  name: qs-{skillId}
  description: {domain}: {name}
  ---

  # {name}

  **业务域**: {domain}
  **触发关键词**: 关键词1, 关键词2

  ## 业务背景
  ...

  ## 核心表
  - **ads_bill**: 账单汇总表
  ...

  ## 查询步骤
  ...

  ## 示例SQL
  ```sql
  ...
  ```
  ↓
harness-factory.ts → loadAllSkills() → formatSkillsForSystemPrompt()
  ↓
System Prompt 注入技能摘要:
  "qs-{skillId}: {domain} - {name}"
  ↓
Agent 调用 read_skill 工具按需加载完整技能内容
```

### AI 生成查询技能

支持两种 AI 生成模式，均调用 DeepSeek API：

```
方式 1: 单个场景
  用户输入: 业务域 + 场景描述
  → POST /query-skills/generate
  → discoverSchema() 获取表结构
  → DeepSeek 分析 Schema + 场景
  → 返回完整技能数据 → 填入表单 → 用户确认保存

方式 2: 批量生成
  用户输入: 业务域
  → POST /query-skills/generate-batch
  → DeepSeek 识别 3-5 个典型场景
  → 自动创建所有技能 (coerceField处理AI返回的数组字段)
  → 刷新列表
```

注意：AI 生成的 `query_steps`、`caveats`、`common_issues` 可能是数组类型，前端通过 `Array.isArray()` 检查并 `join("\n")` 转为字符串。

### 前端页面

三栏布局：左(140px 域筛选) + 中(240px 技能列表) + 右(flex-1 编辑表单/详情)。支持：
- 每条技能可独立启用/禁用 (toggle)
- 「预览 AI 视角」按钮查看生成的 SKILL.md 内容
- 「AI 生成」按钮打开生成对话框 (单个/批量)
- 技能表单使用 `useState(buildInitialForm)` 初始化，避免 useEffect 重置 bug
- 父组件通过 `formKey` 计数器控制表单重新挂载

---

## 指标开发 Agent

指标开发 Agent (`metric_dev`) 是专门用于辅助用户开发业务指标和维度的专业 Agent。它遵循**"先查后建、验证闭环、自动修复、草稿安全"**的工作原则，所有创建的指标/维度均为 `draft` 状态，需用户在指标管理页面手动发布。

### 全部工具清单 (10 个)

| # | 工具名 | 类型 | 功能作用 |
|---|---|---|---|
| 1 | `discover_schema` | 共享 | 查询 INFORMATION_SCHEMA 获取表/列/外键元数据，填充 Schema 缓存 |
| 2 | `execute_sql` | 共享 | 执行 SELECT 查询 (含安全校验管线)，每次执行自动记录查询历史 |
| 3 | `lookup_semantic_layer` | 共享 | jieba 分词搜索已发布指标/维度，返回确定性 SQL + 维度/粒度信息 |
| 4 | `lookup_examples` | 共享 | jieba 分词搜索历史成功查询，评分排序取 top 3 作为 Few-Shot 参考 |
| 5 | `read_skill` | 共享 | 渐进式加载 qs-* 查询技能完整内容 (核心表/关联路径/查询步骤/示例SQL/注意事项) |
| 6 | `validate_and_test_metric` | 专用 | 验证指标 SQL: EXPLAIN 语法检查 → 执行测试 (LIMIT 10) → 结果分析 (空值比例/数值范围/合理性) |
| 7 | `check_metric_conflict` | 专用 | 检查拟创建指标与已有指标的冲突: 同名 (error) + 同显示名 (warning) |
| 8 | `create_metric_draft` | 专用 | 创建指标草稿: 冲突检查 → EXPLAIN 验证 → 保存为 draft (created_by:"agent") |
| 9 | `create_dimension_draft` | 专用 | 创建维度草稿: 保存为 draft (created_by:"agent") |
| 10 | `request_user_confirm` | 专用 | 展示确认卡片 (标题/描述/待确认项目列表) → 前端 ConfirmActionCard → 等待用户确认/取消 |

> **共享工具** (1-5): 与智能问数 Agent 共用，从 `tool-registration.ts` 共享池获取。
> **专用工具** (6-10): 仅指标开发 Agent 使用，不注册到智能问数 Agent 的工具集。

### 工作流程全景图

```
┌─────────────────────────────────────────────────────────────────────┐
│ 阶段 1: 用户进入指标开发频道                                        │
│                                                                     │
│ 前端 ChannelTabs 点击 "📊 指标开发"                                │
│   → setActiveChannel("metric_dev")                                  │
│   → 清空当前对话 + 消息列表                                         │
│   → initializedRef = null                                           │
│                                                                     │
│ ChatWindow 渲染:                                                    │
│   messages.length === 0 && activeChannel !== "query"                │
│   → 渲染 AgentWelcome 组件:                                         │
│     - 图标: 📊                                                      │
│     - 名称: "指标开发"                                              │
│     - 欢迎语: "你好！我是指标开发助手..."                           │
│     - 快捷操作按钮:                                                 │
│       [开发月度营收指标] [推荐常用指标] [检查指标冲突]               │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼ 用户输入 (如 "帮我开发一个月度营收指标")
┌─────────────────────────────────────────────────────────────────────┐
│ 阶段 2: WebSocket 初始化 + Agent 创建                               │
│                                                                     │
│ init 消息: { type:"init", payload:{ agentType:"metric_dev", ... } } │
│                                                                     │
│ chat-handler.handleInit():                                          │
│   1. agentType = "metric_dev" (非 "query")                         │
│   2. agentRegistry.createHarness("metric_dev", {                    │
│        datasourceId, modelProvider, modelId                         │
│      })                                                             │
│      ├─ AgentRegistry.getAgent("metric_dev") → AgentDefinition      │
│      ├─ AgentRegistry.getAgentTools("metric_dev") → 10 个工具       │
│      └─ AgentDefinition.harnessFactory(options, tools)              │
│           → createMetricDevHarness(options, tools)                  │
│                                                                     │
│ createMetricDevHarness():                                           │
│   1. listDatasources().find(id) → 获取数据源名称                   │
│   2. buildMetricDevSystemPrompt(context) → 构建专用系统提示         │
│   3. getModel(provider, modelId) → 获取 LLM 模型                   │
│   4. metricDevSessionRepo.create() → 创建会话                      │
│   5. new AgentHarness({ session, tools, resources:{},              │
│        systemPrompt, model, getApiKeyAndHeaders })                  │
│   6. harnessMap.set(conversationId, harness)                        │
│                                                                     │
│ 预填充 Schema 缓存:                                                │
│   discoverSchema(datasourceId) → setSchemaCache()                   │
│                                                                     │
│ 订阅事件 → 转发到前端 → init_success                                │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 阶段 3: 系统提示构建 (buildMetricDevSystemPrompt)                   │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ① 核心身份                                                     │ │
│ │    "你是一个专业的指标开发助手，隶属DataNova智能数据平台"        │ │
│ │    "你只负责创建指标和维度的草稿，不负责发布"                    │ │
│ │    "当前数据源: {datasourceName}"                               │ │
│ │─────────────────────────────────────────────────────────────────│ │
│ │ ② 当前数据源已有定义 (动态注入)                                │ │
│ │    listMetrics(dsId) → published/draft 分类统计                 │ │
│ │    listDimensions(dsId) → published 统计                       │ │
│ │    listModels(dsId) → 数量统计                                 │ │
│ │    → "已发布指标: N个 (名称1、名称2...)"                       │ │
│ │    → "草稿指标: M个"                                           │ │
│ │─────────────────────────────────────────────────────────────────│ │
│ │ ③ 工作原则 (5条)                                               │ │
│ │    1. 先查后建 — 开发前必须 check_metric_conflict              │ │
│ │    2. 验证闭环 — SQL必须 validate_and_test_metric              │ │
│ │    3. 自动修复 — 验证失败自动修复，最多重试3次                 │ │
│ │    4. 业务语义 — 充分利用 read_skill 和 lookup_examples        │ │
│ │    5. ⭐ 自动保存 — 验证通过后必须立即保存草稿                 │ │
│ │─────────────────────────────────────────────────────────────────│ │
│ │ ④ 工作流程 (10步)                                              │ │
│ │    理解需求 → 检查冲突 → 探索数据源 → 查看已有定义             │ │
│ │    → 了解业务知识 → 生成SQL并验证 → 修复迭代                   │ │
│ │    → 展示确认卡片 → 自动保存草稿 → 通知用户                    │ │
│ │─────────────────────────────────────────────────────────────────│ │
│ │ ⑤ ⭐ 关键：自动保存指令                                       │ │
│ │    - 验证通过 = 必须保存 (强制性)                              │ │
│ │    - 有保存工具 (create_metric_draft / create_dimension_draft)  │ │
│ │    - 先确认再保存 (request_user_confirm)                        │ │
│ │    - 用户明确说"保存"/"确认" → 跳过确认，直接保存              │ │
│ │─────────────────────────────────────────────────────────────────│ │
│ │ ⑥ SQL质量标准                                                  │ │
│ │    - 有意义的列别名 (AS子句)                                   │ │
│ │    - 聚合查询必须 GROUP BY                                     │ │
│ │    - 时间维度用 DATE_FORMAT                                    │ │
│ │    - 衍生指标处理分母为0 (NULLIF)                              │ │
│ │    - WHERE 过滤无效数据                                        │ │
│ │    - 大表必须有时间范围限制                                    │ │
│ │─────────────────────────────────────────────────────────────────│ │
│ │ ⑦ 指标元数据标准                                              │ │
│ │    name: snake_case | display_name: 中文                       │ │
│ │    metric_type: atomic/derived/compound                        │ │
│ │    business_context / calculation_logic /                      │ │
│ │    applicable_scenarios / data_quality_notes                   │ │
│ │─────────────────────────────────────────────────────────────────│ │
│ │ ⑧ 禁止行为 (8条)                                              │ │
│ │    ❌ 不直接发布指标 / 不修改已发布指标 / 不执行非SELECT        │ │
│ │    ❌ 不猜测字段名 / 不输出JSON让用户手动保存                   │ │
│ │    ❌ 不告知REST API路径 / 不反复要求确认而不执行               │ │
│ │    ❌ 不输出"请通过API保存" / 全中文回复                       │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼ harness.prompt(contextPrefix + text)
┌─────────────────────────────────────────────────────────────────────┐
│ 阶段 4: Agent 决策循环 — 工具调用详解                               │
│                                                                     │
│ LLM 根据系统提示的10步工作流程，逐步调用工具                        │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 1: check_metric_conflict(datasource_id, name,              │ │
│ │         display_name?, sql?)                                    │ │
│ │                                                                 │ │
│ │ 内部处理:                                                       │ │
│ │   1a. checkMetricNameConflict(dsId, name)                       │ │
│ │       → SELECT * FROM semantic_metrics                          │ │
│ │         WHERE datasource_id=? AND name=?                        │ │
│ │       → 找到同名指标:                                           │ │
│ │         ├─ status="deprecated" → severity:error                 │ │
│ │         │   suggestion:"已有弃用指标，建议覆盖或使用新名称"     │ │
│ │         └─ 其他状态 → severity:error                            │ │
│ │             suggestion:"请使用不同的英文名"                     │ │
│ │                                                                 │ │
│ │   1b. checkMetricDisplayNameConflict(dsId, display_name)        │ │
│ │       → SELECT * FROM semantic_metrics                          │ │
│ │         WHERE datasource_id=? AND display_name=?                │ │
│ │       → 找到同显示名 (排除与1a重复的):                          │ │
│ │         severity:warning                                        │ │
│ │         suggestion:"可能造成混淆"                               │ │
│ │                                                                 │ │
│ │   返回:                                                         │ │
│ │     无冲突 → "✅ 无冲突，可以使用该名称"                        │ │
│ │     有冲突 → "⚠️ 发现N个冲突" + 冲突详情列表                   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│                               ▼                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 2: discover_schema(datasource_id, table_names?)            │ │
│ │                                                                 │ │
│ │ 内部处理 (同智能问数 Agent):                                    │ │
│ │   1. 验证 datasource_id                                        │ │
│ │   2. discoverSchema() → INFORMATION_SCHEMA                     │ │
│ │      (TABLES + COLUMNS + KEY_COLUMN_USAGE)                      │ │
│ │   3. setSchemaCache() — 填充 validator 缓存                    │ │
│ │   4. discover_domains=true → discoverValueDomains()             │ │
│ │      → upsertDomainAnnotation()                                │ │
│ │   5. getAnnotations() + listQueryExamples()                    │ │
│ │   6. formatSchemaForPrompt() → Schema 文本                     │ │
│ │                                                                 │ │
│ │ → Agent 了解表结构、字段含义、外键关系                          │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│                               ▼                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 3: lookup_semantic_layer(datasource_id, query)             │ │
│ │                                                                 │ │
│ │ 内部处理 (同智能问数 Agent):                                    │ │
│ │   1. tokenize(query) → jieba 分词                               │ │
│ │   2. 搜索 published 指标: name/display_name/aliases/keywords   │ │
│ │   3. 搜索 published 维度: name/display_name/values/keywords    │ │
│ │   4. resolveSemanticSql() → SQL + 类型 + 维度 + 修改提示        │ │
│ │                                                                 │ │
│ │ → Agent 了解已有指标定义，避免重复创建                          │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│                               ▼                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 4: read_skill(skill_name) + lookup_examples(dsId, query)   │ │
│ │                                                                 │ │
│ │ read_skill:                                                     │ │
│ │   1. loadAllSkills().find(name)                                 │ │
│ │   2. formatSkillInvocation(skill) → 完整技能内容                │ │
│ │      (核心表/关联路径/查询步骤/示例SQL/注意事项/常见问题)       │ │
│ │                                                                 │ │
│ │ lookup_examples:                                                │ │
│ │   1. syncQueryExamplesFromHistory() → 同步新鲜示例              │ │
│ │   2. tokenize() → 评分排序 (7个评分因子) → top 3               │ │
│ │                                                                 │ │
│ │ → Agent 获取业务领域知识和历史查询参考                          │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│                               ▼ Agent 生成 SQL                      │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 5: validate_and_test_metric(datasource_id, sql,            │ │
│ │         metric_type)                                            │ │
│ │                                                                 │ │
│ │ ┌─────────────────────────────────────────────────────────────┐ │ │
│ │ │ 第 1 步: 语法验证                                           │ │ │
│ │ │   validateSqlViaExplain(datasource_id, sql)                  │ │ │
│ │ │   → getPool → getConnection → conn.query("EXPLAIN " + sql)  │ │ │
│ │ │   → 成功: { valid:true }                                    │ │ │
│ │ │   → 失败: { valid:false, error:"SQL语法错误..." }            │ │ │
│ │ │   → 返回错误 + suggestion:"请检查SQL语法" → 跳到修复迭代    │ │ │
│ │ └──────────────────────────────────┬──────────────────────────┘ │ │
│ │                                    │ 通过                        │ │
│ │                                    ▼                              │ │
│ │ ┌─────────────────────────────────────────────────────────────┐ │ │
│ │ │ 第 2 步: 执行测试                                           │ │ │
│ │ │   testSql = sql.trim().replace(/;?\s*$/, "") + " LIMIT 10" │ │ │
│ │ │   executeSql(datasource_id, testSql, {timeout:10000,        │ │ │
│ │ │             rowLimit:10})                                     │ │ │
│ │ │   → 获取最多 10 行样本数据                                  │ │ │
│ │ │   → 失败 → 返回错误 + suggestion → 跳到修复迭代             │ │ │
│ │ └──────────────────────────────────┬──────────────────────────┘ │ │
│ │                                    │ 成功                        │ │
│ │                                    ▼                              │ │
│ │ ┌─────────────────────────────────────────────────────────────┐ │ │
│ │ │ 第 3 步: 结果合理性分析                                     │ │ │
│ │ │                                                             │ │ │
│ │ │ 3a. 0行检测:                                                │ │ │
│ │ │     rowCount === 0 → warning "WHERE条件可能过严"             │ │ │
│ │ │                                                             │ │ │
│ │ │ 3b. 空值比例分析:                                          │ │ │
│ │ │     逐列计算 nullRatio = nullCount / rowCount               │ │ │
│ │ │     nullRatio > 0.5 → warning "列X空值比例N%，             │ │ │
│ │ │       可能JOIN条件遗漏或数据质量问题"                       │ │ │
│ │ │                                                             │ │ │
│ │ │ 3c. 数值范围检查:                                          │ │ │
│ │ │     数值列 → 检查负值 (非difference/change查询)             │ │ │
│ │ │       hasNegative → warning "列X包含负值，确认业务逻辑"     │ │ │
│ │ │     数值列 → 检查极大值                                    │ │ │
│ │ │       maxVal > 1e12 → warning "列X极大值，确认聚合逻辑"     │ │ │
│ │ └─────────────────────────────────────────────────────────────┘ │ │
│ │                                                                 │ │
│ │ 返回:                                                           │ │
│ │   valid=true  → "✅ 验证通过！返回N行数据" + test_result       │ │
│ │   valid=false → "❌ 验证失败" + errors 列表                    │ │
│ │   test_result: { row_count, sample_rows(前3行),                 │ │
│ │                  column_types, null_ratios, warnings }           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│                               ▼ 验证失败时                          │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 6: 修复迭代 (LLM 自动执行, 最多 3 次)                     │ │
│ │                                                                 │ │
│ │ 验证失败 → LLM 分析错误原因:                                    │ │
│ │   ├─ 语法错误 → 检查引号/括号/逗号 → 修正SQL                   │ │
│ │   ├─ 表不存在 → discover_schema 确认表名 → 修正SQL             │ │
│ │   ├─ 列不存在 → discover_schema 确认列名 → 修正SQL             │ │
│ │   ├─ 函数不存在 → 检查函数拼写 → 修正SQL                       │ │
│ │   └─ 0行结果 → 放宽WHERE/扩大日期/检查JOIN → 修正SQL           │ │
│ │                                                                 │ │
│ │ 修正后 → 重新调用 validate_and_test_metric                       │ │
│ │ 最多重试 3 次, 3 次后仍失败 → 向用户解释已尝试的修正            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                               │ 验证通过                            │
│                               ▼                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 7: request_user_confirm(title, description?, items?,       │ │
│ │         action_type?)                                           │ │
│ │                                                                 │ │
│ │ 内部处理:                                                       │ │
│ │   1. confirmId = "confirm-" + randomUUID().slice(0,8)           │ │
│ │   2. 构建确认内容:                                              │ │
│ │      title: "保存指标草稿"                                      │ │
│ │      description: "即将保存以下指标和维度"                      │ │
│ │      items: ["月度营收 (monthly_revenue)",                      │ │
│ │              "月份维度 (month)"]                                 │ │
│ │      actionType: "save_draft"                                   │ │
│ │   3. 返回 details.confirmAction                                 │ │
│ │                                                                 │ │
│ │ → chat-handler 检测 details.confirmAction                       │ │
│ │   → send({ type:"confirm_action", confirmAction })              │ │
│ │   → 前端 ConfirmActionCard 渲染:                                │ │
│ │     ┌──────────────────────────────────────┐                    │ │
│ │     │ 📋 保存指标草稿                      │                    │ │
│ │     │ 即将保存以下指标和维度                │                    │ │
│ │     │   1. 月度营收 (monthly_revenue)       │                    │ │
│ │     │   2. 月份维度 (month)                 │                    │ │
│ │     │                    [取消] [确认保存]  │                    │ │
│ │     └──────────────────────────────────────┘                    │ │
│ │                                                                 │ │
│ │ 注意: 如果用户已明确说"保存"/"确认"/"创建",                    │ │
│ │       Agent 跳过此步骤, 直接执行步骤 8                          │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│                               ▼ 用户点击"确认保存"                  │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 8: 保存草稿 (Agent 自动调用, 非用户手动)                  │ │
│ │                                                                 │ │
│ │ ┌─────────────────────────────────────────────────────────────┐ │ │
│ │ │ create_metric_draft(datasource_id, name, display_name,       │ │ │
│ │ │   sql, metric_type, description?, business_context?,         │ │ │
│ │ │   calculation_logic?, applicable_scenarios?,                 │ │ │
│ │ │   data_quality_notes?, dimensions?, unit?, category?,        │ │ │
│ │ │   default_sort?, agent_session_id?)                          │ │ │
│ │ │                                                             │ │ │
│ │ │ 内部处理:                                                   │ │ │
│ │ │   1. checkMetricNameConflict(dsId, name)                    │ │ │
│ │ │      → 同名已存在 → 返回错误, 不覆盖                        │ │ │
│ │ │   2. validateSqlViaExplain(dsId, sql)                       │ │ │
│ │ │      → EXPLAIN 失败 → 返回错误                              │ │ │
│ │ │   3. createMetric({                                         │ │ │
│ │ │        status: "draft",                                     │ │ │
│ │ │        created_by: "agent",                                 │ │ │
│ │ │        agent_session_id: sessionId,                         │ │ │
│ │ │        validation_status: "passed",                         │ │ │
│ │ │        validation_result: JSON.stringify({                   │ │ │
│ │ │          validated_at: new Date().toISOString()              │ │ │
│ │ │        }),                                                  │ │ │
│ │ │        version: 1                                           │ │ │
│ │ │      })                                                     │ │ │
│ │ │   4. 返回: "✅ 指标草稿已创建: {display_name} ({name})      │ │ │
│ │ │            类型: {type} | 状态: 草稿 | 验证: 通过"          │ │ │
│ │ └─────────────────────────────────────────────────────────────┘ │ │
│ │                                                                 │ │
│ │ ┌─────────────────────────────────────────────────────────────┐ │ │
│ │ │ create_dimension_draft(datasource_id, name, display_name,    │ │ │
│ │ │   sql_expression, data_type, description?, grain?,           │ │ │
│ │ │   date_column?, agent_session_id?)                           │ │ │
│ │ │                                                             │ │ │
│ │ │ 内部处理:                                                   │ │ │
│ │ │   1. createDimension({                                      │ │ │
│ │ │        status: "draft",                                     │ │ │
│ │ │        created_by: "agent",                                 │ │ │
│ │ │        agent_session_id: sessionId,                         │ │ │
│ │ │        is_enum_dict: false                                  │ │ │
│ │ │      })                                                     │ │ │
│ │ │   2. 返回: "✅ 维度草稿已创建: {display_name} ({name})      │ │ │
│ │ │            类型: {data_type} | 粒度: {grain}"               │ │ │
│ │ └─────────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│                               ▼                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 步骤 9: 通知用户                                                │ │
│ │                                                                 │ │
│ │ Agent 输出最终文本回复:                                         │ │
│ │   - ✅ 指标/维度名称 + 草稿状态                                │ │
│ │   - SQL 摘要 (前100字符)                                       │ │
│ │   - 验证结果 (通过/失败)                                        │ │
│ │   - 测试数据行数                                                │ │
│ │   - "请前往指标管理页面审核并发布"                              │ │
│ │                                                                 │ │
│ │ 前端渲染:                                                       │ │
│ │   MetricCard → 指标卡片 (名称/SQL/类型标签/草稿标签/验证标签)  │ │
│ │   DimensionCard → 维度卡片 (名称/表达式/类型/粒度标签)          │ │
│ │   ValidationResult → 验证结果 (✅通过 / ❌失败 + 错误详情)      │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 完整流程一图总览

```
用户选择 "📊 指标开发" 频道
  │
  ▼
ChannelTabs → setActiveChannel("metric_dev")
  │
  ▼
ChatWindow: 无消息 → AgentWelcome (欢迎语 + 快捷按钮)
  │
  ▼ 用户输入 (如 "帮我开发一个月度营收指标")
  │
  ▼
init { agentType:"metric_dev" } ──→ chat-handler
  │                                      │
  │                                      ▼
  │                               agentRegistry.createHarness("metric_dev")
  │                                 ├─ 获取 10 个工具
  │                                 ├─ buildMetricDevSystemPrompt()
  │                                 │   ├─ 核心身份
  │                                 │   ├─ 当前已有定义 (published/draft 统计)
  │                                 │   ├─ 工作原则 (先查后建/验证闭环/自动修复/草稿安全/自动保存)
  │                                 │   ├─ 10步工作流程
  │                                 │   ├─ 自动保存指令
  │                                 │   ├─ SQL质量标准
  │                                 │   ├─ 指标元数据标准
  │                                 │   └─ 禁止行为 (8条)
  │                                 └─ new AgentHarness({tools, systemPrompt, model})
  │
  ▼
Agent Loop (LLM 逐步调用工具):
  │
  ├─① check_metric_conflict(name, display_name)
  │     ├─ checkMetricNameConflict → SELECT WHERE name=? → 同名→error
  │     └─ checkMetricDisplayNameConflict → SELECT WHERE display_name=? → 同显示名→warning
  │
  ├─② discover_schema(datasource_id)
  │     → INFORMATION_SCHEMA → 表/列/FK → setSchemaCache → 注解+值域
  │
  ├─③ lookup_semantic_layer(datasource_id, query)
  │     → tokenize(jieba) → 搜 published 指标/维度 → resolveSemanticSql()
  │
  ├─④ read_skill + lookup_examples
  │     → qs-* 技能完整内容 + top 3 历史示例
  │
  ├─⑤ LLM 生成 SQL (遵循 SQL质量标准)
  │
  ├─⑥ validate_and_test_metric(sql)
  │     ├─ validateSqlViaExplain → EXPLAIN 语法检查
  │     ├─ executeSql(LIMIT 10) → 样本数据
  │     └─ 结果分析: 0行检测 / 空值比例>50% / 负值 / 极大值>1e12
  │
  ├─⑦ 验证失败? → LLM 分析原因 → 修正SQL → 重试⑥ (最多3次)
  │
  ├─⑧ request_user_confirm(title, items)
  │     → confirmAction → WS confirm_action 事件
  │     → 前端 ConfirmActionCard 渲染 → 用户 [确认保存] / [取消]
  │
  ├─⑨ 用户确认 → 保存草稿:
  │     ├─ create_metric_draft
  │     │   ├─ checkMetricNameConflict (同名→error)
  │     │   ├─ validateSqlViaExplain (失败→error)
  │     │   └─ createMetric({status:"draft", created_by:"agent", validation_status:"passed"})
  │     └─ create_dimension_draft
  │         └─ createDimension({status:"draft", created_by:"agent"})
  │
  └─⑩ 通知用户 → MetricCard + DimensionCard + ValidationResult
       → "请前往指标管理页面审核并发布"
```

### 前端交互组件

| 组件 | 触发条件 | 渲染内容 |
|---|---|---|
| `ChannelTabs` | 始终显示 | "💬 智能问数" / "📊 指标开发" 频道切换标签 |
| `AgentWelcome` | `messages.length===0 && activeChannel!=="query"` | 图标 + 欢迎语 + 3个快捷操作按钮 |
| `ConfirmActionCard` | `message.confirmAction && !isStreaming` | 标题 + 描述 + 待确认项目列表 + [取消][确认保存] 按钮 |
| `MetricCard` | Agent 返回指标创建结果时 | 名称 + SQL摘要 + 类型标签(原子/衍生/复合) + 草稿标签 + 验证标签 |
| `DimensionCard` | Agent 返回维度创建结果时 | 名称 + SQL表达式 + 类型标签 + 粒度标签 |
| `ValidationResult` | Agent 返回验证结果时 | ✅通过 / ❌失败 + 错误详情(步骤+消息+建议) + 警告列表 |

### 与智能问数 Agent 的对比

| 维度 | 智能问数 (`query`) | 指标开发 (`metric_dev`) |
|---|---|---|
| 工具数量 | 6 个 | 10 个 |
| 核心能力 | 查询数据、生成图表、探索Schema | 开发指标、验证SQL、检查冲突、创建草稿 |
| 系统提示 | buildDataNovaSystemPrompt | buildMetricDevSystemPrompt |
| 工具集差异 | 有 `ai_annotate_schema` | 有 `validate_and_test_metric` / `check_metric_conflict` / `create_metric_draft` / `create_dimension_draft` / `request_user_confirm` |
| 写操作 | 无 (只读查询) | 有 (创建 draft 指标/维度) |
| 用户确认 | 无 | 有 (request_user_confirm → ConfirmActionCard) |
| 入口视图 | chat | metrics |
| Harness 工厂 | createHarness (harness-factory.ts) | createMetricDevHarness (metric-dev-harness.ts) |

---

## 后端 Agent 处理流

### System Prompt 构建

`buildDataNovaSystemPrompt()` 组装多段系统提示（智能问数 Agent）：

```
基础指令 (仅 SELECT、结果摘要格式、错误自修正)
  ↓
数据源信息 (当前选中 + 所有可用数据源列表)
  ↓
Skills 描述 (从 data/skills/ 加载 SKILL.md 文件)
  ↓
Skill 使用指令 (read_skill 渐进加载)
  ↓
自定义指令 (用户可注入额外规则)
```

`buildMetricDevSystemPrompt()` 组装指标开发 Agent 的系统提示：

```
核心身份 (指标开发专家)
  ↓
当前数据源已有定义 (已发布/草稿指标数量)
  ↓
工作原则 (先查后建、验证闭环、自动修复、草稿安全、自动保存)
  ↓
工作流程 (10步完整流程)
  ↓
SQL 质量标准 (别名、GROUP BY、DATE_FORMAT、NULLIF 等)
  ↓
指标元数据标准 (name/display_name/metric_type/business_context 等)
  ↓
禁止行为 (不直接发布、不修改已发布指标、不猜测字段名等)
```

核心指令包括：
- **语义层优先**: 用户数据问题 → 先查 `lookup_semantic_layer`
- **查询技能补充**: 语义层未匹配 → 检查 `qs-*` 查询技能攻略
- **意图分类**: new_query / refine / drill_down / compare / explain / chat
- **归因分析**: "为什么"类问题 → 验证变化 → 维度拆解 → 根因定位
- **报告生成**: 多查询编排 → 结构化报告 (概览/核心指标/维度分析/趋势/异常/建议)
- **数据真实性红线**: 禁止编造数字/趋势/归因，结论必须可溯源到查询结果

### Agent Harness 生命周期

```
createHarness(options) — 智能问数 Agent
  ├─ 创建 6 个 Agent Tools
  ├─ 加载 Skills → loadAllSkills()
  ├─ 构建 System Prompt → buildDataNovaSystemPrompt()
  ├─ 创建 Session → InMemorySessionRepo.create()
  ├─ 获取 Model → getModel(provider, modelId)
  ├─ 创建 AgentHarness → harnessMap.set(conversationId, harness)
  └─ 返回 harness

createMetricDevHarness(options, tools) — 指标开发 Agent
  ├─ 从 AgentRegistry 获取工具集 (10 个工具)
  ├─ 构建 System Prompt → buildMetricDevSystemPrompt()
  ├─ 创建 Session → metricDevSessionRepo.create()
  ├─ 获取 Model → getModel(provider, modelId)
  ├─ 创建 AgentHarness → harnessMap.set(conversationId, harness)
  └─ 返回 harness

harness.prompt(text) → 启动 Agent 循环
  → LLM API 调用 (流式)
  → tool_use → 执行 tool → 结果回传 LLM
  → 重复直到最终文本回复

removeHarness(conversationId)
  → harness.abort() → harnessMap.delete()
```

### Agent Tools 详解

| 工具 | 参数 | 执行流程 | 返回 |
|---|---|---|---|
| `discover_schema` | `datasource_id`, `table_names?`, `discover_domains?` | `discoverSchema()` → INFORMATION_SCHEMA → `formatSchemaForPrompt()` + 注解 + 示例 | Schema 文本 (表/列/FK/注解/值域) |
| `execute_sql` | `datasource_id`, `sql`, `question?`, `skip_probe?`, `conversation_id?` | `validateSqlAgainstSchema()` → `checkLargeTableWithoutWhere()` → `executeSql()` → `createSqlQueryHistory()` | 查询结果表格 (最多 20 行) + 元数据 |
| `ai_annotate_schema` | `datasource_id`, `table_names` | Schema + 样本数据 → DeepSeek → 业务注解 | 注解列表 |
| `lookup_semantic_layer` | `datasource_id`, `query` | `tokenize(query)` (jieba分词) → 搜索已发布指标/维度 → `resolveSemanticSql()` | 匹配的 SQL + 类型 + 维度 + 提示 |
| `lookup_examples` | `datasource_id`, `query` | `tokenize(query)` (jieba分词) → 搜索 `sql_query_history` 成功记录 | Few-Shot 示例 SQL |
| `read_skill` | `skill_name` | 从 skills 数组查找 → `formatSkillInvocation()` 格式化 | 完整技能内容 |
| `validate_and_test_metric` | `datasource_id`, `sql`, `metric_type` | EXPLAIN 验证 → 执行测试 (LIMIT 10) → 结果分析 (空值/数值范围) | 验证报告 (valid/errors/warnings/test_result) |
| `check_metric_conflict` | `datasource_id`, `name`, `display_name?`, `sql?` | `checkMetricNameConflict()` + `checkMetricDisplayNameConflict()` | 冲突列表 (has_conflict/conflicts) |
| `create_metric_draft` | `datasource_id`, `name`, `display_name`, `sql`, `metric_type`, ... | 冲突检查 → `validateSqlViaExplain()` → `createMetric()` (status: draft, created_by: agent) | 创建结果 (metric_id/metric_name) |
| `create_dimension_draft` | `datasource_id`, `name`, `display_name`, `sql_expression`, `data_type`, ... | `createDimension()` (status: draft, created_by: agent) | 创建结果 (dimension_id/dimension_name) |
| `request_user_confirm` | `title`, `description?`, `items?`, `action_type?` | 生成 confirmId → 返回 confirmAction 详情 | 确认卡片数据 (confirmAction) |

### 中文分词 (tokenizer.ts)

```
用户查询 "上个月销售额"
  ↓
tokenize() 处理:
  1. 转小写 → "上个月销售额"
  2. 分离中文/非中文段 → ["上个月销售额"]
  3. 中文段 → nodejieba.cut() → ["上个月", "销售额"]
  4. 非中文段 → 空格分割
  5. 过滤: 去标点、去单字、去空白
  ↓
["上个月", "销售额"]
  ↓
用于 lookup_semantic_layer / lookup_examples 的关键词匹配
```

### SQL 执行安全管线

```
execute_sql 请求
  ↓
1. isSelectQuery() — 仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN
  ↓
2. validateSqlAgainstSchema() — Schema 缓存校验
   ├─ 表名校验: 不存在 → Levenshtein 拼写建议 → 阻塞
   └─ 列名校验: 不存在 → Levenshtein 建议 → 警告 (不阻塞)
  ↓
3. checkLargeTableWithoutWhere() — 大表无 WHERE 警告
   (INFORMATION_SCHEMA.TABLE_ROWS > 100K 且无 WHERE)
  ↓
4. executeSql() — 执行
   ├─ SET SESSION max_execution_time = 30000
   ├─ 智能 LIMIT: 无 LIMIT → 追加 LIMIT 1000
   └─ 返回 { columns, rows, rowCount, executionTime }
  ↓
5. createSqlQueryHistory() — 自动记录 (成功/失败均记录)
```

---

## 前端功能模块

### 视图导航 (10 个视图)

| 视图 | 组件 | 功能 |
|---|---|---|
| `dashboard` | `DashboardPage` | 数据概览仪表盘 |
| `chat` | `ChatWindow` | 自然语言对话查询 (核心功能, 多 Agent 频道切换) |
| `datasources` | `DatasourcePage` | MySQL 数据源 CRUD + 连接测试 |
| `schemas` | `SchemaPage` | Schema 浏览 + AI 注解 + 值域发现 |
| `metrics` | `MetricsPage` | 语义层管理 (指标/维度/模型 CRUD) |
| `querySkills` | `QuerySkillsPage` | 查询技能管理 (按场景划分攻略，AI生成，按数据源隔离) |
| `analysis` | `AnalysisPage` | 自助分析 + 定时查询管理 |
| `dictionary` | `DictionaryPage` | 数据字典全局搜索 + 表关系图 |
| `queryHistory` | `QueryHistoryPage` | SQL 查询历史记录 |
| `insights` | `InsightsPage` | BI 看板 (查询统计/高频查询/收藏) |

### 全局状态 (Zustand)

```typescript
// stores/app.ts
{
  view: AppView,                    // 当前视图
  selectedDatasourceId: string,     // 选中数据源
  selectedDatasourceName: string,   // 数据源名称
  selectedConversationId: string,   // 当前对话
  selectedMetricId: string,         // 选中指标
  modelProvider: string,            // LLM Provider
  modelId: string,                  // LLM Model
  onboardingCompleted: boolean,     // 新手引导完成状态
  activeChannel: string,            // 当前 Agent 频道 (默认 "query")
  channelSessions: Record<string, string>, // 每个频道的会话 ID
}
```

### 聊天模块组件

| 组件 | 职责 |
|---|---|
| `ChatWindow` | 主编排器: 消息状态管理、WS 事件处理、多 Agent 频道切换、发送消息 |
| `ChatInput` | 输入框: Enter 发送、Shift+Enter 换行 |
| `DatasourceSelector` | 数据源选择器: 切换对话的数据源 |
| `ModelSelector` | 模型选择器: 切换 LLM Provider/Model |
| `ChannelTabs` | Agent 频道切换: 智能问数 / 指标开发 |
| `AgentWelcome` | Agent 欢迎页: 图标 + 描述 + 快捷操作按钮 |
| `MessageList` | 消息列表: 自动滚动到底部 |
| `MessageItem` | 单条消息: 条件渲染用户/助手消息 |
| `StepIndicator` | Agent 步骤: thinking / tool_call / tool_result |
| `SqlBlock` | SQL 代码块: 语法高亮 + 复制按钮 |
| `TableResult` | 查询结果表格: TanStack Table + 分页 + 排序 |
| `ChartView` | 图表视图: 类型切换 + 图表渲染 |
| `MarkdownContent` | Markdown 渲染: 业务分析摘要 |
| `ResultSummaryCard` | 结果总结: 关键发现/趋势/异常 |
| `ValidationBanner` | 校验提示: SQL 验证警告 |
| `AttributionView` | 归因分析: 事实确认/维度拆解/根因定位 |
| `ConfirmActionCard` | 确认卡片: 指标草稿保存确认 (确认/取消按钮) |
| `MetricCard` | 指标卡片: 名称/SQL/类型/验证状态/测试行数 |
| `DimensionCard` | 维度卡片: 名称/表达式/类型/粒度 |
| `ValidationResult` | 验证结果: 通过/失败/错误详情/警告 |
| `FeedbackButtons` | 反馈: 👍👎 消息反馈 |

### 新手引导

首次使用时自动展示 `OnboardingWizard`，引导用户：
1. 创建数据源 (MySQL 连接配置)
2. 验证连接
3. 进入聊天开始提问

如果已有数据源则自动跳过引导。

---

## 数据组件与可视化

### 图表类型推断

`chart-inference.ts` 根据 `TableData` 的列类型自动推断最佳图表类型：

```
TableData { columns, rows }
  ↓
推断逻辑:
  ├─ 1 行数据 + 数值列 → KPI 卡片
  ├─ 1 个分类列 + 1 个数值列 → 饼图
  ├─ 2 个数值列 → 散点图
  ├─ 日期/时间 X 轴 → 折线图
  ├─ 多个数值列 + 时间 X 轴 → 面积图
  └─ 分类 X 轴 + 数值 Y 轴 → 柱状图
```

### 图表渲染器 (ChartRenderers.tsx)

共享图表组件，基于 Recharts，被 ChatView 和 InsightsPage 共同使用：

| 渲染器 | 用途 | 特性 |
|---|---|---|
| `BarChartRenderer` | 分类对比 | 长标签自动切换水平布局, maxBarSize=48 |
| `LineChartRenderer` | 趋势分析 | monotone 插值, 多线对比 + Legend |
| `AreaChartRenderer` | 趋势+量感 | fillOpacity=0.2, 适合累积指标 |
| `PieChartRenderer` | 占比分析 | 内环 (innerRadius=60), 百分比标签, 自动合并小比例 |
| `ScatterChartRenderer` | 相关性分析 | X/Y 数值轴, 自定义 Tooltip |
| `KpiCardRenderer` | 核心指标 | 大号数字 + 指标名, 千分位格式化 |

### 表格组件 (TableResult)

基于 TanStack Table 的数据表格：
- 自动列宽调整
- 排序、筛选
- 分页 (大数据集)
- NULL 值显示为 "NULL"
- 响应式布局

---

## 定时查询与告警

### 调度器架构

```
服务器启动 → startScheduler()
  → 遍历所有数据源 → 加载 enabled 的定时查询
  → registerScheduledQuery() → node-cron 注册 cron 任务
  → 定时触发 → executeScheduledQuery()
```

### 定时查询执行流程

```
executeScheduledQuery(queryId, datasourceId, sql, alertConditions)
  ↓
1. executeSql(datasourceId, sql, { timeout: 30000, rowLimit: 100 })
  ↓
2. 记录执行结果
   ├─ updateScheduledQuery() → 更新 last_run_at / last_run_status / last_run_result
   └─ createExecutionHistory() → 保存详细执行历史
  ↓
3. 检查告警条件 (如有配置)
   checkAlertConditions() → 遍历条件列表:
   ├─ "above"  → value > threshold → 创建 warning/critical 告警
   ├─ "below"  → value < threshold → 创建告警
   ├─ "change_above" → 与上次成功执行环比 → 环比超阈值 → 创建告警
   └─ "change_below" → 环比下降超阈值 → 创建告警
```

### 告警条件格式

```json
[
  {
    "metric_column": "revenue",
    "condition": "change_above",   // above | below | change_above | change_below
    "threshold": 20                // 绝对值阈值 或 环比百分比阈值
  }
]
```

告警严重级别：
- **critical**: 值超过阈值 1.5 倍 / 环比超过阈值 2 倍
- **warning**: 其他触发情况

---

## 数据存储

| 存储 | 技术 | 内容 | 持久化 |
|---|---|---|---|
| `data/datanova.db` | SQLite WAL | 数据源配置、对话元数据、Schema 注解、语义层定义、查询技能、定时查询、查询历史、书签、告警 | ✅ |
| InMemorySessionRepo | 内存 | Agent 对话上下文 (服务重启后丢失) | ❌ |
| 对话消息 | SQLite WAL | `saveMessage()` / `listMessages()` 持久化 | ✅ |
| 前端 state | React useState | 当前对话消息列表 (切换对话时丢失) | ❌ |
| `data/skills/` | 文件系统 | Skill 定义 (`SKILL.md`)，注入 System Prompt | ✅ |
| `data/annotations/` | 文件系统 | Schema 注解文件 | ✅ |
| Schema 缓存 | 内存 Map | `validator.ts` 中的表名/列名缓存，由 `discover_schema` 填充 | ❌ 重启丢失 |
| Harness Map | 内存 Map | `harnessMap: Map<conversationId, AgentHarness>` | ❌ 重启丢失 |

### SQLite 核心表

| 表 | 内容 |
|---|---|
| `datasources` | MySQL 数据源连接配置 (密码 AES-256-GCM 加密) |
| `conversations` | 对话元数据 (标题、数据源、创建时间) |
| `messages` | 对话消息 (角色、内容、时间戳) |
| `semantic_metrics` | 语义指标 (SQL、类型、元数据、状态、来源、验证状态) |
| `semantic_dimensions` | 语义维度 (表达式、数据类型、粒度、枚举值、来源) |
| `semantic_models` | 语义模型 (主表、JOIN 配置、状态) |
| `schema_annotations` | Schema 注解 (业务描述、值域、样本数据) |
| `scheduled_queries` | 定时查询 (cron 表达式、SQL、告警条件) |
| `execution_history` | 定时查询执行历史 |
| `query_alerts` | 查询告警记录 |
| `sql_query_history` | 所有 SQL 执行记录 (成功/失败、耗时、行数) |
| `query_skill` | 查询技能 (业务域、触发关键词、核心表、关联路径、查询步骤、示例SQL) |
| `query_bookmarks` | 收藏的 SQL 查询 (BI 报告卡片) |

### 语义指标/维度扩展字段

| 字段 | 说明 | 值域 |
|---|---|---|
| `status` | 生命周期状态 | `draft` → `published` → `deprecated` |
| `created_by` | 创建来源 | `manual` / `agent` / `ai_suggest` |
| `agent_session_id` | Agent 会话 ID (追踪 Agent 创建的记录) | 可空 |
| `validation_status` | 验证状态 (仅指标) | `unvalidated` / `passed` / `failed` |
| `validation_result` | 验证结果详情 (JSON, 仅指标) | 可空 |

---

## REST API

### 数据源管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/datasources` | 列出数据源 |
| POST | `/api/datasources` | 创建数据源 |
| PUT | `/api/datasources/:id` | 更新数据源 |
| DELETE | `/api/datasources/:id` | 删除数据源 |
| POST | `/api/datasources/:id/test` | 测试连接 |

### Schema 与注解

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/schemas?datasourceId=` | 获取 Schema |
| POST | `/api/schemas/:dsId/ai-annotate` | AI 注解 Schema |
| GET | `/api/schemas/:dsId/browse` | 浏览 Schema 表 |

### 语义层 (指标/维度/模型)

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/datasources/:dsId/metrics` | 列出语义指标 |
| POST | `/api/datasources/:dsId/metrics` | 创建指标 (EXPLAIN 验证) |
| PUT | `/api/datasources/:dsId/metrics/:id` | 更新指标 |
| DELETE | `/api/datasources/:dsId/metrics/:id` | 删除指标 |
| POST | `/api/datasources/:dsId/metrics/:id/test` | 测试指标 SQL (LIMIT 10) |
| GET | `/api/datasources/:dsId/dimensions` | 列出语义维度 |
| POST | `/api/datasources/:dsId/dimensions` | 创建维度 (EXPLAIN 验证) |
| PUT | `/api/datasources/:dsId/dimensions/:id` | 更新维度 |
| DELETE | `/api/datasources/:dsId/dimensions/:id` | 删除维度 |
| GET | `/api/datasources/:dsId/models` | 列出语义模型 |
| POST | `/api/datasources/:dsId/models` | 创建模型 |
| PUT | `/api/datasources/:dsId/models/:id` | 更新模型 |
| DELETE | `/api/datasources/:dsId/models/:id` | 删除模型 |

### AI 语义层推荐

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/datasources/:dsId/ai-suggest-semantic` | AI 推荐 + 自动创建 (draft) |
| POST | `/api/datasources/:dsId/ai-preview-semantic` | AI 仅预览，不创建 |
| POST | `/api/datasources/:dsId/ai-suggest-dimensions` | AI 推荐维度 + 自动创建 |
| POST | `/api/datasources/:dsId/ai-preview-dimensions` | AI 仅预览维度 |
| POST | `/api/datasources/:dsId/bulk-import-metrics` | 批量导入 (SQL/文档/描述 → 指标) |
| POST | `/api/datasources/:dsId/batch-create-suggestions` | 从预览建议批量创建 |

### 枚举值字典

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/datasources/:dsId/dictionary/enums` | 汇聚维度+注解的枚举字典 |
| PUT | `/api/datasources/:dsId/dictionary/enums/:source/:id` | 更新枚举值 |

### 定时查询与告警

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/datasources/:dsId/scheduled-queries` | 列出定时查询 |
| POST | `/api/datasources/:dsId/scheduled-queries` | 创建定时查询 |
| PUT | `/api/datasources/:dsId/scheduled-queries/:id` | 更新定时查询 |
| DELETE | `/api/datasources/:dsId/scheduled-queries/:id` | 删除定时查询 |
| POST | `/api/datasources/:dsId/scheduled-queries/:id/execute` | 立即执行 |
| GET | `/api/datasources/:dsId/scheduled-queries/:id/history` | 执行历史 |
| POST | `/api/datasources/:dsId/scheduled-queries/generate-sql` | AI 生成 SQL |
| GET | `/api/datasources/:dsId/query-alerts` | 查询告警列表 |

### 查询技能

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/datasources/:dsId/query-skills` | 列出所有技能 (可选 `?domain=` 过滤) |
| GET | `/api/datasources/:dsId/query-skills/domains` | 列出业务域 |
| GET | `/api/datasources/:dsId/query-skills/preview` | 预览生成的 SKILL.md 内容 |
| POST | `/api/datasources/:dsId/query-skills/generate` | AI 生成单个技能 |
| POST | `/api/datasources/:dsId/query-skills/generate-batch` | AI 批量生成技能 |
| GET | `/api/datasources/:dsId/query-skills/:id` | 获取单个技能 |
| POST | `/api/datasources/:dsId/query-skills` | 创建技能 |
| PUT | `/api/datasources/:dsId/query-skills/:id` | 更新技能 |
| DELETE | `/api/datasources/:dsId/query-skills/:id` | 删除技能 |
| PUT | `/api/datasources/:dsId/query-skills/:id/toggle` | 启用/禁用切换 |

### 数据字典

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/datasources/:dsId/dictionary/search` | 全局搜索 (指标/维度/表/字段) |
| GET | `/api/datasources/:dsId/dictionary/tables/:tableName` | 表详情 |
| GET | `/api/datasources/:dsId/dictionary/recent-changes` | 最近变更 |

### Insights BI 看板

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/datasources/:dsId/insights/stats` | 查询统计 (总量/成功率/高频表/日趋势) |
| GET | `/api/datasources/:dsId/insights/top-queries` | 高频查询 |
| POST | `/api/datasources/:dsId/insights/execute` | 执行指定 SQL |

### 收藏查询

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/datasources/:dsId/bookmarks` | 列出收藏查询 |
| POST | `/api/datasources/:dsId/bookmarks` | 创建收藏 |
| DELETE | `/api/datasources/:dsId/bookmarks/:id` | 删除收藏 |
| POST | `/api/datasources/:dsId/bookmarks/:id/execute` | 执行收藏查询 |

### 其他

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/skills` | 列出 Skills |
| GET | `/api/conversations?datasourceId=` | 列出对话 |
| POST | `/api/conversations` | 创建对话 |
| PUT | `/api/conversations/:id/title` | 更新标题 |
| DELETE | `/api/conversations/:id` | 删除对话 |
| POST | `/api/conversations/:convId/messages/:msgId/feedback` | 消息反馈 |
| GET | `/api/models` | 列出可用模型/Provider |
| GET | `/api/datasources/:dsId/query-history` | 数据源 SQL 历史 |
| GET | `/api/query-history` | 全局 SQL 历史 |

---

## WebSocket 协议

### 客户端 → 服务端

```jsonc
// 初始化 Session (必须先发送, 含 agentType 路由)
{ "type": "init", "payload": { "conversationId", "datasourceId", "datasourceName", "modelProvider", "modelId", "agentType" } }
// agentType: "query" (智能问数, 默认) | "metric_dev" (指标开发)

// 发送消息
{ "type": "message", "text": "用户输入", "payload": { "conversationId" } }

// 重置上下文
{ "type": "reset_context", "payload": { "conversationId" } }
```

### 服务端 → 客户端

```jsonc
{ "type": "connected" }                    // 连接建立
{ "type": "init_success", "conversationId" } // 初始化成功
{ "type": "message_history", "messages" }  // 历史消息 (init 时发送)
{ "type": "error", "error": "..." }        // 错误
{ "type": "agent_start" }                  // Agent 开始
{ "type": "thinking", "content": "..." }   // 思考过程
{ "type": "message_start" }                // 消息流开始
{ "type": "text_delta", "delta": "..." }   // 文本增量
{ "type": "tool_execution_start", "toolName", "args" }  // Tool 调用开始
{ "type": "tool_execution_end", "toolName", "result", "isError" }  // Tool 调用结束
{ "type": "tool_result", "toolName", "details" }  // Tool 结果详情
{ "type": "confirm_action", "confirmAction": { "id", "title", "description", "items", "actionType" } }  // 确认卡片
{ "type": "validation_warning", "message" } // SQL 验证警告
{ "type": "validation_error", "message" }   // SQL 验证错误
{ "type": "agent_end" }                    // Agent 结束
{ "type": "settled" }                      // Agent 完全结束
{ "type": "response_complete", "content" } // 完整响应
```

---

## 项目结构

```
pi_datanova/
├── packages/
│   ├── server/                    # Hono 后端
│   │   └── src/
│   │       ├── index.ts           # 入口，路由注册，WebSocket，启动调度器，initAgentFramework()
│   │       ├── config.ts          # 数据目录配置
│   │       ├── store.ts           # SQLite CRUD (全表操作, 含冲突检查函数)
│   │       ├── crypto.ts          # AES-256-GCM 加密/解密
│   │       ├── types.ts           # 共享类型定义 (SchemaInfo, TableSchema, etc.)
│   │       ├── scheduler.ts       # Cron 定时查询调度器 + 告警引擎
│   │       ├── agent/
│   │       │   ├── agent-registry.ts       # AgentRegistry 类 — Agent & 工具注册池
│   │       │   ├── agent-registration.ts   # registerAllAgents() + registerAllTools()
│   │       │   ├── tool-registration.ts    # registerAllTools() — 共享工具池注册
│   │       │   ├── harness-factory.ts      # 智能问数 Agent Harness 创建 + harnessMap 管理
│   │       │   ├── metric-dev-harness.ts   # 指标开发 Agent Harness 创建
│   │       │   ├── prompt-builder.ts       # 智能问数 System Prompt 构建
│   │       │   ├── prompt-builder-metric-dev.ts # 指标开发 System Prompt 构建
│   │       │   ├── skill-manager.ts        # Skill 文件加载 (SKILL.md)
│   │       │   ├── skill-formatter.ts      # QuerySkill → SKILL.md 格式化与同步
│   │       │   ├── semantic-sql-builder.ts # 语义层确定性 SQL 解析
│   │       │   └── tools/
│   │       │       ├── discover-schema.ts      # discover_schema: INFORMATION_SCHEMA 查询
│   │       │       ├── execute-sql.ts          # execute_sql: 安全执行+验证+历史记录
│   │       │       ├── ai-annotate-schema.ts   # ai_annotate_schema: AI 业务注解
│   │       │       ├── lookup-semantic-layer.ts # lookup_semantic_layer: 语义层搜索+SQL解析 (jieba分词)
│   │       │       ├── lookup-examples.ts      # lookup_examples: 历史成功查询 Few-Shot (jieba分词)
│   │       │       ├── read-skill.ts           # read_skill: 渐进式技能加载
│   │       │       ├── validate-and-test-metric.ts # validate_and_test_metric: 指标SQL验证+测试
│   │       │       ├── check-metric-conflict.ts    # check_metric_conflict: 指标冲突检查
│   │       │       ├── create-metric-draft.ts      # create_metric_draft: 创建指标草稿
│   │       │       ├── create-dimension-draft.ts   # create_dimension_draft: 创建维度草稿
│   │       │       ├── request-confirm.ts          # request_user_confirm: 请求用户确认
│   │       │       ├── tokenizer.ts                # 中文分词 (nodejieba)
│   │       │       └── ai-suggest-semantic.ts  # ai_suggest_semantic_layer: AI 语义层建议
│   │       ├── mysql/
│   │       │   ├── pool.ts        # MySQL 连接池管理 (per-datasource)
│   │       │   ├── executor.ts    # SQL 执行 (超时+限行+EXPLAIN验证+validateSqlViaExplain)
│   │       │   ├── discovery.ts   # INFORMATION_SCHEMA 查询 + 值域发现
│   │       │   └── validator.ts   # SQL 验证 (白名单+Schema缓存+Levenshtein建议)
│   │       ├── routes/
│   │       │   ├── datasources.ts # 数据源 CRUD
│   │       │   ├── schemas.ts     # Schema 查询 + AI 注解
│   │       │   ├── skills.ts      # Skill 列表
│   │       │   ├── conversations.ts # 对话 CRUD + 消息反馈
│   │       │   ├── models.ts      # 模型/Provider 列表
│   │       │   ├── semantic.ts    # 语义层完整 CRUD + AI推荐 + 批量导入 + 枚举字典
│   │       │   ├── query-skills.ts # 查询技能 CRUD + AI生成 + 预览
│   │       │   ├── scheduled.ts   # 定时查询 CRUD + AI生成SQL
│   │       │   ├── dictionary.ts  # 数据字典搜索 + 表详情
│   │       │   ├── insights.ts    # Insights 统计 + 高频查询 + SQL执行
│   │       │   ├── bookmarks.ts   # 收藏查询 CRUD + 执行
│   │       │   └── test-helpers.ts # 测试辅助
│   │       └── ws/
│   │           └── chat-handler.ts  # WebSocket 事件处理 + agentType路由 + 转发
│   └── web/                       # React 前端
│       └── src/
│           ├── main.tsx           # React 挂载点
│           ├── App.tsx            # 根组件，10 视图切换 + 新手引导
│           ├── api/
│           │   └── client.ts      # REST API 客户端 (泛型 request<T>)
│           ├── agents/
│           │   ├── registry.ts    # AGENT_REGISTRY 定义 + getAgentById()
│           │   └── types.ts       # AgentInfo & EntryPoint 类型
│           ├── stores/
│           │   └── app.ts         # Zustand 全局状态 (含 activeChannel, channelSessions)
│           ├── hooks/
│           │   ├── useWebSocket.ts    # WebSocket 连接管理 + 自动重连
│           │   └── useAgentStream.ts  # Agent 流处理 + processWsEvent + ChatMessage/ConfirmAction 类型
│           ├── utils/
│           │   ├── chart-inference.ts       # 图表类型推断 (6种图表+KPI)
│           │   └── markdown-table-extractor.ts # Markdown 表格解析
│           └── components/
│               ├── Layout.tsx     # 侧边栏 + 主内容布局
│               ├── Sidebar.tsx    # 导航侧边栏 (8 nav items)
│               ├── ChartRenderers.tsx # 共享图表渲染 (6种 + KPI卡片)
│               ├── Dashboard/
│               │   └── DashboardPage.tsx  # 数据概览页
│               ├── Chat/
│               │   ├── ChatWindow.tsx    # 主聊天编排器 (多Agent频道切换)
│               │   ├── ChatInput.tsx     # 用户输入框
│               │   ├── DatasourceSelector.tsx # 数据源选择器
│               │   ├── ModelSelector.tsx # 模型选择器
│               │   ├── ChannelTabs.tsx   # Agent 频道切换标签
│               │   ├── AgentWelcome.tsx  # Agent 欢迎页 + 快捷操作
│               │   ├── MessageList.tsx   # 消息列表 (自动滚动)
│               │   ├── MessageItem.tsx   # 单条消息渲染
│               │   ├── StepIndicator.tsx # thinking/tool 步骤显示
│               │   ├── SqlBlock.tsx      # SQL 代码块 + 复制
│               │   ├── TableResult.tsx   # 查询结果表格 (TanStack Table)
│               │   ├── ChartView.tsx     # 图表视图切换
│               │   ├── MarkdownContent.tsx # Markdown 渲染
│               │   ├── ResultSummaryCard.tsx # 结果总结卡片
│               │   ├── ValidationBanner.tsx  # 校验提示横幅
│               │   ├── AttributionView.tsx   # 归因分析视图
│               │   ├── ConfirmActionCard.tsx # 确认卡片 (草稿保存确认)
│               │   ├── FeedbackButtons.tsx   # 👍👎 反馈按钮
│               │   └── cards/
│               │       ├── MetricCard.tsx      # 指标卡片
│               │       ├── DimensionCard.tsx   # 维度卡片
│               │       └── ValidationResult.tsx # 验证结果卡片
│               ├── Datasource/
│               │   ├── DatasourcePage.tsx  # 数据源管理
│               │   ├── DatasourceList.tsx
│               │   └── DatasourceForm.tsx
│               ├── Schema/
│               │   ├── SchemaPage.tsx       # Schema 注解管理
│               │   ├── SchemaTree.tsx       # Schema 树形浏览
│               │   └── SchemaEnhancement.tsx # Schema 增强面板
│               ├── Metrics/
│               │   ├── MetricsPage.tsx      # 语义层管理 (侧边栏: 语义层目录 + 枚举值字典)
│               │   ├── MetricForm.tsx       # 指标表单
│               │   ├── DimensionForm.tsx    # 维度表单 (含 is_enum_dict 标记)
│               │   └── ModelForm.tsx        # 模型表单
│               ├── QuerySkills/
│               │   ├── QuerySkillsPage.tsx # 查询技能管理 (三栏布局)
│               │   ├── SkillForm.tsx       # 技能编辑表单
│               │   └── AIGenerateDialog.tsx # AI 生成对话框
│               ├── Analysis/
│               │   └── AnalysisPage.tsx     # 自助分析 + 定时查询管理
│               ├── Dictionary/
│               │   ├── DictionaryPage.tsx   # 数据字典
│               │   ├── BrowseTree.tsx       # 浏览树
│               │   ├── RelationshipDiagram.tsx # 表关系图
│               │   └── EntryDetail.tsx      # 条目详情
│               ├── History/
│               │   └── QueryHistoryPage.tsx # SQL 查询历史
│               ├── Insights/
│               │   ├── InsightsPage.tsx     # BI 看板
│               │   ├── StatsBar.tsx         # 统计栏
│               │   ├── ChartCard.tsx        # 图表卡片
│               │   └── BookmarkDialog.tsx   # 收藏对话框
│               ├── Reports/
│               │   ├── ReportView.tsx       # 报告视图
│               │   └── ReportExport.tsx     # 报告导出
│               └── Onboarding/
│                   └── OnboardingWizard.tsx # 新手引导
├── data/                          # 运行时数据 (gitignored)
│   ├── datanova.db                # SQLite 数据库
│   ├── skills/                    # Skill 定义文件 (qs-{id}/SKILL.md 为查询技能)
│   └── annotations/               # Schema 注解文件
├── scripts/                       # 辅助脚本
├── docs/                          # 文档
│   ├── superpowers/specs/         # 功能规格说明
│   └── analysis/                  # 优化分析文档
└── .env.example                   # 环境变量模板
```

---

## 关键设计决策

1. **多 Agent 架构**: 通过 `AgentRegistry` 管理多个专业 Agent，每个有独立的工具集和系统提示。`chat-handler.ts` 根据 `agentType` 路由到对应 Agent。新增 Agent 只需注册定义，无需修改核心流程。

2. **语义层 + 查询技能优先路由**: 用户数据问题 → 先查 `lookup_semantic_layer`，匹配则返回确定性 SQL；未匹配则检查 `qs-*` 查询技能攻略；再未匹配走 `discover_schema` + `execute_sql`。保证已建模指标和已有技能的高准确度。

3. **确定性 SQL 生成**: 语义层 SQL 由人工或 AI 创建后存入数据库，查询时直接返回，不依赖 LLM 实时生成。三种指标类型 (atomic/derived/compound) 有不同的修改约束提示。

4. **指标开发 Agent 工作流**: 先查后建 (check_metric_conflict) → 验证闭环 (validate_and_test_metric) → 自动修复 (最多3次) → 确认卡片 (request_user_confirm) → 自动保存草稿 (create_metric_draft/create_dimension_draft)。所有草稿标记 `created_by: "agent"`，可追溯来源。

5. **对话上下文仅存内存**: `InMemorySessionRepo` 维护 Agent 上下文，服务重启后丢失。但对话消息本身通过 `saveMessage()`/`listMessages()` 持久化到 SQLite。

6. **单 WebSocket 连接**: 前端维护一个 WebSocket 连接，所有对话共享。通过 `init` 消息切换 conversationId，`agentType` 参数路由到对应 Agent。

7. **乐观 UI 更新**: 用户消息立即显示，不等服务端确认。

8. **SQL 安全管线**: 多层验证 — 白名单检查 → Schema 缓存表名校验 → 列名 Levenshtein 建议 → 大表无 WHERE 警告 → 30s 超时 → 1000 行限制 → 自动记录历史。

9. **多 Provider 支持**: Agent 主模型通过 `@earendil-works/pi-ai` 支持 Anthropic/OpenAI/DeepSeek；辅助 AI 调用 (语义层推荐、SQL 生成、Schema 注解) 使用 DeepSeek API 直接 fetch。

10. **Schema 缓存**: `discover_schema` 工具执行时填充 `validator.ts` 的内存缓存，用于后续 SQL 校验。缓存重启后丢失，首次查询时重建。

11. **指标生命周期**: draft → published → deprecated。AI 推荐默认创建为 draft，用户审核后手动发布。EXPLAIN 验证在创建/更新时执行，连接失败时允许保存为 draft。Agent 创建的指标标记 `created_by: "agent"` + `agent_session_id`。

12. **定时查询 + 告警**: 基于 node-cron 的自动执行，支持 4 种告警条件 (above/below/change_above/change_below)，自动与上次执行结果环比。

13. **数据字典 + 枚举字典**: 维度 `is_enum_dict` 字段区分自动发现的值域和人工维护的枚举字典。枚举字典支持 `{key, value}` 格式（如性别 `1=男, 0=女`）。

14. **数据真实性红线**: System Prompt 严格禁止编造数字/趋势/归因，所有结论必须基于 `execute_sql` 返回的真实查询结果。违反红线视为严重错误。

15. **Insights 页面**: 通过 API 访问 (`view: "insights"`)，不显示在侧边栏导航中。

16. **自助分析页面**: 整合了定时查询功能（原 ScheduledPage 已合并到 AnalysisPage）。

17. **全中文 UI**: 前端所有文本使用简体中文，新文本应遵循此约定。

18. **查询技能按数据源隔离**: 每个数据源有独立的查询技能库，不同业务线的查询攻略完全独立。Agent 在对话初始化时加载对应数据源的已启用技能 (qs-* 前缀 SKILL.md)。

19. **查询技能与语义层互补**: 语义层处理标准化指标查询 (确定性 SQL)，查询技能处理复杂路径查询 (攻略式步骤)。Agent 优先链: `lookup_semantic_layer` → `qs-*` skills → `lookup_examples` → `discover_schema`。

20. **查询技能 DB + SKILL.md 双写**: 技能数据存储在 SQLite (`query_skill` 表)，启用的技能同步生成 `data/skills/qs-{skillId}/SKILL.md` 文件。SKILL.md 由 pi-agent-core 的 Skill 机制按需加载，摘要注入 System Prompt，完整内容通过 `read_skill` 工具按需读取。

21. **中文分词 (nodejieba)**: `tokenizer.ts` 使用 nodejieba 进行中文精确模式分词，用于 `lookup_semantic_layer` 和 `lookup_examples` 的关键词匹配。非中文文本回退到空格分割。懒加载字典，首次调用时初始化。

22. **确认卡片交互**: `request_user_confirm` 工具触发 `confirm_action` WebSocket 事件，前端渲染 `ConfirmActionCard` 组件。用户点击确认/取消后发送文本消息回 Agent，Agent 据此执行或取消操作。避免 Agent 在未经用户确认的情况下执行重要操作。
