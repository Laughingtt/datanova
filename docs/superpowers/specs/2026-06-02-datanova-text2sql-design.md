# DataNova: Text2SQL Agent Design

## Overview

DataNova is a Text2SQL system built on top of the pi agent framework. Users query MySQL databases through natural language; the pi agent translates queries to SQL, executes them, and returns results — all within a multi-turn conversational web interface where every agent step is visible in real time.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  React + Vite SPA                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ 数据源管理 │  │  对话窗口     │  │ Schema 标注   │  │
│  │ (MySQL)   │  │ (流式+内嵌表格)│  │ (表/字段语义) │  │
│  └─────┬────┘  └──────┬───────┘  └───────┬───────┘  │
│        │ REST API      │ WebSocket       │ REST API  │
└────────┼───────────────┼─────────────────┼───────────┘
         │               │                 │
┌────────┼───────────────┼─────────────────┼───────────┐
│  Hono Server           │                 │           │
│  ┌─────┴──────────────┴─────────────────┴──────┐    │
│  │              Routes & WS Handler             │    │
│  └──────────────────┬──────────────────────────┘    │
│                      │                               │
│  ┌──────────────────┴──────────────────────────┐    │
│  │           pi AgentHarness (核心)              │    │
│  │                                               │    │
│  │  systemPrompt: (dynamic function)             │    │
│  │    = 基础指令                                 │    │
│  │    + Schema 信息 (from discover_schema tool) │    │
│  │    + 业务语义标注 (from annotations)           │    │
│  │    + Skill 上下文 (from loaded skills)         │    │
│  │                                               │    │
│  │  tools: [discover_schema, execute_sql]        │    │
│  │                                               │    │
│  │  resources.skills: [...] (SKILL.md files)      │    │
│  │                                               │    │
│  │  events → WebSocket → 前端实时渲染              │    │
│  │                                               │    │
│  │  LLM: pi-ai (可配置提供商/模型)                 │    │
│  └──────────────────┬──────────────────────────┘    │
│                      │                               │
│  ┌───────────┐  ┌────┴─────┐  ┌──────────────────┐  │
│  │ SQLite    │  │ MySQL    │  │ Skills Directory  │  │
│  │ (应用数据) │  │ (用户DB) │  │ (SKILL.md files)  │  │
│  └───────────┘  └──────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## pi Integration Details

### Package Installation

**Only npm install — never modify pi source code.**

```json
{
  "dependencies": {
    "@earendil-works/pi-agent-core": "^0.78.0",
    "@earendil-works/pi-ai": "^0.78.0"
  }
}
```

```bash
npm install @earendil-works/pi-agent-core @earendil-works/pi-ai
```

DataNova is a consumer and extender of pi, not a fork. All pi functionality is used through its public API. If pi lacks a feature needed, the correct path is to contribute upstream, not to patch locally.

### Core Imports

```typescript
// AgentHarness — high-level agent with session, skills, events
import { AgentHarness, loadSkills, formatSkillsForSystemPrompt } from "@earendil-works/pi-agent-core";

// pi-ai — unified LLM API
import { getModel, streamSimple, type Model, type Context } from "@earendil-works/pi-ai";

// TypeBox — schema definition (required by pi tool interface)
import { Type } from "typebox";
```

### AgentHarness Configuration

DataNova uses `AgentHarness` from pi-agent-core, NOT the `Agent` class directly and NOT the `createAgentSession` from coding-agent.

