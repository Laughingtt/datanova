# PiAgent 框架内部机制详解

> 本文档深入剖析 PiAgent（@earendil-works/pi-agent-core）的内部运行机制。
> 包括：Agent Loop 循环结构、事件系统、Hook 机制、消息队列和 LLM 调用流程。
> 阅读对象：已理解项目架构，希望深入理解 PiAgent 工作原理的开发者。

---

## 一、PiAgent 是什么

PiAgent 是一个 **Agent 运行时框架**，核心职责是：

> 管理「LLM ↔ 工具」的多轮交互循环。用户只需要注册工具和 System Prompt，调用 `harness.prompt(text)`，框架自动完成所有复杂逻辑。

它由两个 npm 包组成：

| 包 | 职责 |
|---|---|
| `@earendil-works/pi-agent-core` | Agent 运行时：对话管理、工具调度、事件发射、Session、Compaction |
| `@earendil-works/pi-ai` | LLM 抽象层：20+ Provider 统一接口、模型路由、API Key 自动解析 |

---

## 二、AgentHarness 是什么

AgentHarness 是 PiAgent 的核心类。可以把它理解为一个 **项目经理**：

```
项目经理（AgentHarness）
  ├── 分析师（LLM Model）      ← 只能思考/说话，不能动手
  ├── 工具箱（Tools[]）        ← 6 把工具，每把能干一件事
  ├── 角色说明书（System Prompt） ← 告诉 LLM "你是谁、能做什么"
  ├── 记忆本（Session）        ← 记录对话历史
  ├── 手册库（Skills）         ← 领域知识文档
  └── 对讲机（Event System）   ← 实时广播每一步在干什么
```

### 构造函数参数

```typescript
const harness = new AgentHarness({
  env: ExecutionEnv,           // 文件系统抽象（DataNova 禁用了 IO）
  session: Session,            // 对话持久化（InMemorySessionRepo）
  tools: AgentTool[],          // 工具列表
  resources: { skills },       // Skills + PromptTemplates
  systemPrompt: string,        // 角色设定
  model: Model<any>,           // LLM 模型
  getApiKeyAndHeaders,         // 获取 API Key 的回调
  streamOptions?,              // 流式选项
  thinkingLevel?,              // 思考深度
  activeToolNames?,            // 初始激活工具白名单
  steeringMode?,               // 队列模式
  followUpMode?,               // 排队模式
});
```

### 核心方法速查

| 方法 | 作用 | 返回值 |
|---|---|---|
| `harness.prompt(text)` | 发送用户消息，触发完整 Agent Loop | `AssistantMessage` |
| `harness.steer(text)` | 插入高优先级消息（打断当前回复） | `void` |
| `harness.followUp(text)` | 排队低优先级消息（等回合结束） | `void` |
| `harness.abort()` | 中止正在运行的 Agent Loop | `AbortResult` |
| `harness.compact()` | 压缩对话历史（总结早期内容） | 压缩结果 |
| `harness.setModel(model)` | 运行时切换 LLM 模型 | `void` |
| `harness.setTools(tools)` | 运行时替换工具列表 | `void` |
| `harness.setResources({ skills })` | 运行时替换 Skills | `void` |
| `harness.subscribe(callback)` | 订阅所有事件（流式推送） | 取消订阅函数 |
| `harness.on(type, handler)` | 注册精确钩子（可修改行为） | 取消订阅函数 |

---

## 三、Agent Loop：双层循环结构

这是整个框架最核心的逻辑。当你调用 `harness.prompt("用户问题")` 时，内部发生了：

```
harness.prompt("用户问题")
  │
  ├─ createTurnState()           ← 准备"战场"
  │    拼 systemPrompt、加载 tools、从 session 取历史消息
  │
  ├─ emitHook("before_agent_start")  ← 钩子：开始前最后一次修改
  │    你可以注入额外消息、修改 systemPrompt
  │
  └─ executeTurn() → runAgentLoop()  ← 核心
```

### 双层循环结构（伪代码）

