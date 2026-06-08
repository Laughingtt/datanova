# DataNova 项目文档

本目录包含 DataNova 项目的完整技术文档，涵盖架构、PiAgent 框架、数据流、工具、API、前端组件和集成指南。

---

## 文档目录

| # | 文件 | 内容 | 适合人群 |
|---|---|---|---|
| 1 | [01-architecture-overview.md](./01-architecture-overview.md) | 项目架构总览：技术栈、目录结构、端到端数据流、组件关系 | 新加入的开发者 |
| 2 | [02-pi-agent-internals.md](./02-pi-agent-internals.md) | PiAgent 框架内部机制：Agent Loop、事件系统、Hook、消息队列、LLM 调用流程 | 想深入理解 Agent 的开发者 |
| 3 | [03-tools-and-data.md](./03-tools-and-data.md) | 六大工具详解、数据来源、SQL 查询策略、语义层构建、配置项存储位置 | 需要修改或新增工具的开发者 |
| 4 | [04-agent-integration.md](./04-agent-integration.md) | Agent 集成实战：WebSocket 协议、工具定义模板、Skills 机制、运行命令 | 需要集成 PiAgent 到新项目的开发者 |
| 5 | [05-types-and-data-model.md](./05-types-and-data-model.md) | 完整类型定义 + SQLite 表结构 + 加密模块 + 连接池 | 需要理解数据模型的开发者 |
| 6 | [06-route-registration.md](./06-route-registration.md) | 路由注册方式、完整 API 路由表、API 设计模式、Vite 代理 | 需要新增 API 的开发者 |
| 7 | [07-frontend-components.md](./07-frontend-components.md) | 前端组件树、Zustand 状态管理、CSS 变量体系、聊天流程 | 前端开发者 |

---

## 阅读顺序建议

```
第 1 步：01-architecture-overview.md  ← 先搞清楚项目长什么样
第 2 步：05-types-and-data-model.md  ← 理解数据模型
第 3 步：06-route-registration.md    ← 理解 API 设计
第 4 步：07-frontend-components.md   ← 理解前端架构
第 5 步：04-agent-integration.md     ← 看具体集成代码
第 6 步：03-tools-and-data.md        ← 理解 6 个工具怎么工作
第 7 步：02-pi-agent-internals.md    ← 深入框架底层原理
```

---

## 核心概念速查

| 概念 | 定义 | 详见 |
|---|---|---|
| AgentHarness | PiAgent 核心类，管理 LLM ↔ 工具的多轮循环 | [02](./02-pi-agent-internals.md#二agentharness-是什么) |
| Agent Loop | 双层 while 循环，内层管工具调用，外层管追问 | [02](./02-pi-agent-internals.md#三agent-loop双层循环结构) |
| AgentEvent | 流式事件类型（agent_start/text_delta/tool_execution_*/agent_end） | [02](./02-pi-agent-internals.md#七完整事件时序) |
| Hook | 框架预留的插口，让你介入流程（阻止/覆盖/修改） | [02](./02-pi-agent-internals.md#六hook-详解) |
| subscribe | 事件监听（只读，推前端用） | [02](./02-pi-agent-internals.md#五事件系统subscribe-vs-on) |
| AgentTool | 工具定义：name + description + parameters + execute | [03](./03-tools-and-data.md) |
| Semantic Layer | 用户定义的指标/维度/模型，用于确定性 SQL 生成 | [03](./03-tools-and-data.md#十语义层-sql-构建原理) |
| Skill | SKILL.md 文件，注入 system prompt 的领域知识 | [04](./04-agent-integration.md#五skills-机制) |
| Schema Cache | 表名/字段名的内存缓存，供 SQL 校验用 | [03](./03-tools-and-data.md#八所有-sql-查询汇总) |
| Session | 对话树存储（InMemorySessionRepo） | [02](./02-pi-agent-internals.md#十一session-与对话持久化) |
| steer / followUp | 运行中途的消息队列 | [02](./02-pi-agent-internals.md#八消息队列steer--followup--nextturn) |
| systemPrompt | LLM 的角色说明书 | [04](./04-agent-integration.md#二agentharness-创建示例) |
| ExecutionEnv | 文件系统抽象（DataNova 禁用了 IO） | [04](./04-agent-integration.md) |
| pi-ai | LLM 多 Provider 抽象层 | [02](./02-pi-agent-internals.md#九llm-调用流程pi-ai) |
| TypeBox | 工具参数 schema 定义 + 自动校验 | [04](./04-agent-integration.md#三agenttool-模式) |

---

## 已有设计文档

| 文件 | 内容 |
|---|---|
| `DESIGN.md` | UI 视觉设计规范（Mistral 风格） |
| `text2sql-data-agent-features.md` | Text2SQL Agent 功能规划（三层架构） |
| `superpowers/plans/` | 各阶段实施计划 |
| `superpowers/specs/` | 各阶段架构评审 |

---

## 快速链接

- [AGENTS.md](../AGENTS.md) — 项目总览（给 AI 看的指令）
- [.env.example](../.env.example) — 环境变量模板
- [packages/server/src/index.ts](../packages/server/src/index.ts) — 服务端入口
- [packages/web/src/App.tsx](../packages/web/src/App.tsx) — 前端入口
