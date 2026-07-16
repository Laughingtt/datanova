# Agent 集成指南

> 本文档详解如何在 DataNova 中集成和使用 PiAgent，包括完整的调用链、数据流和最佳实践。

---

## 一、Agent 访问方式总览

DataNova 通过以下路径与 PiAgent 交互：

```
前端（React）                         后端（Hono + PiAgent）
─────────────────                    ───────────────────────

用户输入文字                           WebSocket 接收
    ↓                                     ↓
ChatInput.handleSend()                chat-handler.ts
    ↓                                     ↓
useAgentStream.sendMessage()          handleMessage(ws, data)
    ↓                                     ↓
useWebSocket.send({type:"message"})   getHarness(conversationId)
    ↓                                     ↓
WebSocket ──── JSON ────────────→    harness.prompt(text)
                                          ↓
                                     Agent Loop 运行
                                     （LLM ? 工具循环）
                                          ↓
                                     subscribe 回调 → forwardEvent(ws, event)
                                          ↓
                                     WebSocket ──── JSON ────→ processWsEvent()
                                                                   ↓
                                                              React 重渲染
```

---

## 二、AgentHarness 创建示例

### 最小化创建

```typescript
import { AgentHarness, InMemorySessionRepo } from "@earendil-works/pi-agent-core";
import { getModel, getEnvApiKey } from "@earendil-works/pi-ai";

const sessionRepo = new InMemorySessionRepo();
const harnessMap = new Map<string, AgentHarness>();

async function createHarness(conversationId: string) {
  // 1. 模型
  const model = getModel("anthropic", "claude-sonnet-4-20250514");

  // 2. 会话
  const session = await sessionRepo.create({ id: conversationId });

  // 3. 创建
  const harness = new AgentHarness({
    env: createMinimalEnv(),
    session,
    tools: [/* AgentTool[] */],
    resources: { skills: [] },
    systemPrompt: "You are a helpful assistant.",
    model,
    getApiKeyAndHeaders: async (model) => ({
      apiKey: getEnvApiKey(model.provider) ?? "",
      headers: {},
    }),
  });

  harnessMap.set(conversationId, harness);
  return harness;
}
```

### 事件订阅

```typescript
harness.subscribe((event) => {
  switch (event.type) {
    case "agent_start":
      sendEvent(ws, { type: "agent_start" });
      break;

    case "text_delta":
      // 流式文本：逐字推送给前端
      if ("delta" in event && event.delta) {
        sendEvent(ws, { type: "text_delta", delta: event.delta });
      }
      break;

    case "tool_execution_start":
      sendEvent(ws, {
        type: "tool_execution_start",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
      });
      break;

    case "tool_execution_end":
      sendEvent(ws, {
        type: "tool_execution_end",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.result,
        isError: event.isError,
      });
      break;

    case "agent_end":
      sendEvent(ws, { type: "agent_end" });
      break;

    case "settled":
      sendEvent(ws, { type: "settled" });
      break;
  }
});
```

### 发送消息

```typescript
// 获取 harness
const harness = harnessMap.get(conversationId);
if (!harness) {
  sendEvent(ws, { type: "error", error: "会话未初始化" });
  return;
}

// 持久化用户消息
saveMessage({ conversationId, role: "user", content: text });

// 触发 Agent Loop
const assistantMessage = await harness.prompt(text);
// assistantMessage 是最后一条 LLM 回复
```

---

## 三、AgentTool 模式

### 工具定义模板

```typescript
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

// 1. 定义参数 schema（typebox）
const MyToolParams = Type.Object({
  datasource_id: Type.String({ description: "数据源 ID" }),
  table_names: Type.Optional(Type.Array(Type.String())),
});

type MyToolParams = Static<typeof MyToolParams>;

// 2. 工厂函数返回 AgentTool
export function createMyTool(): AgentTool<typeof MyToolParams, { count: number }> {
  return {
    name: "my_tool",                    // LLM 可见的工具名
    description: "这个工具干什么...",     // LLM 看到的描述
    label: "我的工具",                   // UI 标签
    parameters: MyToolParams,            // 参数 schema（typebox 自动校验）
    executionMode: "sequential",         // 可选：parallel（默认）/ sequential

    // 3. 核心执行函数
    execute: async (toolCallId, params) => {
      try {
        // 你的业务逻辑
        const result = await doSomething(params);

        return {
          content: [{ type: "text", text: "给 LLM 看的文本结果" }],
          details: { count: result.length },  // 结构化详情（前端可用）
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `错误: ${err.message}` }],
          details: { count: 0 },
          isError: true,  // 标记为错误
        };
      }
    },

    // 可选：参数预处理（兼容旧格式）
    prepareArguments: (args) => {
      // 调整 args 以匹配 parameters schema
      return args;
    },
  };
}
```