```typescript
import { AgentHarness, loadSkills } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";

// 1. Create ExecutionEnv — pi requires this for skill loading
const env: ExecutionEnv = createNodeExecutionEnv({
  cwd: appDataDir  // base directory for skill file resolution
});

// 2. Load skills from directories
const { skills, diagnostics } = await loadSkills(env, [
  path.join(appDataDir, "skills"),           // business skill directory
  path.join(appDataDir, "annotations")       // auto-generated annotation skills
]);

// 3. Create session — use pi's JsonlSessionRepo for persistence
const sessionRepo = new JsonlSessionRepo({ cwd: sessionsDir });
const session = await sessionRepo.create({ id: conversationId });

// 4. Define tools using pi's AgentTool interface
const discoverSchemaTool: AgentTool = {
  name: "discover_schema",
  label: "发现数据库表结构",
  description: "查询 MySQL 数据库的表结构、字段信息。可指定表名，不指定则返回所有表。",
  parameters: Type.Object({
    tables: Type.Optional(Type.Array(Type.String(), {
      description: "指定要查询的表名列表，不填则查询所有表"
    }))
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    const schema = await mysqlDiscovery.querySchema(params.tables);
    const annotations = await store.getAnnotations(params.tables);
    return {
      content: [{
        type: "text",
        text: formatSchemaWithAnnotations(schema, annotations)
      }],
      details: { schema, annotations }
    };
  }
};

const executeSqlTool: AgentTool = {
  name: "execute_sql",
  label: "执行 SQL 查询",
  description: "执行 SQL 查询并返回结果。仅允许 SELECT 语句。",
  parameters: Type.Object({
    sql: Type.String({ description: "要执行的 SQL 查询语句" })
  }),
  executionMode: "sequential",  // SQL queries must run one at a time
  execute: async (toolCallId, params, signal, onUpdate) => {
    // Query timeout and row limit
    const result = await mysqlExecutor.query(params.sql, {
      timeout: 30000,
      rowLimit: 1000
    });
    return {
      content: [{
        type: "text",
        text: formatQueryResult(result)
      }],
      details: { columns: result.columns, rows: result.rows, rowCount: result.rows.length }
    };
  }
};

// 5. Dynamic system prompt function
const systemPromptFn = ({ env, session, model, thinkingLevel, activeTools, resources }) => {
  return buildDataNovaSystemPrompt({
    datasource: currentDatasource,
    annotations: currentAnnotations,
    skills: resources.skills ?? []
  });
};

// 6. Create AgentHarness
const harness = new AgentHarness({
  env,
  session,
  model: getModel(config.provider, config.model),
  tools: [discoverSchemaTool, executeSqlTool],
  activeToolNames: ["discover_schema", "execute_sql"],
  systemPrompt: systemPromptFn,
  resources: { skills },
  getApiKeyAndHeaders: async (model) => {
    const apiKey = await resolveApiKey(model.provider);
    return { apiKey, headers: undefined };
  }
});

// 7. Subscribe to events — push to WebSocket
harness.subscribe((event) => {
  wsManager.send(conversationId, event);
});
```

### Running the Agent

```typescript
// User sends a message
await harness.prompt(userMessage);

// Multi-turn: harness retains state, just prompt again
await harness.prompt(followUpMessage);

// Dynamic skill injection (e.g. after user adds annotation)
const { skills: updatedSkills } = await loadSkills(env, [skillsDir, annotationsDir]);
await harness.setResources({ skills: updatedSkills });
```

## Frontend

### Three Core Modules

**1. 数据源管理 (Datasource Management)**
- Configure MySQL connections (host, port, database, user, password)
- Test connection
- Enable/disable per datasource
- Password stored encrypted (AES-256-GCM)

**2. 对话窗口 (Chat)**
- Left sidebar: conversation history list, new conversation button
- Each conversation binds to one AgentHarness instance
- Real-time display of every agent step:
  - 🔍 正在发现 Schema...
  - 📋 发现 12 张表，3 张与账单相关
  - 🛠️ 正在生成 SQL...
  - 💻 执行 SQL: SELECT SUM(amount) FROM bills WHERE ...
  - ✅ 查询完成，返回 3 行数据
  - 📊 [内嵌表格展示查询结果]
  - 💬 上月账单总额为 5,490 元
- Data results render as inline table within chat flow
- Multi-turn: can ask follow-up questions