```
外层 while (true) {
    // 处理排队消息（follow-up）
    // 当用户快速追问时，外层循环继续

    内层 while (有工具调用 或 有人插话(steer)) {

        一轮（Turn）：

        ① 处理插队消息（steer）           ← inject
        ② 调 LLM（streamAssistantResponse）← think
        ③ LLM 返回了 tool_call？
           ├─ 是 → 执行工具 → 结果追加到对话 → 回到 ②
           └─ 否 → 退出内层循环
    }

    ④ 有 followUp 消息？
       ├─ 有 → 继续外层循环
       └─ 无 → agent_end，结束
}
```

**为什么是两层？** 为了支持运行中途插入消息：

- **steer（插队）**：打断当前内层循环，立刻注入
- **followUp（排队）**：等当前内层循环结束，外层再处理

---

## 四、一轮 Turn 的完整步骤

```
turn_start ─────────────────────────────────────────────────

① 如果有 steer 消息 → 注入对话
   emit: message_start → message_end（每条 steer）

② streamAssistantResponse() ─── 调用 LLM
   │
   ├─ transformContext()      ← emitHook("context")，可增删消息
   ├─ convertToLlm()          ← AgentMessage → LLM Message 格式
   ├─ emitHook("before_provider_request")  ← 改 timeout/headers
   ├─ emitHook("before_provider_payload")  ← 改请求体
   ├─ streamSimple(model, context)         ← 真正 HTTP 请求
   │    ↕ LLM 流式返回
   │    emit: message_update({ text_delta }) × N
   │    emit: message_end
   └─ emitHook("after_provider_response")  ← 读响应

③ 检查 LLM 返回
   ├─ 纯文本 → hasMoreToolCalls = false
   └─ tool_call → 进入 ④

④ executeToolCalls() ─── 对每个 tool_call 执行
   │
   ├─ emit: tool_execution_start
   ├─ prepareToolCall()
   │    ├─ 按名字找工具
   │    ├─ prepareArguments()   ← 参数兼容
   │    ├─ validateToolArguments() ← typebox 校验
   │    └─ emitHook("tool_call")  ← 可 block 阻止执行
   ├─ executePreparedToolCall()
   │    └─ tool.execute(toolCallId, params)  ← 你的函数
   ├─ finalizeExecutedToolCall()
   │    └─ emitHook("tool_result")  ← 可覆盖结果
   ├─ emit: tool_execution_end
   └─ 创建 toolResult 消息 → 追加到对话

⑤ emit: turn_end
   ├─ emitHook("context")
   ├─ 持久化 session（flushPendingSessionWrites）
   └─ emit: save_point

⑥ prepareNextTurn()
   重新 createTurnState()（刷新 tools、resources、systemPrompt）

⑦ shouldStopAfterTurn？
   ├─ 是 → 退出循环
   └─ 否 → 回到①

───────────────────────────────────────────────── turn_end
```

---

## 五、事件系统：subscribe vs on

PiAgent 提供两种事件机制，用途不同：

### `subscribe(callback)` — 旁观模式

```typescript
harness.subscribe((event) => {
  // 只读：收到所有事件，但不能修改任何东西
  // 典型用途：推送给前端
  switch (event.type) {
    case "text_delta":
      ws.send(JSON.stringify({ type: "text_delta", delta: event.delta }));
      break;
    case "tool_execution_start":
      ws.send(JSON.stringify({ type: "tool_execution_start", toolName: event.toolName }));
      break;
  }
});
```

### `on(type, handler)` — Hook 模式

```typescript
harness.on("tool_call", (event) => {
  // 可修改：如果返回 { block: true }，工具不会被调用
  if (event.toolName === "execute_sql" && isDangerous(event.input)) {
    return { block: true, reason: "不允许此操作" };
  }
});

harness.on("tool_result", (event) => {
  // 可修改：返回新结果来覆盖原始结果
  return { details: { ...event.details, cached: true } };
});
```

### 对比

| | subscribe | on (Hook) |
|---|---|---|
| 用途 | 监听所有事件 | 精确拦截特定生命周期 |
| 是否能修改行为 | ❌ 只读 | ✅ 可返回修改值 |
| 返回值 | void | 修改结果 |
| 比喻 | 你在旁边看着 | 你可以喊"停！" |

