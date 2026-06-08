# DataNova 项目架构总览

> 整理日期：2026-06-08
> 本文档涵盖项目整体架构、技术栈、数据流和组件关系。

---

## 一、项目定位

DataNova 是一个 **AI 驱动的 SQL 数据查询助手**。用户用自然语言提问，后台 Agent 自动发现数据库结构、生成并执行 SQL 查询，最后以表格和分析的形式展示结果。

核心流程：**自然语言 → Agent 理解意图 → 发现 Schema → 生成 SQL → 执行查询 → 格式化结果 → 返回分析**

---

## 二、技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| **前端** | React 19 + Vite 6 + TailwindCSS 3 + Zustand 5 + TanStack Table | SPA 应用 |
| **后端** | Hono + Node.js (ESM) | HTTP + WebSocket 服务 |
| **元数据存储** | better-sqlite3 | 项目自身配置（数据源、注解、语义层等） |
| **目标数据库** | mysql2 | 用户要查询的业务数据库 |
| **AI 引擎** | @earendil-works/pi-agent-core (AgentHarness) | Agent 运行时（循环、工具调度、事件） |
| **LLM 调用** | @earendil-works/pi-ai | 多 Provider LLM 抽象层 |
| **参数定义** | @sinclair/typebox | 工具参数 schema 定义和校验 |
| **加密** | AES-256-GCM | 数据源密码加密存储 |

---

## 三、项目结构

```
pi_datanova/
├── packages/
│   ├── server/                    # 后端服务
│   │   └── src/
│   │       ├── index.ts           # Hono 入口，注册所有路由和 WebSocket
│   │       ├── config.ts          # 路径配置（DATA_DIR、DB_PATH 等）
│   │       ├── store.ts           # SQLite CRUD（所有数据持久化）
│   │       ├── types.ts           # TypeScript 类型定义
│   │       ├── crypto.ts          # AES-256-GCM 加解密
│   │       ├── ws/
│   │       │   └── chat-handler.ts # WebSocket 事件处理（Agent 生命周期）
│   │       ├── agent/
│   │       │   ├── harness-factory.ts  # AgentHarness 创建工厂
│   │       │   ├── prompt-builder.ts   # System Prompt 组装
│   │       │   ├── skill-manager.ts    # Skill 文件加载/管理
│   │       │   ├── semantic-sql-builder.ts # 语义层确定性 SQL 构建
│   │       │   └── tools/
│   │       │       ├── discover-schema.ts        # 工具①
│   │       │       ├── execute-sql.ts            # 工具②
│   │       │       ├── ai-annotate-schema.ts     # 工具③
│   │       │       ├── lookup-semantic-layer.ts  # 工具④
│   │       │       ├── lookup-examples.ts        # 工具⑤
│   │       │       └── ai-suggest-semantic.ts    # 工具⑥
│   │       ├── mysql/
│   │       │   ├── pool.ts       # MySQL 连接池管理
│   │       │   ├── discovery.ts  # INFORMATION_SCHEMA 查询
│   │       │   ├── executor.ts   # SQL 执行器（超时、行数限制）
│   │       │   └── validator.ts  # SQL 安全校验 + Schema 缓存
│   │       └── routes/
│   │           ├── datasources.ts  # 数据源 CRUD API
│   │           ├── schemas.ts      # Schema 注解 API
│   │           ├── semantic.ts     # 语义层（指标/维度/模型）API
│   │           ├── conversations.ts # 对话 CRUD API
│   │           ├── skills.ts       # Skill 管理 API
│   │           ├── models.ts       # LLM 模型列表 API
│   │           ├── scheduled.ts    # 定时查询 API
│   │           └── dictionary.ts   # 数据字典 API
│   │
│   └── web/                       # 前端应用
│       └── src/
│           ├── App.tsx             # 视图路由
│           ├── api/client.ts       # REST API 封装
│           ├── stores/app.ts       # Zustand 全局状态
│           ├── hooks/
│           │   ├── useWebSocket.ts   # WebSocket 连接管理
│           │   └── useAgentStream.ts # Agent 事件处理
│           └── components/
│               ├── Chat/           # 聊天相关组件
│               │   ├── ChatWindow.tsx    # 主聊天窗口
│               │   ├── ChatInput.tsx     # 输入框
│               │   ├── MessageList.tsx   # 消息列表
│               │   ├── MessageItem.tsx   # 单条消息
│               │   ├── ModelSelector.tsx # 模型选择器
│               │   ├── DatasourceSelector.tsx # 数据源选择器
│               │   ├── SqlBlock.tsx      # SQL 代码块
│               │   ├── TableResult.tsx   # 数据表格
│               │   └── FeedbackButtons.tsx # 反馈按钮
│               ├── Datasource/     # 数据源管理
│               ├── Schema/         # Schema 注解
│               ├── Metrics/        # 语义层管理
│               ├── Scheduled/      # 定时查询
│               └── Dictionary/     # 数据字典
│
├── data/                           # 运行时数据目录
│   ├── datanova.db                 # SQLite 数据库
│   ├── skills/                     # 用户手动创建的 Skill 文件
│   │   └── bill-query/
│   │       └── SKILL.md
│   └── annotations/                # 自动生成的注解 Skill
│
└── docs/                           # 项目文档（本目录）
```

---

## 四、完整数据流（端到端）

