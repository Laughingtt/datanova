# DataNova

AI 驱动的 SQL 数据查询助手。通过自然语言对话，自动发现数据库 Schema、生成并执行 SQL 查询，以表格形式展示结果。

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│  packages/web (React + Vite)                            │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ ChatInput │→│ ChatWindow   │→│ useAgentStream     │  │
│  └──────────┘  └──────┬───────┘  └────────┬──────────┘  │
│                       │ Zustand           │ WebSocket    │
│                       │ (app store)       │ (useWebSocket│
│              ┌────────┴────────┐          └──────┬──────┘  │
│              │ MessageList     │                 │         │
│              │ MessageItem     │                 │         │
│              │ StepIndicator   │                 │         │
│              │ SqlBlock        │                 │         │
│              │ TableResult     │                 │         │
│              └─────────────────┘                 │         │
└──────────────────────────────────────────────────┼─────────┘
                                                   │ WS
                              Vite Proxy ──────────┼─────────┐
                              /api → :3000/api                │
                              /ws  → ws://:3000/ws            │
                                                              │
┌──────────────────────────────────────────────────────────────┼─┐
│  packages/server (Hono + Node.js)                            │ │
│  ┌────────────────────────────────────────────────────────┐  │ │
│  │ REST API (/api/*)                                      │  │ │
│  │  /datasources  /schemas  /skills  /conversations  /models│ │
│  └────────────────────────────────────────────────────────┘  │ │
│  ┌────────────────────────────────────────────────────────┐  │ │
│  │ WebSocket (/ws/chat)                                   │  │ │
│  │  chat-handler.ts → harness-factory.ts → AgentHarness   │←┼─┘
│  │       ↓ event forwarding          ↓                     │
│  │  forwardEvent(ws)          prompt-builder.ts            │
│  │                             skill-manager.ts            │
│  │                             tools/discover-schema.ts    │
│  │                             tools/execute-sql.ts        │
│  └────────────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ store.ts     │  │ mysql/       │  │ crypto.ts        │   │
│  │ (SQLite WAL) │  │ pool.ts      │  │ (AES-256-GCM)    │   │
│  │ datanova.db  │  │ executor.ts  │  │                  │   │
│  │              │  │ discovery.ts │  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────────┘
         │                                    │
    better-sqlite3                        mysql2
         │                                    │
    datanova.db                          MySQL Server
    (元数据/配置)                        (用户数据库)
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19, Vite 6, TailwindCSS 3, Zustand 5, TanStack Table |
| 后端 | Hono, @hono/node-server, @hono/node-ws |
| AI Agent | @earendil-works/pi-agent-core (AgentHarness), @earendil-works/pi-ai (多 Provider) |
| 数据库 | better-sqlite3 (元数据), mysql2 (用户查询) |
| 加密 | AES-256-GCM (数据源密码加密) |

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

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API Key | — |
| `OPENAI_API_KEY` | OpenAI API Key | — |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | — |
| `DATANOVA_ENCRYPTION_KEY` | 数据源密码加密密钥 (32字节) | `datanova-default-key-32b!` |
| `DATANOVA_DIR` | 数据目录 | `./data` |
| `PORT` | 后端端口 | `3000` |
| `DATANOVA_PROVIDER` | 默认 LLM Provider | `anthropic` |
| `DATANOVA_MODEL` | 默认 LLM Model | `claude-sonnet-4-20250514` |

## 完整对话数据流

### 1. 用户输入 → 前端状态

```
用户在 ChatInput 输入文本 → 按 Enter
  ↓
ChatInput.handleSubmit() → onSend(text)
  ↓
ChatWindow.handleSend(text):
  1. 立即创建 userMsg = { id, role:"user", content:text, timestamp }
  2. setMessages(prev => [...prev, userMsg])  ← 乐观更新 UI
  3. sendMessage(text, conversationId)
```

### 2. 前端 → 后端 (WebSocket)

```
useAgentStream.sendMessage(text, conversationId)
  ↓
useWebSocket.send({ type:"message", text, payload:{ conversationId } })
  ↓
ws.send(JSON.stringify(data))
  ↓
浏览器 → ws://localhost:5173/ws/chat
  ↓
Vite Proxy 转发 → ws://localhost:3000/ws/chat
```

**首次对话需先初始化 Session：**
```
send({ type:"init", payload:{ conversationId, datasourceId, datasourceName, modelProvider, modelId } })
  ↓
后端创建 AgentHarness → 订阅事件 → 返回 init_success
```

### 3. 后端处理 → AI Provider 调用

```
chat-handler.onMessage → handleMessage()
  ↓
从 harnessMap 查找 AgentHarness (按 conversationId)
  ↓
harness.prompt(text)  ← 启动 AI Agent 循环
  ↓
AgentHarness 调用 LLM API (Anthropic/OpenAI/DeepSeek...)
  - System Prompt: buildDataNovaSystemPrompt() 构建
    - 基础指令 (仅 SELECT 查询)
    - 数据源信息
    - Skill 描述 (从 data/skills/ 加载)
    - 自定义指令
  - Tools: discover_schema, execute_sql
  - Conversation History: InMemorySessionRepo 维护
```

### 4. AI Agent 循环 (多轮 Tool 调用)

```
LLM 返回 → 可能包含 tool_use
  ↓
┌─────────────────────────────────────────────┐
│ Agent Loop (可能多轮):                       │
│                                              │
│  1. LLM 生成回复 (流式 text_delta)           │
│     ↓                                        │
│  2. LLM 请求调用 tool                        │
│     ↓                                        │
│  3. 执行 tool:                               │
│     - discover_schema: 查询 INFORMATION_SCHEMA│
│     - execute_sql: 执行 SELECT (30s超时,1000行)│
│     ↓                                        │
│  4. tool 结果返回给 LLM                      │
│     ↓                                        │
│  5. LLM 基于结果继续生成 (回到步骤1)          │
│     ↓                                        │
│  6. LLM 输出最终文本回复                      │
└─────────────────────────────────────────────┘
```

### 5. 事件流 → 前端渲染

AgentHarness 在 Agent 循环中持续发出事件，chat-handler 通过 `forwardEvent(ws, event)` 转发到前端：

| Harness 事件 | WebSocket 事件 | 前端处理 |
|---|---|---|
| `agent_start` | `{ type:"agent_start" }` | 创建新 assistant 消息 (isStreaming:true) |
| `turn_start` | `{ type:"thinking" }` | 添加 thinking 步骤 |
| `message_start` | `{ type:"message_start" }` | 确保 assistant 消息存在 |
| `message_update(text_delta)` | `{ type:"text_delta", delta }` | 追加文本到 content |
| `message_update(thinking_delta)` | `{ type:"thinking", content }` | 添加 thinking 步骤 |
| `tool_execution_start` | `{ type:"tool_execution_start", toolName, args }` | 添加 tool_call 步骤 |
| `tool_execution_end` | `{ type:"tool_execution_end", result, isError }` | 更新为 tool_result |
| `tool_result` | `{ type:"tool_result", details }` | 更新 tool_result (含详情) |
| `agent_end` | `{ type:"agent_end" }` | isStreaming = false |
| `settled` | `{ type:"settled" }` | isStreaming = false |
| — | `{ type:"response_complete", content }` | 最终完整文本 |

### 6. 前端渲染管线

```
WebSocket 事件到达 → useWebSocket.onMessage
  ↓
ChatWindow.handleWsEvent → processWsEvent(event, currentAssistantRef)
  ↓
返回更新后的 ChatMessage → setMessages() → React 重渲染
  ↓
MessageList → MessageItem 渲染每条消息:
  - 用户消息: 纯文本
  - 助手消息:
    - StepIndicator: thinking / tool_call / tool_result 步骤
    - Markdown 内容 (含 SQL 代码块)
    - SqlBlock: SQL 提取 + 复制按钮
    - TableResult: 查询结果表格 (TanStack Table)
```

## 数据存储

| 存储 | 技术 | 内容 | 持久化 |
|---|---|---|---|
| `data/datanova.db` | SQLite WAL | 数据源配置、对话元数据、Schema 注解、系统配置 | ✅ |
| InMemorySessionRepo | 内存 | 对话上下文 (消息历史) | ❌ 重启丢失 |
| 前端 state | React useState | 当前对话消息列表 | ❌ 切换对话丢失 |
| `data/skills/` | 文件系统 | Skill 定义 (SKILL.md) | ✅ |
| `data/annotations/` | 文件系统 | Schema 注解 | ✅ |

## REST API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/datasources` | 列出数据源 |
| POST | `/api/datasources` | 创建数据源 |
| PUT | `/api/datasources/:id` | 更新数据源 |
| DELETE | `/api/datasources/:id` | 删除数据源 |
| POST | `/api/datasources/:id/test` | 测试连接 |
| GET | `/api/schemas?datasourceId=` | 获取 Schema |
| GET | `/api/skills` | 列出 Skills |
| GET | `/api/conversations?datasourceId=` | 列出对话 |
| POST | `/api/conversations` | 创建对话 |
| PUT | `/api/conversations/:id/title` | 更新标题 |
| DELETE | `/api/conversations/:id` | 删除对话 |
| GET | `/api/models` | 列出可用模型/Provider |

## WebSocket 协议

### 客户端 → 服务端

```jsonc
// 初始化 Session (必须先发送)
{ "type": "init", "payload": { "conversationId", "datasourceId", "datasourceName", "modelProvider", "modelId" } }

// 发送消息
{ "type": "message", "text": "用户输入", "payload": { "conversationId" } }
```

### 服务端 → 客户端

```jsonc
{ "type": "connected" }                    // 连接建立
{ "type": "init_success", "conversationId" } // 初始化成功
{ "type": "error", "error": "..." }        // 错误
{ "type": "agent_start" }                  // Agent 开始
{ "type": "thinking", "content": "..." }   // 思考过程
{ "type": "message_start" }                // 消息流开始
{ "type": "text_delta", "delta": "..." }   // 文本增量
{ "type": "tool_execution_start", "toolName", "args" }  // Tool 调用开始
{ "type": "tool_execution_end", "toolName", "result", "isError" }  // Tool 调用结束
{ "type": "tool_result", "toolName", "details" }  // Tool 结果详情
{ "type": "agent_end" }                    // Agent 结束
{ "type": "settled" }                      // Agent 完全结束
{ "type": "response_complete", "content" } // 完整响应
```

## 项目结构

```
pi_datanova/
├── packages/
│   ├── server/                    # Hono 后端
│   │   └── src/
│   │       ├── index.ts           # 入口，路由注册，WebSocket
│   │       ├── config.ts          # 数据目录配置
│   │       ├── store.ts           # SQLite CRUD (数据源/对话/注解/配置)
│   │       ├── crypto.ts          # AES-256-GCM 加密
│   │       ├── types.ts           # 共享类型定义
│   │       ├── agent/
│   │       │   ├── harness-factory.ts   # AgentHarness 创建 + 内存 Map
│   │       │   ├── prompt-builder.ts    # System Prompt 构建
│   │       │   ├── skill-manager.ts     # Skill 文件加载
│   │       │   └── tools/
│   │       │       ├── discover-schema.ts  # discover_schema tool
│   │       │       └── execute-sql.ts      # execute_sql tool
│   │       ├── mysql/
│   │       │   ├── pool.ts        # MySQL 连接池管理
│   │       │   ├── executor.ts    # SQL 执行 (安全检查+超时+限行)
│   │       │   └── discovery.ts   # INFORMATION_SCHEMA 查询
│   │       ├── routes/
│   │       │   ├── datasources.ts # 数据源 CRUD
│   │       │   ├── schemas.ts     # Schema 查询
│   │       │   ├── skills.ts      # Skill 列表
│   │       │   ├── conversations.ts # 对话 CRUD
│   │       │   └── models.ts      # 模型/Provider 列表
│   │       └── ws/
│   │           └── chat-handler.ts  # WebSocket 事件处理+转发
│   └── web/                       # React 前端
│       └── src/
│           ├── main.tsx           # React 挂载点
│           ├── App.tsx            # 根组件，视图切换
│           ├── api/
│           │   └── client.ts      # REST API 客户端
│           ├── stores/
│           │   └── app.ts         # Zustand 全局状态
│           ├── hooks/
│           │   ├── useWebSocket.ts    # WebSocket 连接管理
│           │   └── useAgentStream.ts  # Agent 流处理 + ChatMessage 类型
│           └── components/
│               ├── Layout.tsx     # 侧边栏 + 主内容布局
│               ├── Sidebar.tsx    # 导航侧边栏
│               └── Chat/
│                   ├── ChatWindow.tsx    # 主聊天编排器
│                   ├── ChatInput.tsx     # 用户输入框
│                   ├── MessageList.tsx   # 消息列表 (自动滚动)
│                   ├── MessageItem.tsx   # 单条消息渲染
│                   ├── StepIndicator.tsx # thinking/tool 步骤显示
│                   ├── SqlBlock.tsx      # SQL 代码块 + 复制
│                   ├── TableResult.tsx   # 查询结果表格
│                   └── ModelSelector.tsx # 模型/Provider 选择器
├── data/                          # 运行时数据 (gitignored)
│   ├── datanova.db                # SQLite 数据库
│   ├── skills/                    # Skill 定义文件
│   └── annotations/               # Schema 注解文件
├── scripts/                       # 辅助脚本
├── docs/                          # 文档
└── .env.example                   # 环境变量模板
```

## 关键设计决策

1. **对话历史仅存内存**: `InMemorySessionRepo` 维护上下文，服务重启后丢失。前端也不持久化消息。
2. **单 WebSocket 连接**: 前端维护一个 WebSocket 连接，所有对话共享。通过 `init` 消息切换 conversationId。
3. **乐观 UI 更新**: 用户消息立即显示，不等服务端确认。
4. **SQL 安全限制**: `execute_sql` 仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN，30 秒超时，最多 1000 行。
5. **多 Provider 支持**: 通过 `@earendil-works/pi-ai` 支持 Anthropic、OpenAI、DeepSeek 等，前端可动态切换。