### 关键约定

| 约定 | 说明 |
|---|---|
| `execute` 不抛异常 | 错误通过 `isError: true` 返回，不 throw |
| `details` 是任意结构 | 给前端用的，不发给 LLM |
| `content` 发给 LLM | `[{ type: "text", text: "..." }]` 格式 |
| `parameters` 用 typebox | 框架自动校验参数，不匹配时拒绝执行 |
| 工具名全局唯一 | 框架启动时检查重复 |

---

## 四、WebSocket 协议实现

### 服务端（chat-handler.ts）

```typescript
// 消息处理入口
function createChatHandler() {
  return {
    onOpen(_event, ws) {
      sendEvent(ws, { type: "connected" });
    },

    async onMessage(event, ws) {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "init":
          await handleInit(ws, data);
          break;
        case "message":
          await handleMessage(ws, data);
          break;
        case "reset_context":
          await handleResetContext(ws, data);
          break;
      }
    },
  };
}

// init：创建 AgentHarness + 注册事件订阅
async function handleInit(ws, data) {
  const options = {
    conversationId: data.payload.conversationId,
    datasourceId: data.payload.datasourceId,
    modelProvider: data.payload.modelProvider,
    modelId: data.payload.modelId,
  };

  const harness = await createHarness(options);

  // 注册事件转发
  harness.subscribe((event) => {
    forwardEvent(ws, event);
  });

  // 发送历史消息
  const history = listMessages(options.conversationId);
  if (history.length > 0) {
    sendEvent(ws, { type: "message_history", messages: history });
  }

  sendEvent(ws, { type: "init_success", conversationId: options.conversationId });
}

// message：发送用户消息
async function handleMessage(ws, data) {
  const harness = getHarness(data.payload.conversationId);
  
  // 构建多轮 SQL 上下文前缀
  const datasourceId = conversationDatasourceMap.get(conversationId);
  let contextPrefix = "";
  if (datasourceId) {
    const recentSql = getRecentSqlContext(datasourceId, 3);
    if (recentSql.length > 0) {
      contextPrefix = "[Conversation SQL Context - " + recentSql.length + " recent queries]\n"
        + recentSql.map((ctx, i) =>
          "[Recent query " + (i+1) + "] Question: \"" + ctx.question + "\" | Tables: " + ctx.tables.join(", ")
          + " | Rows: " + (ctx.rowCount ?? "?") + " | Time: " + (ctx.executionTimeMs ?? "?") + "ms\n  SQL: " + ctx.sql
        ).join("\n") + "\n\n";
    }
  }
  
  await harness.prompt(contextPrefix + data.text);
}
```

### 前端（useWebSocket.ts + useAgentStream.ts）

```typescript
// useWebSocket.ts：连接管理 + 自动重连
function useWebSocket(options) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectCountRef = useRef(0);

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    ws.onopen = () => { setIsConnected(true); reconnectCountRef.current = 0; };
    ws.onmessage = (event) => { onMessage?.(JSON.parse(event.data)); };
    ws.onclose = () => {
      setIsConnected(false);
      if (reconnectCountRef.current < maxReconnectAttempts) {
        reconnectCountRef.current++;
        setTimeout(connect, reconnectInterval);
      }
    };
    wsRef.current = ws;
  }, [url]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { isConnected, send };
}

// useAgentStream.ts：事件处理
function processWsEvent(event, currentAssistantMessage) {
  switch (event.type) {
    case "agent_start":
      return { id: `assistant-${Date.now()}`, role: "assistant", content: "", isStreaming: true, steps: [] };

    case "text_delta":
      return { ...currentAssistantMessage, content: currentAssistantMessage.content + event.delta };

    case "tool_execution_start":
      return {
        ...currentAssistantMessage,
        steps: [...currentAssistantMessage.steps, { type: "tool_call", toolName: event.toolName, args: event.args }]
      };

    case "tool_execution_end":
      // 将 matching tool_call 步骤转为 tool_result
      const steps = [...currentAssistantMessage.steps];
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].type === "tool_call" && steps[i].toolName === event.toolName) {
          steps[i] = { ...steps[i], type: "tool_result", result: event.result };
          break;
        }
      }
      return { ...currentAssistantMessage, steps };

    case "agent_end":
    case "settled":
      return { ...currentAssistantMessage, isStreaming: false };

    case "message_history":
      return "clear";  // 替换全部消息

    default:
      return null;
  }
}
```