---

## 六、Hook 详解

**Hook 是框架在内部流程的关键节点上预留的插口**，让你在不修改框架源码的情况下，把自己的代码嵌入进去。

你用的时候不需要改 PiAgent 的循环代码，只需要：

```typescript
harness.on("钩子名称", (事件数据) => {
  // 你的逻辑
  return { 修改结果 };  // 可选
});
```

### 全部 14 个 Hook

| Hook 名称 | 触发时机 | 可返回 | 用途 |
|---|---|---|---|
| `before_agent_start` | `prompt()` 开始时 | `{ messages?, systemPrompt? }` | 注入历史消息、改 systemPrompt |
| `context` | 每轮消息发给 LLM 前 | `{ messages? }` | 增删对话消息 |
| `before_provider_request` | LLM 请求发出前 | `{ streamOptions? }` | 改 timeout、headers、retry |
| `before_provider_payload` | 请求体构造后 | `{ payload }` | 改整个请求 payload |
| `after_provider_response` | LLM 响应回来后 | 无 | 读响应头、记录状态 |
| `tool_call` | 工具执行前 | `{ block?, reason? }` | **阻止工具执行** |
| `tool_result` | 工具执行后 | `{ content?, details?, isError? }` | **覆盖工具结果** |
| `session_before_compact` | 压缩对话前 | `{ cancel?, compaction? }` | 取消压缩或提供摘要 |
| `session_compact` | 压缩完成后 | 无 | 记录日志 |
| `session_before_tree` | 对话树切换前 | `{ cancel? }` | 取消切换 |
| `session_tree` | 对话树切换后 | 无 | 记录日志 |
| `model_update` | 模型被切换时 | 无 | 记录日志 |
| `tools_update` | 工具列表被修改时 | 无 | 记录日志 |
| `resources_update` | Skills 被刷新时 | 无 | 记录日志 |

### 最重要 4 个 Hook 示例

```typescript
// ① 阻止危险操作
harness.on("tool_call", (event) => {
  if (event.toolName === "execute_sql" && /DELETE/i.test(event.input.sql)) {
    return { block: true, reason: "不允许删除操作" };
  }
});

// ② 覆盖工具结果
harness.on("tool_result", (event) => {
  if (event.toolName === "execute_sql") {
    return { details: { ...event.details, cached: true } };
  }
});

// ③ 注入额外消息
harness.on("before_agent_start", (event) => {
  return {
    messages: [
      { role: "user", content: [{ type: "text", text: "补充说明..." }], timestamp: Date.now() }
    ]
  };
});

// ④ 修改 LLM 请求参数
harness.on("before_provider_request", (event) => {
  return { streamOptions: { timeoutMs: 60000 } };
});
```

---

## 七、完整事件时序

一次有工具调用的对话，subscribe 收到的全部事件（按时间顺序）：

```
agent_start                  ← Agent 开始运行
turn_start                   ← 第 1 轮开始

// 用户消息
message_start (user)
message_end   (user)

// LLM 开始回复（流式）
message_start (assistant)
message_update { text_delta: "我" }
message_update { text_delta: "先" }
message_update { text_delta: "查" }
message_update { text_delta: "一下" }
...                          ← 更多字
message_update { toolcall_start }    ← LLM 决定调工具

// 工具执行
tool_execution_start         ← discover_schema 开始
  (工具查询 MySQL INFORMATION_SCHEMA)
tool_execution_end           ← discover_schema 完成
message_start (toolResult)
message_end   (toolResult)

// LLM 继续分析
message_update { text_delta: "订单表" }
message_update { text_delta: "有这些字段..." }
...
message_update { toolcall_start }    ← LLM 又决定调工具

// 第二次工具执行
tool_execution_start         ← execute_sql 开始
  (工具执行用户 SQL)
tool_execution_end           ← execute_sql 完成
message_start (toolResult)
message_end   (toolResult)

// LLM 给出最终答案
message_update { text_delta: "上个月订单总额" }
message_update { text_delta: "为 125,800 元" }
...
message_end   (assistant)

turn_end                     ← 第 1 轮结束
save_point                   ← 对话已持久化
agent_end                    ← Agent 完工
settled                      ← 完全空闲
```

