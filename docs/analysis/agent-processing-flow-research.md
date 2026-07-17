# Agent 处理流程深度调研

> 📅 调研日期：2026-07-17
> 🎯 目标：梳理完整 Agent 处理流程，对比不同 Agent 调用方式差异，识别改进点

---

## 目录

- [1. 完整请求生命周期](#1-完整请求生命周期)
- [2. Agent 初始化与路由机制](#2-agent-初始化与路由机制)
- [3. AgentHarness 框架机制](#3-agentharness-框架机制)
- [4. 两个 Agent 的调用差异对比](#4-两个-agent-的调用差异对比)
- [5. 前端 Agent 交互流程](#5-前端-agent-交互流程)
- [6. 事件转发与渲染管线](#6-事件转发与渲染管线)
- [7. 改进建议](#7-改进建议)

---

## 1. 完整请求生命周期

从用户输入到结果展示的完整数据流，标注每一步涉及的文件和关键函数。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段 1: 用户输入 (前端)                                                     │
│                                                                             │
│ ChatInput.handleSubmit()                                                    │
│   → onSend(text) → ChatWindow.handleSend(text)                              │
│     ├─ 创建 userMsg: { role:"user", content:text }                          │
│     ├─ setMessages(prev => [...prev, userMsg])  ← 乐观更新                  │
│     ├─ 设置 15s 响应超时                                                     │
│     └─ 判断 selectedConversationId:                                         │
│         ├─ 无 → conversationsApi.create() → initSession() → 500ms → send   │
│         └─ 有 → sendMessage(text, conversationId)                           │
│                                                                             │
│ 📁 packages/web/src/components/Chat/ChatInput.tsx                           │
│ 📁 packages/web/src/components/Chat/ChatWindow.tsx:handleSend()             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段 2: WebSocket 传输 (前端 → 后端)                                        │
│                                                                             │
│ useAgentStream.initSession(payload):                                        │
│   send({ type:"init", payload:{                                             │
│     conversationId, datasourceId, datasourceName,                           │
│     modelProvider, modelId, agentType ← "query" 或 "metric_dev"            │
│   }})                                                                       │
│                                                                             │
│ useAgentStream.sendMessage(text, convId):                                   │
│   send({ type:"message", text, payload:{ conversationId } })                │
│                                                                             │
│ → useWebSocket.send() → ws.send(JSON)                                       │
│ → Vite Proxy /ws → ws://localhost:3000/ws/chat                              │
│                                                                             │
│ 📁 packages/web/src/hooks/useAgentStream.ts:initSession/sendMessage         │
│ 📁 packages/web/src/hooks/useWebSocket.ts:send()                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段 3: WebSocket 接收与路由 (后端)                                         │
│                                                                             │
│ chat-handler.ts:onMessage(data)                                             │
│   ├─ data.type === "init"     → handleInit()                                │
│   ├─ data.type === "message"  → handleMessage()                             │
│   └─ data.type === "reset_context" → handleResetContext()                   │
│                                                                             │
│ 📁 packages/server/src/ws/chat-handler.ts:onMessage()                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                          ┌─────────┴─────────┐
                          │  handleInit()      │
                          └─────────┬─────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段 4: Agent 路由与 Harness 创建 (后端)                                    │
│                                                                             │
│ handleInit() 读取 agentType (默认 "query")                                  │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 路径 A: agentType === "query"                                          │ │
│ │   createHarness(options)  ← harness-factory.ts                         │ │
│ │     ├─ 创建 7 个工具 (含 ai_suggest_semantic, 不在 registry 中)        │ │
│ │     ├─ loadAllSkills() → 加载 qs-* SKILL.md                            │ │
│ │     ├─ buildDataNovaSystemPrompt() → 组装系统提示                       │ │
│ │     ├─ InMemorySessionRepo.create() → session                          │ │
│ │     ├─ getModel(provider, modelId) → LLM 模型                          │ │
│ │     ├─ new AgentHarness({ session, tools, resources:{skills},           │ │
│ │     │    systemPrompt, model, getApiKeyAndHeaders })                    │ │
│ │     └─ harnessMap.set(conversationId, harness)                          │ │
│ │                                                                         │ │
│ │ 📁 packages/server/src/agent/harness-factory.ts:createHarness()        │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 路径 B: agentType !== "query" (如 "metric_dev")                        │ │
│ │   agentRegistry.createHarness(agentType, options)                       │ │
│ │     ├─ getAgent(agentType) → AgentDefinition                           │ │
│ │     ├─ getAgentTools(agentType) → 从 toolPool 解析 toolSet → AgentTool[]│ │
│ │     └─ AgentDefinition.harnessFactory(options, tools)                   │ │
│ │         → createMetricDevHarness(options, tools)                        │ │
│ │           ├─ buildMetricDevSystemPrompt(context) → 系统提示             │ │
│ │           ├─ metricDevSessionRepo.create() → session                    │ │
│ │           ├─ getModel(provider, modelId) → LLM 模型                     │ │
│ │           ├─ new AgentHarness({ session, tools, resources:{},           │ │
│ │           │    systemPrompt, model, getApiKeyAndHeaders })              │ │
│ │           └─ harnessMap.set(conversationId, harness)  ← 由 handleInit  │ │
│ │                                                                         │ │
│ │ 📁 packages/server/src/agent/agent-registry.ts:createHarness()         │ │
│ │ 📁 packages/server/src/agent/metric-dev-harness.ts                      │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 两条路径汇合后:                                                             │
│   1. discoverSchema(datasourceId) → setSchemaCache()  ← 预填充 Schema     │
│   2. harness.subscribe(event => {                                           │
│        accumulateStreamingState(state, event)                               │
│        forwardEvent(ws, event)                                              │
│      })                                                                     │
│   3. listMessages(conversationId) → send({ type:"message_history" })        │
│   4. send({ type:"init_success" })                                          │
│   5. conversationDatasourceMap.set(conversationId, datasourceId)            │
│                                                                             │
│ 📁 packages/server/src/ws/chat-handler.ts:handleInit()                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段 5: 消息处理与 Agent Loop (后端)                                        │
│                                                                             │
│ handleMessage():                                                            │
│   1. getHarness(conversationId) → 从 harnessMap 获取                        │
│   2. saveMessage({ conversationId, role:"user", content:text })             │
│   3. 构建上下文前缀:                                                        │
│      a. getRecentSqlContext(dsId, 3) → 最近 3 条查询                        │
│      b. [Current conversation_id: xxx]                                      │
│   4. 重置 streamingState (content="", steps=[])                             │
│   5. harness.prompt(contextPrefix + text)  ← 触发 Agent Loop               │
│                                                                             │
│ Agent Loop (pi-agent-core 内部):                                            │
│   ┌───────────────────────────────────────────────────────────────────┐     │
│   │ while (LLM 未到自然停止 ):                                           │     │
│   │   1. 构建请求: systemPrompt + session history + user message      │     │
│   │   2. 调用 LLM API (流式) → emit agent_start/turn_start           │     │
│   │   3. LLM 返回:                                                    │     │
│   │      ├─ 文本内容 → emit text_delta → 最终回复                     │     │
│   │      └─ tool_use → 执行工具 → 结果回传 LLM → 继续循环             │     │
│   │   4. 每次工具调用:                                                │     │
│   │      emit tool_execution_start → execute() → emit tool_execution_end│    │
│   │   5. 检查 steering/followUp 队列                                  │     │
│   │   6. 无更多工具调用 + 无队列消息 → 退出循环                       │     │
│   └───────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│ 📁 packages/server/src/ws/chat-handler.ts:handleMessage()                   │
│ 📁 node_modules/@earendil-works/pi-agent-core/dist/harness/agent-harness.js│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段 6: 事件转发 (后端 → 前端)                                              │
│                                                                             │
│ harness.subscribe() 回调:                                                   │
│   ├─ accumulateStreamingState(state, event) → 累积 content + steps          │
│   └─ forwardEvent(ws, event) → 翻译为客户端事件                             │
│                                                                             │
│ 事件映射表:                                                                 │
│ ┌──────────────────────────┬──────────────────────────────────────────────┐ │
│ │ Harness 内部事件          │ WebSocket 客户端事件                         │ │
│ ├──────────────────────────┼──────────────────────────────────────────────┤ │
│ │ agent_start              │ { type:"agent_start" }                       │ │
│ │ turn_start               │ { type:"thinking" }                          │ │
│ │ message_start (assistant)│ { type:"message_start" }                     │ │
│ │ message_update text_delta│ { type:"text_delta", delta }                 │ │
│ │ message_update think_δ   │ { type:"thinking", content }                 │ │
│ │ tool_execution_start     │ { type:"tool_execution_start", ... }         │ │
│ │ tool_execution_end       │ { type:"tool_execution_end", ... }           │ │
│ │  + details.confirmAction │ { type:"confirm_action", confirmAction }     │ │
│ │ tool_result              │ { type:"tool_result", ... }                  │ │
│ │  + details.confirmAction │ { type:"confirm_action", confirmAction }     │ │
│ │ message_end (error)      │ { type:"error", error }                      │ │
│ │ agent_end                │ { type:"agent_end" }                         │ │
│ │ settled                  │ { type:"settled" }                           │ │
│ │ save_point/queue_update  │ (静默丢弃)                                   │ │
│ └──────────────────────────┴──────────────────────────────────────────────┘ │
│                                                                             │
│ prompt() 完成后:                                                            │
│   saveMessage({ role:"assistant", content, steps })                         │
│   send({ type:"response_complete", content })                               │
│                                                                             │
│ 📁 packages/server/src/ws/chat-handler.ts:forwardEvent()                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段 7: 前端事件处理与渲染                                                  │
│                                                                             │
│ useWebSocket.onMessage → ChatWindow.handleWsEvent                           │
│   ├─ connected / init_success / message_history → 特殊处理                  │
│   └─ 其他 → processWsEvent(event, currentAssistantRef)                      │
│                                                                             │
│ processWsEvent() 事件处理:                                                  │
│ ┌──────────────────────────┬──────────────────────────────────────────────┐ │
│ │ 客户端事件               │ ChatMessage 状态变更                          │ │
│ ├──────────────────────────┼──────────────────────────────────────────────┤ │
│ │ agent_start              │ 创建新 assistant 消息 (isStreaming:true)      │ │
│ │ thinking                 │ 追加 thinking step                           │ │
│ │ text_delta               │ content += delta                             │ │
│ │ tool_execution_start     │ 追加 tool_call step                          │ │
│ │ tool_execution_end       │ 更新为 tool_result + 提取 SQL/表格数据       │ │
│ │ confirm_action           │ 设置 confirmAction 字段                      │ │
│ │ validation_warning       │ 设置 validationStatus: {level:"warning"}     │ │
│ │ validation_error         │ 设置 validationStatus: {level:"error"}       │ │
│ │ agent_end/settled/       │ isStreaming = false                          │ │
│ │ response_complete        │                                              │ │
│ │ error                    │ 创建/追加错误消息                             │ │
│ └──────────────────────────┴──────────────────────────────────────────────┘ │
│                                                                             │
│ setMessages() → React 重渲染 → MessageItem 条件渲染:                       │
│   StepIndicator → ResultSummaryCard → ReportView → ValidationBanner        │
│   → SqlBlock → DataViewToggle(TableResult/ChartView) → ConfirmActionCard   │
│   → MetricCard → DimensionCard → ValidationResult → MarkdownContent       │
│   → FeedbackButtons                                                         │
│                                                                             │
│ 📁 packages/web/src/hooks/useAgentStream.ts:processWsEvent()                │
│ 📁 packages/web/src/components/Chat/MessageItem.tsx                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Agent 初始化与路由机制

### 2.1 启动时注册

```
服务器启动 (index.ts)
  │
  ▼
initAgentFramework()
  ├─ registerAllTools(agentRegistry)  ← tool-registration.ts
  │   ├─ discover_schema
  │   ├─ execute_sql
  │   ├─ ai_annotate_schema
  │   ├─ lookup_semantic_layer
  │   ├─ lookup_examples
  │   ├─ read_skill
  │   ├─ validate_and_test_metric
  │   ├─ check_metric_conflict
  │   ├─ create_metric_draft
  │   ├─ create_dimension_draft
  │   └─ request_user_confirm
  │   ⚠️ 注意: ai_suggest_semantic_layer 未注册到 toolPool!
  │
  └─ registerAllAgents()  ← agent-registration.ts
      ├─ "query" agent:
      │   harnessFactory: (options, _tools) => createQueryHarness(...)
      │   toolSet: ["discover_schema","execute_sql","lookup_semantic_layer",
      │             "lookup_examples","read_skill","ai_annotate_schema"]
      │   ⚠️ _tools 参数被忽略! query agent 自行创建工具
      │
      └─ "metric_dev" agent:
          harnessFactory: (options, tools) => createMetricDevHarness(options, tools)
          toolSet: ["discover_schema","execute_sql","lookup_semantic_layer",
                    "lookup_examples","read_skill","validate_and_test_metric",
                    "check_metric_conflict","create_metric_draft",
                    "create_dimension_draft","request_user_confirm"]
          ✅ tools 参数被使用
```

### 2.2 运行时路由

```
前端 init 消息 { agentType: "query" | "metric_dev" }
  │
  ▼ chat-handler.ts:handleInit()
  │
  ├─ agentType === "query"
  │   → createHarness(options)  ← 直接调用 harness-factory.ts
  │   → harnessMap.set(convId, harness)  ← 在 createHarness 内部
  │
  └─ agentType !== "query"
      → agentRegistry.createHarness(agentType, options)
      → harnessMap.set(convId, harness)  ← 在 handleInit 内部
```

**关键发现**: 两种路径的 harness 存储位置不同：
- query: 在 `createHarness()` 内部存储
- 其他: 在 `handleInit()` 中存储

---

## 3. AgentHarness 框架机制

### 3.1 AgentHarness API

```typescript
class AgentHarness<TSkill, TPromptTemplate, TTool> {
  // 主要对话 API
  prompt(text, {images?}): Promise<AssistantMessage>  // 发送消息，运行完整 Agent Loop
  skill(name, additionalInstructions?): Promise<...>   // 调用命名技能
  promptFromTemplate(name, args?): Promise<...>        // 使用模板提示

  // 运行时控制
  steer(text, {images?}): void     // 当前轮结束后注入引导消息
  followUp(text, {images?}): void  // Agent 即将停止时注入后续消息
  nextTurn(text, {images?}): void  // 下次 prompt() 前置消息
  abort(): Promise<void>           // 中止当前运行

  // 会话管理
  compact(customInstructions?): Promise<void>  // 压缩旧消息减少 token
  waitForIdle(): Promise<void>                 // 等待当前运行完成

  // 动态配置
  setModel(model): Promise<void>
  setTools(tools): Promise<void>
  setActiveTools(names): Promise<void>
  setResources(resources): Promise<void>

  // 事件订阅
  subscribe(listener): () => void  // 通配符监听，接收所有事件
  on(type, handler): () => void    // 类型特定监听
}
```

### 3.2 生命周期阶段

```
AgentHarnessPhase: "idle" | "turn" | "compaction" | "branch_summary" | "retry"

状态机:
  idle ──prompt()──→ turn ──agent_end──→ idle
                    │
                    ├─compact()──→ compaction ──→ idle
                    └─retry──→ turn
```

### 3.3 Agent Loop 内部流程

```
prompt(text)
  │
  ├─ 1. Phase 检查 (必须 idle)
  ├─ 2. createTurnState() — 重建 session 上下文
  │     ├─ 解析 systemPrompt (静态字符串或动态回调)
  │     ├─ 快照 model/thinkingLevel/tools/streamOptions
  │     └─ 排空 nextTurnQueue
  ├─ 3. executeTurn()
  │     ├─ 构建 user message
  │     ├─ emit before_agent_start
  │     ├─ 创建 AbortController
  │     └─ runAgentLoop()
  │           │
  │           ▼
  │     ┌─────────────────────────────────────────────┐
  │     │ Agent Loop (可能多轮):                       │
  │     │                                              │
  │     │  emit turn_start                             │
  │     │  LLM API 调用 (streamSimple)                 │
  │     │    → emit message_start/update/end           │
  │     │                                              │
  │     │  if tool_calls:                              │
  │     │    for each tool_call:                       │
  │     │      emit tool_execution_start               │
  │     │      validate args against TypeBox schema    │
  │     │      call beforeToolCall hook                │
  │     │      tool.execute(toolCallId, params, signal)│
  │     │      call afterToolCall hook                 │
  │     │      emit tool_execution_end                 │
  │     │    → 创建 ToolResultMessage                  │
  │     │    → emit turn_end                           │
  │     │    → 检查 steering/followUp 队列             │
  │     │    → prepareNextTurn() → 继续循环            │
  │     │                                              │
  │     │  else (无 tool_calls, 自然停止):             │
  │     │    → emit turn_end                           │
  │     │    → 检查队列                                │
  │     │    → 无队列消息 → 退出循环                   │
  │     └─────────────────────────────────────────────┘
  │
  ├─ 4. 提取最终 assistant message
  ├─ 5. flush pendingSessionWrites
  └─ 6. set phase = "idle", emit "settled"
```

### 3.4 工具定义与执行

```typescript
interface AgentTool<TParameters, TDetails> {
  name: string;           // 唯一标识
  label: string;          // UI 显示名
  description: string;    // 模型可见描述
  parameters: TSchema;    // TypeBox 校验 schema
  prepareArguments?: (args) => Static<TParameters>;  // 预校验
  execute: (toolCallId, params, signal?, onUpdate?) => Promise<AgentToolResult<TDetails>>;
  executionMode?: "sequential" | "parallel";  // 工具级并行控制
}

interface AgentToolResult<T> {
  content: (TextContent | ImageContent)[];  // 模型看到的内容
  details: T;                                // 结构化数据 (UI/日志)
  isError?: boolean;
  terminate?: boolean;  // 提示停止
}
```

---

## 4. 两个 Agent 的调用差异对比

### 4.1 核心差异表

| 维度 | 智能问数 (`query`) | 指标开发 (`metric_dev`) |
|---|---|---|
| **创建路径** | `createHarness()` 直接调用 | `agentRegistry.createHarness()` 间接调用 |
| **工具来源** | 内联创建 7 个工具 (含 `ai_suggest_semantic`) | 从 registry toolPool 获取 10 个工具 |
| **registry 工具参数** | `_tools` 被忽略 ❌ | `tools` 被使用 ✅ |
| **harnessMap 存储** | `createHarness()` 内部 | `handleInit()` 内部 |
| **Session Repo** | `sessionRepo` (共享实例) | `metricDevSessionRepo` (独立实例) |
| **Session ID 格式** | `query:{dsId}:{timestamp}` | `metric-dev:{dsId}:{timestamp}` |
| **Resources** | `{ skills }` — 加载 qs-* SKILL.md | `{}` — 空，无技能 |
| **Skill 刷新** | `refreshHarnessSkills()` / `refreshHarnessesForDatasource()` | 无刷新机制 |
| **模型环境变量** | 硬编码默认值 | 回退 `DATANOVA_PROVIDER`/`DATANOVA_MODEL` |
| **系统提示** | `buildDataNovaSystemPrompt()` | `buildMetricDevSystemPrompt(context)` |
| **reset_context** | ✅ 正常工作 | ❌ 始终创建 query harness (Bug) |
| **ai_suggest_semantic** | ✅ 可用 (内联创建) | ❌ 不可用 (未注册到 toolPool) |

### 4.2 工具集差异

```
共享工具 (6个, 在 toolPool 中注册):
  discover_schema · execute_sql · ai_annotate_schema
  lookup_semantic_layer · lookup_examples · read_skill

query 独有 (1个, 不在 toolPool 中):
  ai_suggest_semantic_layer  ← ⚠️ 仅 harness-factory.ts 内联创建

metric_dev 独有 (5个, 在 toolPool 中注册):
  validate_and_test_metric · check_metric_conflict
  create_metric_draft · create_dimension_draft · request_user_confirm
```

### 4.3 系统提示构建差异

**query Agent** (`buildDataNovaSystemPrompt`):
```
① 基础指令 (SELECT/摘要/自修正/意图分类/归因/报告/红线)
② 数据源信息 (当前选中 + 所有可用)
③ Skills 摘要 (formatSkillsForSystemPrompt — XML 格式)
④ Skill 使用指令 (优先链: semantic → qs-* → examples → schema)
⑤ 自定义指令
```

**metric_dev Agent** (`buildMetricDevSystemPrompt`):
```
① 核心身份 (指标开发专家)
② 当前已有定义 (published/draft 统计 — 动态查询 store)
③ 工作原则 (先查后建/验证闭环/自动修复/草稿安全/自动保存)
④ 10步工作流程
⑤ 自动保存指令 (验证通过=必须保存)
⑥ SQL质量标准 (别名/GROUP BY/DATE_FORMAT/NULLIF/大表时间限制)
⑦ 指标元数据标准 (name/display_name/metric_type/business_context)
⑧ 禁止行为 (8条)
```

---

## 5. 前端 Agent 交互流程

### 5.1 前端 Agent 注册表

```typescript
// packages/web/src/agents/registry.ts
const AGENT_REGISTRY: AgentInfo[] = [
  {
    id: "query",
    name: "智能问数",
    icon: "💬",
    description: "...",
    color: "#3B82F6",
    capabilities: ["自然语言查询", "SQL生成", "数据可视化", ...],
    entryPoints: [{ view: "chat", label: "智能问数" }],
    welcomeMessage: "你好！我是智能问数助手..."
  },
  {
    id: "metric_dev",
    name: "指标开发",
    icon: "📊",
    description: "...",
    color: "#8B5CF6",
    capabilities: ["指标开发", "SQL验证", "冲突检查", ...],
    entryPoints: [{ view: "metrics", label: "AI开发指标", initialPrompt: "..." }],
    welcomeMessage: "你好！我是指标开发助手..."
  }
]
```

### 5.2 频道切换流程

```
ChannelTabs 点击 "📊 指标开发"
  │
  ▼ setActiveChannel("metric_dev")
  │
  ▼ ChatWindow useEffect 检测 activeChannel 变更:
    1. selectedConversationId = null
    2. messages = []
    3. initializedRef = null
    4. currentAssistantRef = null
    5. 清除超时
    6. isStreaming = false
  │
  ▼ 渲染 AgentWelcome (messages.length===0 && activeChannel!=="query")
    - 图标 + 名称 + 欢迎语
    - 快捷按钮: [开发月度营收指标] [推荐常用指标] [检查指标冲突]
  │
  ▼ 用户输入 → initSession({ agentType: "metric_dev" })
```

### 5.3 数据驱动渲染

前端不根据 `activeChannel` 切换渲染逻辑，而是根据 `ChatMessage` 上的字段**数据驱动**渲染：

```
ChatMessage 字段 → 渲染组件:
  steps[]           → StepIndicator
  content           → MarkdownContent / ResultSummaryCard / ReportView
  sqlBlock          → SqlBlock
  tableData         → DataViewToggle (TableResult / ChartView)
  validationStatus  → ValidationBanner
  confirmAction     → ConfirmActionCard
  (无特定字段)      → FeedbackButtons
```

**注意**: `MetricCard`、`DimensionCard`、`ValidationResult` 三个组件已定义但**未导入使用**，是预留的 metric_dev 专用卡片。

### 5.4 MetricsPage → Chat 桥接

```
MetricsPage "AI开发指标" 按钮
  │
  ▼ getAgentEntryPoint("metrics") → { agentId:"metric_dev", label, initialPrompt }
  │
  ▼ setActiveChannel("metric_dev") + setView("chat")
  │
  ▼ ChatWindow 切换到 metric_dev 频道
```

---

## 6. 事件转发与渲染管线

### 6.1 完整事件流

```
AgentHarness 内部事件
  │
  ├─ AgentEvent (agent-loop.ts):
  │   agent_start | agent_end | turn_start | turn_end
  │   message_start | message_update | message_end
  │   tool_execution_start | tool_execution_update | tool_execution_end
  │
  └─ AgentHarnessOwnEvent (harness 自身):
      queue_update | save_point | abort | settled
      before_agent_start | context
      tool_call | tool_result
      session_before_compact | session_compact
      model_update | tools_update | resources_update
  │
  ▼ harness.subscribe() 回调
  │
  ├─ accumulateStreamingState() → 累积 content + steps (用于持久化)
  │
  └─ forwardEvent(ws, event) → 翻译为客户端事件
       │
       ▼ WebSocket 传输
       │
       ▼ processWsEvent(event, currentAssistantRef)
       │
       ▼ setMessages() → React 重渲染
```

### 6.2 消息持久化时序

```
harness.prompt() 开始
  │
  ├─ handleMessage() 中: saveMessage({ role:"user" })  ← 用户消息立即持久化
  │
  ├─ Agent Loop 运行中: accumulateStreamingState() 累积
  │   - text_delta → state.content += delta
  │   - tool_execution_start → state.steps.push({type:"tool_call"})
  │   - tool_execution_end → 更新为 {type:"tool_result"}
  │
  └─ prompt() 完成后: saveMessage({ role:"assistant", content, steps })
                      send({ type:"response_complete", content })
```

---

## 7. 改进建议

### 🔴 P0 — 必须修复

#### 7.1 reset_context 不尊重 agentType

**问题**: `handleResetContext()` 始终调用 `createHarness()` (query 路径)，不读取当前 `agentType`。当 metric_dev Agent 的对话执行 reset_context 时，会错误地创建一个 query Agent 的 harness。

**位置**: `packages/server/src/ws/chat-handler.ts:handleResetContext()`

**修复方案**:
```typescript
// 当前代码 (Bug):
harness = await createHarness(options);

// 修复后:
const agentType = conversationAgentTypeMap.get(conversationId) || "query";
if (agentType === "query") {
  harness = await createHarness(options);
} else {
  harness = await agentRegistry.createHarness(agentType, options);
  harnessMap.set(options.conversationId, harness);
}
```

需要新增 `conversationAgentTypeMap` 来追踪每个对话的 agentType。

#### 7.2 ai_suggest_semantic_layer 未注册到 toolPool

**问题**: `ai_suggest_semantic_layer` 工具在 `harness-factory.ts` 中内联创建，但未在 `tool-registration.ts` 的 `registerAllTools()` 中注册。这意味着：
- 它不在 AgentRegistry 的 toolPool 中
- 如果未来 query Agent 也走 registry 路径，该工具会丢失
- Agent 注册表中 query 的 toolSet 也没有列出它

**位置**: `packages/server/src/agent/tool-registration.ts`

**修复方案**: 在 `registerAllTools()` 中注册 `ai_suggest_semantic_layer`，并在 query Agent 的 `toolSet` 中添加它。

### 🟡 P1 — 应该改进

#### 7.3 query Agent 应统一走 registry 路径

**问题**: query Agent 的 `harnessFactory` 忽略 `_tools` 参数，自行内联创建工具。这导致：
- 两套工具创建逻辑 (harness-factory.ts 内联 vs tool-registration.ts 注册)
- `ai_suggest_semantic_layer` 只在 query 的内联路径中存在
- 新增 Agent 时需要理解两种不同的模式

**修复方案**: 将 query Agent 的工具创建也迁移到 registry 模式：
1. 在 `registerAllTools()` 中注册 `ai_suggest_semantic_layer`
2. query Agent 的 `toolSet` 添加 `ai_suggest_semantic_layer`
3. `createQueryHarness()` 改为接受 registry 传入的 tools
4. 移除 `harness-factory.ts` 中的内联工具创建

#### 7.4 harnessMap 存储位置不一致

**问题**: query Agent 在 `createHarness()` 内部存储 harness，其他 Agent 在 `handleInit()` 中存储。这种不一致增加了理解成本。

**修复方案**: 统一在 `handleInit()` 中存储，`createHarness()` / `createMetricDevHarness()` 只返回 harness 不存储。

#### 7.5 metric_dev Agent 无 Skills 支持

**问题**: metric_dev Agent 的 `resources` 为空 `{}`，无法使用 `read_skill` 工具加载查询技能。但 `read_skill` 在其工具集中，系统提示中也提到了"充分利用 read_skill"。

**修复方案**: 在 `createMetricDevHarness()` 中加载 skills 并传入 `resources: { skills }`。

#### 7.6 MetricCard / DimensionCard / ValidationResult 未接入渲染

**问题**: 三个 metric_dev 专用卡片组件已定义但未在 `MessageItem` 中导入使用。metric_dev Agent 的输出目前通过通用文本渲染，缺少结构化展示。

**修复方案**: 在 `MessageItem.tsx` 中检测消息中的指标/维度/验证数据，条件渲染这些卡片组件。

### 🟢 P2 — 可以优化

#### 7.7 频道切换丢失对话上下文

**问题**: 切换频道时 `ChatWindow` 清空所有消息和 conversationId。`channelSessions` 在 store 中定义但未使用。

**修复方案**: 利用 `channelSessions` 保存每个频道的 conversationId，切换时恢复而非重建。

#### 7.8 Session Repo 不共享

**问题**: query 和 metric_dev 使用独立的 `InMemorySessionRepo` 实例。如果未来需要跨 Agent 共享上下文（如 query Agent 的查询结果传递给 metric_dev），当前架构不支持。

**修复方案**: 考虑使用共享的 SessionRepo，或提供跨 Agent 上下文传递机制。

#### 7.9 模型配置不一致

**问题**: query Agent 硬编码默认模型，metric_dev Agent 回退到环境变量。两者应使用统一的模型配置逻辑。

**修复方案**: 抽取 `getModelWithFallback(provider, modelId)` 工具函数，两个 Agent 共用。

#### 7.10 前端 Agent 注册表硬编码

**问题**: `AGENT_REGISTRY` 是静态数组，新增 Agent 需要同时修改前端和后端。

**修复方案**: 后端提供 `GET /api/agents` 接口返回已注册 Agent 列表，前端动态加载。

#### 7.11 事件类型缺少 Agent 标识

**问题**: WebSocket 事件中没有 `agentType` 字段，前端无法根据事件来源做差异化处理。当前依赖数据驱动渲染，但某些场景可能需要 Agent 级别的逻辑分支。

**修复方案**: 在 `init_success` 和后续事件中附加 `agentType` 字段。

---

## 附录：关键文件索引

| 文件 | 职责 |
|---|---|
| `packages/server/src/index.ts` | 服务器入口，调用 `initAgentFramework()` |
| `packages/server/src/ws/chat-handler.ts` | WebSocket 路由、事件转发、harness 生命周期 |
| `packages/server/src/agent/agent-registry.ts` | AgentRegistry 类，Agent 和工具注册池 |
| `packages/server/src/agent/agent-registration.ts` | 注册两个 Agent 和所有工具 |
| `packages/server/src/agent/tool-registration.ts` | 11 个工具注册到共享池 |
| `packages/server/src/agent/harness-factory.ts` | query Agent harness 创建 + harnessMap |
| `packages/server/src/agent/metric-dev-harness.ts` | metric_dev Agent harness 创建 |
| `packages/server/src/agent/prompt-builder.ts` | query Agent 系统提示 |
| `packages/server/src/agent/prompt-builder-metric-dev.ts` | metric_dev Agent 系统提示 |
| `packages/server/src/agent/skill-manager.ts` | SKILL.md 加载与 CRUD |
| `packages/web/src/agents/registry.ts` | 前端 Agent 注册表 |
| `packages/web/src/agents/types.ts` | AgentInfo & EntryPoint 类型 |
| `packages/web/src/hooks/useAgentStream.ts` | initSession, sendMessage, processWsEvent |
| `packages/web/src/hooks/useWebSocket.ts` | WebSocket 连接管理 |
| `packages/web/src/components/Chat/ChatWindow.tsx` | 主聊天编排器 |
| `packages/web/src/components/Chat/ChannelTabs.tsx` | Agent 频道切换 |
| `packages/web/src/components/Chat/AgentWelcome.tsx` | Agent 欢迎页 |
| `packages/web/src/stores/app.ts` | Zustand 全局状态 (activeChannel) |