**3. Schema 标注管理 (Schema Annotation)**
- Display all database tables/fields (from discover_schema)
- Each table: add business description (e.g. `bills` → "账单表，记录所有客户账单信息")
- Each field: add business meaning (e.g. `amount` → "账单金额，单位为元")
- Annotations linked to specific table/field — clear what they refer to
- Annotations persisted in SQLite
- When saved, auto-generate a SKILL.md file for pi to load

### Annotation → SKILL.md Auto-Generation

```
User annotates in frontend:
  bills 表 → "账单表，记录客户账单"
  bills.amount → "账单金额，单位元"
  bills.status → "状态: paid/unpaid/overdue"
       │
       ▼
Backend saves to SQLite AND generates:
  annotations/schema-annotations/SKILL.md:
    ---
    name: schema-annotations
    description: 数据库业务语义标注，查询相关表时务必参考此 skill
    ---

    # 数据库业务语义标注

    ## bills (账单表，记录客户账单)
    - amount: 账单金额，单位元
    - status: 状态 (paid/unpaid/overdue)

    ## customers (客户表)
    ...
       │
       ▼
pi AgentHarness auto-loads via loadSkills() + setResources()
```

## Skill Extension Mechanism

Business skills are standard pi SKILL.md files. DataNova leverages pi's native skill system — no custom skill framework.

### Skill File Structure

```
skills/
├── bill-query/
│   └── SKILL.md          # 账单查询 skill
├── customer-analysis/
│   └── SKILL.md          # 客户分析 skill
└── schema-annotations/
    └── SKILL.md          # Auto-generated from user annotations
```

### Skill File Format (pi standard)

```markdown
---
name: bill-query
description: 当用户询问账单、费用、付款相关问题时使用此 skill
---

# 账单查询

当用户询问账单、费用、付款相关问题时使用此 skill。

## 相关表

- `bills`: 账单表，记录所有客户账单
  - `id`: 账单主键
  - `customer_id`: 客户编号，关联 customers.id
  - `amount`: 账单金额，单位为元
  - `status`: 账单状态 (paid/unpaid/overdue)
  - `period`: 账期，格式 YYYY-MM
- `customers`: 客户表
  - `id`: 客户主键
  - `name`: 客户名称

## 表关联规则

- 账单与客户: `bills.customer_id = customers.id`
- 账单与订单: `bills.order_id = orders.id`

## 查询示例

用户: "查询上月未付款的账单"
SQL: SELECT b.*, c.name as customer_name FROM bills b
     JOIN customers c ON b.customer_id = c.id
     WHERE b.status = 'unpaid' AND b.period = DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m')

## 注意事项

- 金额查询默认按元展示
- 状态筛选必须使用英文枚举值
```

### Dynamic Skill Injection

After deployment, new skills can be added three ways:

| Method | Operation | Use Case |
|--------|-----------|----------|
| **File system** | Drop SKILL.md into `skills/` directory, then call `refreshSkills()` | Ops deploying new skill |
| **Frontend** | Schema annotation UI creates/updates annotation SKILL.md, then `refreshSkills()` | Non-technical users |
| **API** | POST /api/skills with SKILL.md content, backend writes file and `refreshSkills()` | Automation |

```typescript
async function refreshSkills() {
  const { skills: updatedSkills } = await loadSkills(env, [
    path.join(appDataDir, "skills"),
    path.join(appDataDir, "annotations")
  ]);
  await harness.setResources({ skills: updatedSkills });
}
```

Skill activation is handled by the LLM: skill descriptions are injected into the system prompt by pi's `formatSkillsForSystemPrompt()`. The LLM reads the skill when the user's question matches its description.

## Backend Service

### API Routes