---

## 八、消息队列：steer / followUp / nextTurn

PiAgent 支持在运行中途接收新消息，分 3 个优先级：

```
优先级：steer（最高） > nextTurn > followUp（最低）

steer:     打断当前 LLM 回复，立刻注入到内层循环
           例：用户点了"停止"→ harness.abort()
           例：用户说"换个思路"

nextTurn:  当前 LLM 回复结束后立刻注入
           例：调度系统自动追加提示

followUp:  整个 agent loop 结束后才处理（外层循环）
           例：用户快速追问的第二个问题
```

```typescript
// 用法示例
harness.steer("不对，不要查订单表");     // 立刻注入
harness.followUp("顺便也查一下退款");    // 排队
harness.nextTurn("以上分析完毕后生成报表"); // 下轮
```

---

## 九、LLM 调用流程（pi-ai）

当 Agent Loop 需要调用 LLM 时：

```
AgentHarness.createStreamFn()
  │
  ├─ getApiKeyAndHeaders(model)
  │    └─ getEnvApiKey("anthropic") → 从 ANTHROPIC_API_KEY 环境变量取
  │
  ├─ emitHook("before_provider_request")  ← 可改 streamOptions
  │
  └─ streamSimple(model, context, options)
       │
       └─ resolveApiProvider(model.api)
            │
            └─ getApiProvider("anthropic-messages")
                 │
                 └─ streamSimpleAnthropic(model, context, options)
                      │
                      └─ HTTP POST → api.anthropic.com
                           ↕
                      流式返回 text_delta / tool_call
```

### pi-ai 支持的 Provider

框架内置 20+ Provider，只需配好环境变量就能用：

| Provider | 环境变量 | API 标识 |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic-messages` |
| OpenAI | `OPENAI_API_KEY` | `openai-completions` |
| DeepSeek | `DEEPSEEK_API_KEY` | `openai-completions` |
| Google Gemini | `GEMINI_API_KEY` | `google-generative-ai` |
| Mistral | `MISTRAL_API_KEY` | `mistral-conversations` |
| Groq | `GROQ_API_KEY` | `openai-completions` |
| ... | ... | ... |

---

## 十、API Key 解析机制

```typescript
// pi-ai/env-api-keys.js
getEnvApiKey("anthropic")
  → 先查 process.env.ANTHROPIC_OAUTH_TOKEN  (OAuth 优先)
  → 再查 process.env.ANTHROPIC_API_KEY
  → 都没有 → undefined

// 映射表（部分）
"openai"    → "OPENAI_API_KEY"
"deepseek"  → "DEEPSEEK_API_KEY"
"google"    → "GEMINI_API_KEY"
"mistral"   → "MISTRAL_API_KEY"
"groq"      → "GROQ_API_KEY"
```

---

## 十一、Session 与对话持久化

```
Session（InMemorySessionRepo）
  ├── 存储结构：对话树（支持分支和回退）
  ├── 自动保存：message_end 时触发
  ├── compaction：压缩早期对话为摘要
  └── navigateTree：回退到历史分支点重新对话
```

**注意**：DataNova 使用 `InMemorySessionRepo`，对话数据在**服务重启后丢失**。消息的持久化是通过 `store.ts` 的 `saveMessage()` / `listMessages()` 独立存 SQLite 实现的。

---

## 十二、Stream 的层叠封装

```
AgentHarness 层  →  emitOwn / emitAny / emitHook
     ↓
Agent Loop 层    →  emit({ type: "text_delta", ... })
     ↓
pi-ai 层         →  streamSimple(model, context, options)
     ↓
Provider 层      →  streamSimpleAnthropic → HTTP fetch
     ↓
AgentHarness.subscribe  →  你的 callback
     ↓
WebSocket 发送    →  前端 processWsEvent()
```