---

## 五、Skills 机制

### 定义 Skill

```
data/skills/{技能名}/SKILL.md
```

```markdown
# 技能标题（会被提取为 description）

## When to Use
描述什么情况下使用这个技能...

## Guidelines
1. 行为准则...
2. ...

## Example Queries
- "示例问题 1"
- "示例问题 2"
```

### 加载与刷新

```typescript
// 加载
const skills = loadAllSkills();
// → [{ name: "bill-query", description: "Bill Query Skill", content: "...", filePath: "..." }]

// 拼入 system prompt
const systemPrompt = buildDataNovaSystemPrompt({ skills });
// → "## Available Skills\n<skill>..."

// 动态刷新
await harness.setResources({ skills });
```

### 注解变更与 Harness 刷新

当用户修改注解后，系统刷新所有活跃会话（注解本身通过 `discover_schema` 工具的 `formatSchemaForPrompt()` 注入，不再生成单独的 SKILL.md 文件）：

```typescript
// 刷新所有活跃会话
refreshHarnessesForDatasource(datasourceId);
// → 遍历所有 harness → refreshHarnessSkills() → harness.setResources()
```

> **变更说明**：以前注解会通过 `generateAnnotationSkill()` 生成 `data/annotations/*/SKILL.md` 文件，同时通过 `discover_schema` 返回。这导致同一份标注在 prompt 中出现两次。现在已移除 SKILL.md 生成路径，标注仅通过 `discover_schema` 的结构化格式注入。

---

## 六、运行命令

```bash
# 安装依赖
npm install

# 开发环境（需要两个终端）
npm run dev:server   # 后端 :3000
npm run dev:web      # 前端 :5173（代理到后端）

# 生产构建
npm run build

# 运行构建产物
npm run --workspace=packages/server start
```

### 环境变量

参考项目根目录 `.env.example`：

| 变量 | 说明 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Claude API 密钥 |
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 |
| `DATANOVA_ENCRYPTION_KEY` | 32 字节加密密钥（数据源密码加密） |
| `DATANOVA_DIR` | 数据目录（默认 `./data`） |
| `PORT` | 服务端口（默认 `3000`） |
| `DATANOVA_PROVIDER` | 默认 LLM Provider |
| `DATANOVA_MODEL` | 默认 LLM 模型 |

---

## 七、关键设计决策

| 决策 | 原因 |
|---|---|
| 语义层优先于 LLM 写 SQL | 人定义的 SQL 比 LLM 生成的可靠 |
| Schema Cache 用内存不用查数据库 | 表结构信息量小，内存 O(1) 查询比 SQL 快 |
| Skills 用文件不用数据库 | 简单、可编辑、可 Git 版本控制 |
| 密码 AES-256-GCM 加密 | 数据源密码不能明文存储 |
| InMemorySessionRepo | 对话上下文存内存，重启丢失（历史消息另存 SQLite） |
| 单 WebSocket 连接 | 所有会话复用一条连接，通过 init 消息切换 |
| conversationDatasourceMap | chat-handler 维护 conversationId→datasourceId 映射，用于多轮 SQL 上下文注入 |
| execute_sql 自动加 LIMIT | 防止 LLM 写全表扫描拖垮数据库 |
| typebox 参数校验 | 在工具执行前拦截非法参数，不浪费 LLM 回合 |