```
REST API:
├─ POST   /api/datasources             创建数据源
├─ GET    /api/datasources             列出数据源
├─ PUT    /api/datasources/:id         更新数据源
├─ DELETE /api/datasources/:id         删除数据源
├─ POST   /api/datasources/:id/test    测试连接
│
├─ GET    /api/schemas/:dsId           获取表结构
├─ PUT    /api/schemas/:dsId/tables/:table     标注表
├─ PUT    /api/schemas/:dsId/fields/:field     标注字段
│
├─ GET    /api/skills                  列出 skills
├─ GET    /api/skills/:name            获取 skill 内容
├─ POST   /api/skills                  创建/更新 skill
├─ DELETE /api/skills/:name            删除 skill
│
├─ GET    /api/conversations           列出对话
├─ POST   /api/conversations           新建对话
├─ DELETE /api/conversations/:id       删除对话
│
WebSocket:
└─ /ws/chat/:conversationId
    ├─ client → server: { type: "message", text }
    └─ server → client: pi AgentHarness events
        ├─ { type: "agent_start" }
        ├─ { type: "message_start", message }
        ├─ { type: "message_update", message, assistantMessageEvent }
        ├─ { type: "message_end", message }
        ├─ { type: "tool_execution_start", toolCallId, toolName, args }
        ├─ { type: "tool_execution_update", toolCallId, toolName, partialResult }
        ├─ { type: "tool_execution_end", toolCallId, toolName, result, isError }
        ├─ { type: "turn_start" }
        ├─ { type: "turn_end", message, toolResults }
        └─ { type: "agent_end", messages }
```

### Data Storage

| Data | Storage | Notes |
|------|---------|-------|
| Datasource config | SQLite (better-sqlite3) | MySQL connection info, passwords encrypted (AES-256-GCM) |
| Schema annotations | SQLite + auto-generated SKILL.md | Dual write: structured storage + pi skill file |
| Conversation history | pi's JsonlSessionRepo | pi's native session persistence |
| Skill definitions | File system (skills/ directory) | pi's native skill discovery |
| App config | SQLite | LLM provider settings, default model |

### System Prompt Builder

The system prompt is a dynamic function passed to AgentHarness. It rebuilds on every turn so annotations and skills are always current.

```typescript
function buildDataNovaSystemPrompt(options: {
  datasource: DatasourceInfo;
  annotations: SchemaAnnotation[];
  skills: Skill[];
}): string {
  const parts: string[] = [];

  // 1. Base instructions
  parts.push(`你是一个数据查询助手，帮助用户通过自然语言查询 MySQL 数据库。

## 规则
1. 只生成 SELECT 查询，不修改数据
2. 优先使用 discover_schema 工具了解表结构
3. SQL 生成后直接调用 execute_sql 执行
4. 查询结果以表格形式展示，附上文字总结
5. 用中文回答用户问题
6. 参考业务语义标注理解字段含义
7. 参考已加载的 skill 处理特定业务场景
8. 当前日期: ${new Date().toISOString().split("T")[0]}`);

  // 2. Datasource info
  parts.push(`## 数据库信息
- 数据库: ${options.datasource.database}
- 类型: MySQL`);

  // 3. Skills (using pi's formatSkillsForSystemPrompt)
  if (options.skills.length > 0) {
    parts.push(formatSkillsForSystemPrompt(options.skills));
  }

  return parts.join("\n\n");
}
```

## Project Structure

