# CLAUDE.md — DataNova 项目指南

## 项目概述

DataNova 是 AI 驱动的 SQL 数据查询助手。用户通过自然语言对话，Agent 自动发现数据库 Schema、生成并执行 SQL 查询，以表格形式展示结果。

## 技术栈

- **Monorepo**: npm workspaces (`packages/server`, `packages/web`)
- **后端**: Hono + Node.js, better-sqlite3 (元数据), mysql2 (用户查询)
- **前端**: React 19 + Vite 6 + TailwindCSS 3 + Zustand 5
- **AI**: @earendil-works/pi-agent-core (AgentHarness), @earendil-works/pi-ai (多 Provider LLM)
- **加密**: AES-256-GCM (数据源密码)

## 开发命令

```bash
npm install                    # 安装所有依赖
npm run dev:server             # 后端开发 (tsx watch, :3000)
npm run dev:web                # 前端开发 (Vite, :5173, 代理到后端)
npm run build                  # 构建前后端
```

## 数据流核心路径

完整对话流程 (详见 README.md):

1. **ChatInput** → `ChatWindow.handleSend()` → 乐观添加 user 消息到 state
2. **useAgentStream.sendMessage()** → **useWebSocket.send()** → WS JSON `{ type:"message" }`
3. **Vite Proxy** `/ws` → 后端 `ws://localhost:3000/ws/chat`
4. **chat-handler.ts** → 从 `harnessMap` 取 AgentHarness → `harness.prompt(text)`
5. **AgentHarness** 调用 LLM API，可能多轮 tool 调用 (discover_schema / execute_sql)
6. **AgentHarness 事件** → `forwardEvent(ws, event)` → WebSocket 推送到前端
7. **processWsEvent()** → 更新 ChatMessage state → React 重渲染

## 关键文件 (热路径)

| 文件 | 职责 |
|---|---|
| `packages/server/src/ws/chat-handler.ts` | WebSocket 事件处理、Harness 生命周期、事件转发映射 |
| `packages/server/src/agent/harness-factory.ts` | AgentHarness 创建、工具注册、System Prompt 组装、内存 Map |
| `packages/server/src/index.ts` | Hono 应用入口、路由注册、WebSocket 端点 |
| `packages/web/src/components/Chat/ChatWindow.tsx` | 主聊天编排器、消息状态、WS 事件处理 |
| `packages/web/src/hooks/useAgentStream.ts` | Agent 流处理、processWsEvent、ChatMessage/AgentStep 类型 |
| `packages/web/src/hooks/useWebSocket.ts` | WebSocket 连接管理、自动重连 |

## WebSocket 协议

- 客户端→服务端: `init` (创建 Harness), `message` (发送文本)
- 服务端→客户端: `connected`, `init_success`, `agent_start`, `thinking`, `message_start`, `text_delta`, `tool_execution_start/end`, `tool_result`, `agent_end`, `settled`, `response_complete`, `error`

## 数据存储

- **SQLite** (`data/datanova.db`): 数据源配置、对话元数据、Schema 注解、系统配置 — **持久化**
- **InMemorySessionRepo**: 对话上下文/消息历史 — **重启丢失**
- **前端 state**: 当前消息列表 — **切换对话丢失**
- **文件系统** (`data/skills/`, `data/annotations/`): Skill 定义、Schema 注解 — **持久化**

## 安全约束

- `execute_sql` 仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN，拒绝所有写操作
- 30 秒查询超时，最多返回 1000 行
- 数据源密码使用 AES-256-GCM 加密存储

## 架构约束

- 单 WebSocket 连接，所有对话共享，通过 `init` 消息切换上下文
- 乐观 UI：用户消息立即显示，不等服务端确认
- 首次发消息时自动创建对话 (REST API) + 初始化 Session (WS init) + 发送消息，有 500ms 延迟

## 环境变量

关键变量见 `.env.example`：`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATANOVA_ENCRYPTION_KEY`, `PORT`