```
用户在聊天框输入 "上个月销售额是多少？"
                │
                ▼
┌── ChatInput.tsx ────────────────────────────────────────────┐
│  ChatWindow.handleSend()                                    │
│    → 乐观 UI：立即显示用户消息（灰色气泡）                     │
│    → useAgentStream.sendMessage(text, conversationId)        │
│      → useWebSocket.send({ type:"message", text, ... })      │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket JSON
                       ▼
┌── chat-handler.ts（服务端） ─────────────────────────────────┐
│  onMessage → handleMessage()                                 │
│    1. saveMessage() → 存 SQLite                              │
│    2. harness = getHarness(conversationId)                   │
│       → harness.prompt("上个月销售额是多少？")                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌── AgentHarness 内部循环 ─────────────────────────────────────┐
│  Agent Loop：                                                │
│    ① 调 LLM → LLM 说"先查语义层"                            │
│       → lookup_semantic_layer("销售额")                      │
│       → 匹配到指标 revenue = SUM(amount)，自动生成 SQL        │
│    ② 调 LLM → LLM 说"执行这条 SQL"                          │
│       → execute_sql(SELECT SUM(amount)...)                   │
│       → 返回 [{revenue: 125800}]                             │
│    ③ 调 LLM → LLM 分析数据，生成自然语言回复                  │
│                                                              │
│  全程通过 subscribe 发射事件 → forwardEvent() 推 WebSocket     │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket 事件流
                       ▼
┌── ChatWindow.tsx（前端） ────────────────────────────────────┐
│  processWsEvent(event) → 更新 React state：                  │
│    "agent_start"  → 创建流式助手消息                          │
│    "text_delta"   → 逐字追加文本                              │
│    "tool_execution_start/end" → 显示工具执行步骤              │
│    "agent_end"    → 标记完成                                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 五、两个数据库

| | SQLite（datanova.db） | MySQL（用户数据库） |
|---|---|---|
| **存什么** | 数据源配置、注解、语义层、对话、Skills、定时查询 | 用户要分析的真实业务数据 |
| **谁用** | store.ts 的所有 CRUD 函数 | pool.ts → discovery.ts / executor.ts |
| **位置** | `data/datanova.db` | 用户在 DatasourceForm 里填的连接 |

---

## 六、六层"知识"递进关系

当用户问数据问题时，Agent 按可靠性从高到低尝试：

```
第 1 层：语义层（用户定义，程序拼 SQL）
  → 100% 可靠，命中后直接执行
  → 例：用户问"销售额" → lookup_semantic_layer → execute_sql

第 2 层：历史查询示例（Few-Shot 参考）
  → 较可靠，给 LLM 提供类似问题的 SQL 参考
  → 例：lookup_examples → 返回 3 条 (问题→SQL) → LLM 模仿

第 3 层：业务注解（表/字段的业务含义）
  → 提升 LLM 理解，不保证 SQL 正确
  → 例：discover_schema 返回结构 + 注解 → LLM 理解上下文

第 4 层：Skills 文件（领域知识手册）
  → 给 LLM 提供行为指南
  → 例：SKILL.md → 拼进 system prompt → LLM 参考

第 5 层：裸表结构（INFORMATION_SCHEMA）
  → LLM 从零写 SQL，最不可靠但兜底
  → 例：discover_schema → LLM 分析生成 SQL

第 6 层：裸 LLM（没有任何上下文）
  → 完全靠 LLM 自身知识，可能编造表名和字段
```

---

## 七、WebSocket 协议

### 客户端 → 服务端

| type | payload | 说明 |
|---|---|---|
| `init` | `{ conversationId, datasourceId, modelProvider, modelId }` | 初始化 Agent |
| `message` | `{ text, payload: { conversationId } }` | 发送用户消息 |
| `reset_context` | `{ conversationId }` | 重置对话上下文 |

### 服务端 → 客户端

| type | 说明 |
|---|---|
| `connected` | WebSocket 连接成功 |
| `init_success` | Agent 初始化完成 |
| `message_history` | 加载的持久化消息 |
| `agent_start` | Agent 开始运行 |
| `thinking` | 推理/思考内容 |
| `message_start` | 新消息开始 |
| `text_delta` | 流式文本增量 |
| `tool_execution_start` | 工具开始执行 |
| `tool_execution_end` | 工具执行完成 |
| `tool_result` | 工具执行详细结果 |
| `agent_end` | Agent 运行结束 |
| `settled` | Agent 完全空闲 |
| `response_complete` | 响应完成 |
| `validation_warning` | SQL 校验警告 |
| `validation_error` | SQL 校验错误 |
| `error` | 错误 |

---

## 八、REST API 路由一览

所有路由注册于 `packages/server/src/index.ts`：

| 路径 | 方法 | 说明 |
|---|---|---|
| `/api/datasources` | GET/POST | 数据源列表/创建 |
| `/api/datasources/:id` | GET/PUT/DELETE | 数据源详情/更新/删除 |
| `/api/datasources/:id/test` | POST | 测试连接 |
| `/api/schemas/:dsId` | GET | 获取 Schema + 注解 |
| `/api/schemas/:dsId/annotations` | PUT/DELETE | 注解管理 |
| `/api/schemas/:dsId/ai-annotate` | POST | AI 自动注解 |
| `/api/datasources/:dsId/metrics` | GET/POST | 语义指标管理 |
| `/api/datasources/:dsId/dimensions` | GET/POST | 语义维度管理 |
| `/api/datasources/:dsId/models` | GET/POST | 语义模型管理 |
| `/api/datasources/:dsId/scheduled-queries` | GET/POST | 定时查询管理 |
| `/api/datasources/:dsId/query-alerts` | GET | 查询告警列表 |
| `/api/datasources/:dsId/dictionary/search` | GET | 数据字典搜索 |
| `/api/conversations` | GET/POST | 对话管理 |
| `/api/conversations/:convId/messages/:msgId/feedback` | POST | 查询反馈 |
| `/api/skills` | GET | Skill 列表 |
| `/api/models` | GET | 可用 LLM 模型列表 |
| `/api/health` | GET | 健康检查 |