```
pi_datanova/
├── packages/
│   ├── server/                         # Hono 后端服务
│   │   ├── src/
│   │   │   ├── index.ts                # Hono 入口
│   │   │   ├── routes/
│   │   │   │   ├── datasources.ts
│   │   │   │   ├── schemas.ts
│   │   │   │   ├── skills.ts
│   │   │   │   └── conversations.ts
│   │   │   ├── ws/
│   │   │   │   └── chat-handler.ts      # WebSocket → pi AgentHarness 桥接
│   │   │   ├── agent/
│   │   │   │   ├── datanova-harness.ts  # AgentHarness 创建与配置
│   │   │   │   ├── tools/
│   │   │   │   │   ├── discover-schema.ts
│   │   │   │   │   └── execute-sql.ts
│   │   │   │   ├── prompt-builder.ts    # System prompt 动态构建
│   │   │   │   └── skill-manager.ts     # Skill 加载与刷新
│   │   │   ├── mysql/
│   │   │   │   ├── connection-pool.ts
│   │   │   │   ├── schema-discovery.ts
│   │   │   │   └── query-executor.ts
│   │   │   ├── store.ts                # SQLite 数据存储
│   │   │   ├── config.ts               # 配置管理
│   │   │   └── crypto.ts               # 密码加密
│   │   └── package.json
│   │
│   └── web/                            # React 前端
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── Chat/
│       │   │   │   ├── ChatWindow.tsx
│       │   │   │   ├── MessageList.tsx
│       │   │   │   ├── MessageItem.tsx
│       │   │   │   ├── StepIndicator.tsx    # 工具调用步骤展示
│       │   │   │   ├── TableResult.tsx      # 内嵌表格
│       │   │   │   └── ChatInput.tsx
│       │   │   ├── Datasource/
│       │   │   │   ├── DatasourceList.tsx
│       │   │   │   └── DatasourceForm.tsx
│       │   │   ├── Schema/
│       │   │   │   ├── SchemaTree.tsx
│       │   │   │   └── AnnotationEditor.tsx
│       │   │   └── Sidebar.tsx
│       │   ├── hooks/
│       │   │   ├── useWebSocket.ts
│       │   │   └── useAgentStream.ts
│       │   ├── stores/
│       │   │   └── conversation.ts         # Zustand store
│       │   └── api/
│       │       └── client.ts
│       ├── index.html
│       └── package.json
│
├── data/                               # Runtime data directory
│   ├── skills/                         # Business skill SKILL.md files
│   ├── annotations/                    # Auto-generated annotation SKILL.md files
│   └── sessions/                       # pi session JSONL files
│
├── package.json                        # monorepo root
└── tsconfig.json
```

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo | npm workspaces | Consistent with pi, simple enough |
| Agent framework | pi `AgentHarness` | Native skill loading, session persistence, event streaming — no need to reinvent |
| LLM API | pi `pi-ai` | Unified multi-provider interface, consistent with pi ecosystem |
| Tool interface | pi `AgentTool` | Standard interface with TypeBox schemas, execution modes |
| Skill mechanism | pi `loadSkills()` + SKILL.md | Standard agentskills.io format, dynamic injection via `setResources()` |
| Session storage | pi `JsonlSessionRepo` | Native AgentHarness session persistence |
| Data storage | better-sqlite3 | Lightweight, no extra service, Node.js native |
| Password encryption | Node.js crypto (aes-256-gcm) | Datasource password encryption at rest |
| Frontend state | Zustand | Lightweight, TypeScript-friendly |
| WebSocket | ws (Node.js) + native WebSocket (browser) | Simple and reliable |
| Table component | @tanstack/react-table | Powerful headless component, customizable |
| SQL validation | None extra | Rely on LLM generating correct SQL + MySQL error feedback to LLM for self-correction |
| Schema discovery | MySQL INFORMATION_SCHEMA | Standard approach for table/field/index/foreign key discovery |

## Safety Guardrails

Although user chose "direct execution", basic protections apply:

- **SELECT only** — system prompt constrains the agent to generate only SELECT queries
- **Query timeout** — execute_sql tool sets 30s timeout
- **Row limit** — default LIMIT 1000 to prevent massive result sets
- **Connection pool** — per-datasource connection pool to prevent resource exhaustion
- **Encrypted passwords** — AES-256-GCM encryption at rest for MySQL credentials

## Error Handling

- SQL execution failure → MySQL error returned to agent → agent self-corrects SQL and retries
- Datasource connection failure → Frontend notification, agent informs user
- LLM call failure → pi's built-in retry mechanism, frontend displays error
- WebSocket disconnect → Client auto-reconnects, agent continues server-side

## Future Extensions (V2+)

- Skill visual editor in frontend
- Query result chart visualization
- Multi-datasource support
- Query history and bookmarking
- Role-based access control