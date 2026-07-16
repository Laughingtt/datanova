# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DataNova is an AI-powered SQL data query assistant. Users interact via natural language chat; an Agent discovers database schemas, generates and executes SQL queries, and displays results in tables. The UI is fully in Simplified Chinese.

## Tech Stack

- **Monorepo**: npm workspaces (`packages/server`, `packages/web`)
- **Backend**: Hono + Node.js (ESM, `"type": "module"`), better-sqlite3 (metadata), mysql2 (user queries)
- **Frontend**: React 19 + Vite 6 + TailwindCSS 3 + Zustand 5 + TanStack Table + Recharts
- **AI**: @earendil-works/pi-agent-core (AgentHarness), @earendil-works/pi-ai (multi-provider LLM config — NOT a callable client)
- **Chinese NLP**: nodejieba (中文分词, used in tokenizer for semantic layer & example lookup)
- **Schema validation**: @sinclair/typebox
- **Encryption**: AES-256-GCM (datasource passwords)
- **E2E**: Playwright (`@playwright/test`)
- **Unit tests**: Vitest (server only, no config file — uses defaults)

## Development Commands

```bash
# Install dependencies
npm install

# Development (run both in separate terminals)
npm run dev:server   # Backend dev server (tsx watch, :3000)
npm run dev:web      # Frontend dev server (Vite, :5173, proxies to backend)

# Production build
npm run build        # Builds server first (tsc), then web (tsc + vite build)

# Run built server
npm run --workspace=packages/server start   # node dist/index.js

# Unit tests (server)
npm run --workspace=packages/server test          # Run all vitest tests
npm run --workspace=packages/server test:watch    # Watch mode
npx vitest run packages/server/src/routes/__tests__/semantic.test.ts  # Single test file

# E2E tests (auto-starts both server and web dev server)
npx playwright test
```

Note: E2E tests use Playwright's `webServer` config to auto-start the backend (`:3000`) and frontend (`:5173`). Set `reuseExistingServer: true` so already-running servers are reused.

## Architecture

### Data Flow (Hot Path)

```
ChatInput → ChatWindow.handleSend() → optimistic UI update
  ↓
useAgentStream.sendMessage() → useWebSocket.send({ type:"message" })
  ↓
Vite Proxy /ws → ws://localhost:3000/ws/chat
  ↓
chat-handler.ts → agentType routing:
  "query" → harnessMap.get(conversationId) → harness.prompt(text)
  other   → agentRegistry.createHarness(agentType, opts)
  ↓
AgentHarness → LLM API (multi-turn tool calls)
  ↓
forwardEvent(ws, event) → WebSocket → processWsEvent() → React re-render
```

### Multi-Agent Architecture

DataNova uses a **Multi-Agent framework** built on `AgentRegistry` (agent-registry.ts). Each Agent has its own tool set, system prompt, and harness factory.

| Agent | ID | Tools | System Prompt |
|---|---|---|---|
| 智能问数 | `query` | discover_schema, execute_sql, lookup_semantic_layer, lookup_examples, read_skill, ai_annotate_schema | `buildDataNovaSystemPrompt()` |
| 指标开发 | `metric_dev` | discover_schema, execute_sql, lookup_semantic_layer, lookup_examples, read_skill, validate_and_test_metric, check_metric_conflict, create_metric_draft, create_dimension_draft, request_user_confirm | `buildMetricDevSystemPrompt()` |

**Agent routing flow**: `chat-handler.ts` reads `agentType` from the init payload. `query` uses the existing `createHarness()`, other agents go through `agentRegistry.createHarness()`.

**Key files**:
- `agent-registry.ts` — `AgentRegistry` class with `registerAgent()`, `registerTool()`, `createHarness()`
- `agent-registration.ts` — `registerAllAgents()` + `registerAllTools()`, called from `index.ts` at startup
- `tool-registration.ts` — `registerAllTools()`, registers all tools into the shared pool
- `metric-dev-harness.ts` — `createMetricDevHarness()` factory for the metric_dev agent
- `prompt-builder-metric-dev.ts` — metric_dev system prompt (先查后建, 验证闭环, 自动修复, 草稿安全, 自动保存)

**Frontend agent registry**: `packages/web/src/agents/registry.ts` defines `AGENT_REGISTRY` with `AgentInfo` objects (id, name, icon, capabilities, entryPoints, welcomeMessage). `ChannelTabs` renders tabs for each agent.

### Key Files

| File | Responsibility |
|---|---|
| `packages/server/src/index.ts` | Hono app entry, route registration, WebSocket endpoint, `initAgentFramework()` |
| `packages/server/src/ws/chat-handler.ts` | WebSocket event handling, harness lifecycle, agentType routing, event forwarding |
| `packages/server/src/agent/agent-registry.ts` | AgentRegistry class — agent & tool registration, harness creation |
| `packages/server/src/agent/agent-registration.ts` | Register all agents (query, metric_dev) and tools |
| `packages/server/src/agent/tool-registration.ts` | Register all tools into shared pool |
| `packages/server/src/agent/harness-factory.ts` | Query Agent harness creation, tool registration, system prompt assembly |
| `packages/server/src/agent/metric-dev-harness.ts` | Metric Dev Agent harness creation with dedicated tools |
| `packages/server/src/agent/prompt-builder.ts` | Query Agent system prompt construction |
| `packages/server/src/agent/prompt-builder-metric-dev.ts` | Metric Dev Agent system prompt (指标开发工作流) |
| `packages/server/src/agent/skill-manager.ts` | Skill loading from SKILL.md files, injection into system prompt |
| `packages/server/src/agent/semantic-sql-builder.ts` | Deterministic SQL builder for semantic layer queries |
| `packages/server/src/store.ts` | SQLite CRUD — all tables: datasources, conversations, annotations, semantic layer, query skills, scheduled queries, query history, bookmarks |
| `packages/server/src/routes/insights.ts` | Insights stats, top queries, SQL execution for BI dashboard |
| `packages/server/src/routes/bookmarks.ts` | Query bookmark CRUD + execution |
| `packages/server/src/routes/query-skills.ts` | Query skill CRUD + AI generation + preview |
| `packages/server/src/agent/skill-formatter.ts` | QuerySkill → SKILL.md formatting and sync |
| `packages/server/src/mysql/pool.ts` | MySQL connection pool management |
| `packages/server/src/mysql/executor.ts` | SQL execution with timeout, row limits, `validateSqlViaExplain()` |
| `packages/server/src/mysql/discovery.ts` | INFORMATION_SCHEMA queries for schema discovery |
| `packages/server/src/mysql/validator.ts` | SQL validation (whitelist, schema cache, table name checks) |
| `packages/server/src/scheduler.ts` | Cron scheduler for scheduled query execution with alert conditions |
| `packages/server/src/crypto.ts` | AES-256-GCM encryption/decryption for datasource passwords |
| `packages/server/src/config.ts` | App configuration loading |
| `packages/web/src/agents/registry.ts` | Frontend agent registry (AGENT_REGISTRY, getAgentById, getAgentEntryPoint) |
| `packages/web/src/agents/types.ts` | AgentInfo & EntryPoint types |
| `packages/web/src/components/Chat/ChatWindow.tsx` | Main chat orchestrator, message state, WS event handling, multi-agent channel switching |
| `packages/web/src/hooks/useAgentStream.ts` | Agent stream processing, processWsEvent, ChatMessage/ConfirmAction types |
| `packages/web/src/hooks/useWebSocket.ts` | WebSocket connection management, auto-reconnect |
| `packages/web/src/components/ChartRenderers.tsx` | Shared chart rendering (Recharts) for chat results and dashboard |

### Route Registration Pattern

Routes are registered in `index.ts` using two patterns:
- **Direct routes**: `app.route("/api/datasources", datasourcesRoutes)` — prefix-based
- **Factory routes**: `app.route("/", createSemanticRoutes())` — factory functions return Hono instances with full paths

Factory routes (semantic, scheduled, dictionary, insights, bookmarks, query-skills) define their own `/api/...` paths internally rather than receiving a prefix.

### Agent Tools

Registered in `tool-registration.ts` into a shared pool, then each agent picks its tool set:

| Tool | File | Purpose | Agents |
|---|---|---|---|
| `discover_schema` | `tools/discover-schema.ts` | Query INFORMATION_SCHEMA for table/column/FK metadata | query, metric_dev |
| `execute_sql` | `tools/execute-sql.ts` | Execute SELECT queries with validation (30s timeout, 1000 row limit). Records EVERY execution to `sql_query_history`. | query, metric_dev |
| `ai_annotate_schema` | `tools/ai-annotate-schema.ts` | Generate business annotations from schema + sample data | query |
| `lookup_semantic_layer` | `tools/lookup-semantic-layer.ts` | Search semantic metrics/dimensions by keyword (jieba tokenization), return deterministic SQL | query, metric_dev |
| `lookup_examples` | `tools/lookup-examples.ts` | Search past successful queries for few-shot examples (jieba tokenization) | query, metric_dev |
| `read_skill` | `tools/read-skill.ts` | Load full skill content on demand (progressive loading) | query, metric_dev |
| `ai_suggest_semantic_layer` | `tools/ai-suggest-semantic.ts` | Analyze schema and recommend metrics/dimensions/models | query |
| `validate_and_test_metric` | `tools/validate-and-test-metric.ts` | Validate metric SQL: EXPLAIN check + execute test + result analysis (null ratios, value ranges) | metric_dev |
| `check_metric_conflict` | `tools/check-metric-conflict.ts` | Check name/display_name conflicts against existing metrics | metric_dev |
| `create_metric_draft` | `tools/create-metric-draft.ts` | Create metric as draft with EXPLAIN validation + conflict check | metric_dev |
| `create_dimension_draft` | `tools/create-dimension-draft.ts` | Create dimension as draft | metric_dev |
| `request_user_confirm` | `tools/request-confirm.ts` | Show confirmation card in chat UI before saving drafts | metric_dev |

Tool execute signature: `async (_toolCallId: string, params: any) => { content: [{type: "text", text}], details: {}, isError? }`

#### Tool Internal Processing Details

**`lookup_semantic_layer(datasource_id, query)`**:
1. `tokenize(query)` → nodejieba 中文分词 → keywords[]
2. `listMetrics(dsId).filter(m => m.status === "published")` → 搜索匹配: name/display_name 精确包含 → aliases JSON 包含 → keywords 逐词匹配
3. `listDimensions(dsId).filter(d => d.status === "published")` → name/display_name + values 枚举值 (key-value/简单数组) + keywords
4. `resolveSemanticSql()` → 返回 SQL + metric_type + available_dimensions (含 grain/enum_values) + 修改提示
5. 匹配失败 → "未找到匹配，请使用 discover_schema"

**`lookup_examples(datasource_id, query)`**:
1. `syncQueryExamplesFromHistory(dsId)` — 从 sql_query_history 同步新鲜示例
2. `tokenize(query)` → keywords
3. `listAutoQueryExamples()` → 过滤 is_verified=1 或 success_count≥3 → 排除 negative≥3 且 positive=0
4. 评分: 问题关键词 +2/词, 表名关键词 +1/词, verified +3, success_count +1~5, 执行历史成功率 +1~5, 正反馈 +1~3, 负反馈 -2*n, 错误>成功 -3
5. 取 top 3 → 返回 {question, sql, verified, execution_count}

**`discover_schema(datasource_id, table_names?, discover_domains?)`**:
1. 验证 datasource_id → discoverSchema() → INFORMATION_SCHEMA (TABLES/COLUMNS/KEY_COLUMN_USAGE)
2. `setSchemaCache()` — 填充 validator 内存缓存 (表名+列名)
3. discover_domains=true → `discoverValueDomains()` 逐表逐列 → `upsertDomainAnnotation()` 保存
4. `getAnnotations(dsId)` + `listQueryExamples(dsId)` → `formatSchemaForPrompt()` 格式化

**`execute_sql(datasource_id, sql, question?, skip_probe?, conversation_id?)`**:
1. 数据源校验 → listDatasources().filter(enabled)
2. `validateSqlAgainstSchema()`: isSelectQuery 白名单 → 表名校验 (Schema缓存+Levenshtein≤2, 阻塞) → 列名校验 (Levenshtein≤3, 警告不阻塞)
3. `checkLargeTableWithoutWhere()` — skip_probe=false 时, 无WHERE + TABLE_ROWS>100K → 警告
4. `executor.executeSql()`: getPool → SET max_execution_time=30000 → 智能 LIMIT (无LIMIT→+LIMIT 1000) → 执行
5. 结果最多向 Agent 展示 20 行 (防 token 溢出), 0行时附诊断提示
6. `createSqlQueryHistory()` — 每次执行均记录 (成功/失败)

**`read_skill(skill_name)`**: `loadAllSkills().find(name)` → `formatSkillInvocation(skill)` (SDK格式化) → 返回完整技能内容

**`validate_and_test_metric(datasource_id, sql, metric_type)`**:
1. `validateSqlViaExplain()` — EXPLAIN 语法检查
2. 执行测试 SQL (LIMIT 10) → 获取样本数据
3. 结果分析: 空值比例 (>50% 警告) + 数值范围 (负值/极大值警告)
4. 返回 {valid, errors, test_result: {row_count, sample_rows, column_types, null_ratios, warnings}}

**`check_metric_conflict(datasource_id, name, display_name?, sql?)`**:
1. `checkMetricNameConflict()` → name 重复 → error
2. `checkMetricDisplayNameConflict()` → display_name 重复 → warning
3. 返回 {has_conflict, conflicts: [{type, severity, existing_metric, suggestion}]}

**`create_metric_draft(datasource_id, name, display_name, sql, metric_type, ...)`**:
1. `checkMetricNameConflict()` → 有冲突则返回错误
2. `validateSqlViaExplain()` → SQL 语法验证失败则返回错误
3. `createMetric({ status:"draft", created_by:"agent", validation_status:"passed" })`

**`create_dimension_draft(datasource_id, name, display_name, sql_expression, data_type, ...)`**:
`createDimension({ status:"draft", created_by:"agent" })`

**`request_user_confirm(title, description?, items?, action_type?)`**:
生成 confirmId → 返回 details.confirmAction → chat-handler 检测 confirmAction → 转发 confirm_action WS 事件 → 前端 ConfirmActionCard 渲染

#### SQL Validation Pipeline (validator.ts)

`validateSqlAgainstSchema(sql, datasourceId)`:
1. `isSelectQuery()` — 仅 SELECT/SHOW/DESCRIBE/EXPLAIN, 不通过 → 阻塞
2. `extractTableNames(sql)` — 正则 `/(?:FROM|JOIN)\s+\`?(\w+)\`?/gi` → 表名 vs Schema 缓存 → Levenshtein≤2 → 拼写建议 → 不存在则阻塞
3. `extractColumnReferences(sql)` — 正则 `/\b(\w+)\.(\w+)\b/g` → 跳过 SQL 关键字和聚合函数 → vs Schema 列缓存 → Levenshtein≤3 → 警告 (不阻塞)

`checkLargeTableWithoutWhere(datasourceId, sql)`:
正则检测 WHERE → 无 WHERE + INFORMATION_SCHEMA.TABLES.TABLE_ROWS > 100K → 警告

#### SQL Execution (executor.ts)

`executeSql(datasourceId, sql, { timeout?, rowLimit? })`:
1. getPool → getConnection
2. SET SESSION max_execution_time = timeout (默认 30000)
3. 智能 LIMIT: strip 注释/分号 → 无 LIMIT → 追加 LIMIT rowLimit (默认 1000)
4. conn.query → 返回 {columns, rows, rowCount, executionTime}

`validateSqlViaExplain(datasourceId, sql)`:
EXPLAIN + sql → 成功 {valid:true} / 失败 {valid:false, error}

### Chinese Tokenization (tokenizer.ts)

`tools/tokenizer.ts` uses `nodejieba` for Chinese word segmentation. It's used by `lookup-semantic-layer.ts` and `lookup-examples.ts` to tokenize user queries for keyword matching. Non-Chinese text falls back to whitespace splitting. Lazy-loads the jieba dictionary on first call.

### AI Model Calling Pattern

The pi-ai `Model` type only contains config fields (id, name, provider, cost, contextWindow) — it does NOT have call methods like `sendMessage`. Actual LLM interaction goes through:

1. **AgentHarness** (pi-agent-core) — for multi-turn agent conversations with tool use
2. **Direct `fetch()`** — for single-shot AI calls (e.g., `generate-sql` in scheduled.ts, `ai-suggest-semantic` in semantic.ts)

When using direct fetch, read the API key from `process.env.ANTHROPIC_API_KEY` or `process.env.DEEPSEEK_API_KEY` and call the provider's HTTP API directly.

### WebSocket Protocol

**Client → Server:**
- `{ type: "init", payload: { conversationId, datasourceId, agentType, ... } }` — Initialize harness (agentType routes to correct agent)
- `{ type: "message", text, payload: { conversationId } }` — Send user message
- `{ type: "reset_context", payload: { conversationId, ... } }` — Reset conversation context

**Server → Client:**
- `connected`, `init_success`, `agent_start`, `thinking`, `message_start`
- `text_delta`, `tool_execution_start/end`, `tool_result`
- `confirm_action` — confirmation card data (from `request_user_confirm` tool)
- `message_history` — persisted message history sent on init
- `agent_end`, `settled`, `response_complete`, `error`

### Frontend State

Zustand store (`stores/app.ts`) tracks: `view` (default: `"dashboard"`), `selectedDatasourceId`, `selectedDatasourceName`, `selectedConversationId`, `selectedMetricId`, `modelProvider`, `modelId`, `onboardingCompleted`, `activeChannel` (default: `"query"`), `channelSessions` (per-agent session tracking).

AppView type: `"dashboard" | "chat" | "datasources" | "schemas" | "metrics" | "analysis" | "dictionary" | "queryHistory" | "querySkills" | "insights"`

## Code Patterns

### Server (ESM, `.js` imports)

- All imports use `.js` extension (ESM requirement — `"type": "module"` in package.json)
- Store functions are synchronous (better-sqlite3) except password encryption
- Agent tools: factory function pattern returning `{ name, description, label, parameters, execute }`
- Agent registration: `AgentRegistry` pattern — register tools into pool, register agents with tool set IDs
- Route files: export either a Hono instance directly (`export default app`) or a factory function (`export function createXxxRoutes(): Hono`)
- DB init: `initTables()` handles migrations by checking column existence with `PRAGMA table_info()`
- SQL validation pipeline: `validator.ts` checks SQL whitelist → schema cache (table names) → sends to `executor.ts`
- MySQL interactions go through `mysql/pool.ts` (connection pooling) → `mysql/executor.ts` (query execution) or `mysql/discovery.ts` (schema introspection)
- `executor.ts` exposes `validateSqlViaExplain()` for metric SQL validation before creating drafts

### Frontend

- CSS variables for theming: `--hairline`, `--surface`, `--steel`, `--ink`, `--primary`, `--canvas`, `--slate`, `--primary-soft`, `--success`, `--warning`, `--error`, `--accent-100` through `--accent-700` (accent scale), `--highlight`, `--highlight-soft`, `--surface-raised`, `--surface-code`, `--info`, `--info-soft`, `--sidebar-bg`, `--sidebar-hover`, `--sidebar-active`
- Tailwind classes for layout + CSS variables for colors
- API client (`api/client.ts`): generic `request<T>(path, options?)` wrapper, all API methods return typed promises
- New pages follow the pattern: split layout (list on left, detail/form on right), `sunset-stripe` accent bar on top
- Vite dev server proxies `/api` → `:3000` and `/ws` → `ws://localhost:3000`
- Multi-agent chat UI: `ChannelTabs` at top of chat, `AgentWelcome` when no messages, `ConfirmActionCard` for draft confirmations
- Chat cards: `MetricCard`, `DimensionCard`, `ValidationResult` render structured tool outputs inline in chat

## Environment Variables

See `.env.example`:
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — LLM API keys (pi-ai auto-reads from env)
- `DEEPSEEK_API_KEY` — Used for direct fetch calls (ai-suggest-semantic, generate-sql, etc.)
- `DATANOVA_ENCRYPTION_KEY` — 32-byte key for datasource password encryption
- `DATANOVA_DIR` — Data directory (default: `./data`)
- `PORT` — Server port (default: `3000`)
- `DATANOVA_PROVIDER` / `DATANOVA_MODEL` — Default LLM provider/model

## Security Constraints

- `execute_sql` only allows SELECT/SHOW/DESCRIBE/EXPLAIN
- 30-second query timeout, max 1000 rows
- Datasource passwords encrypted with AES-256-GCM
- SQL validation via `validator.ts` before execution (whitelist, schema cache, table name validation)

## Important Notes

- **Single WebSocket connection**: All conversations share one WS connection; switch via `init` message with `agentType` parameter
- **Optimistic UI**: User messages appear immediately without server confirmation
- **InMemorySessionRepo**: Agent conversation context lives in memory — lost on restart. Messages themselves are persisted to SQLite via `saveMessage()`/`listMessages()`.
- **Schema cache**: Populated by `discover_schema` tool, used by `validator.ts` for SQL validation
- **Semantic layer SQL**: Deterministically built via `buildSemanticSql()` in `semantic-sql-builder.ts` — more reliable than LLM-generated SQL
- **execute_sql records history**: Every SQL execution (success or error) is automatically saved to `sql_query_history` table
- **Scheduler runs on startup**: `startScheduler()` in index.ts registers cron jobs for enabled scheduled queries
- **All UI text is Chinese**: The frontend uses Simplified Chinese throughout — new text should follow this convention
- **New routes use factory pattern**: `createSemanticRoutes()`, `createScheduledRoutes()`, `createDictionaryRoutes()`, `createInsightsRoutes()`, `createBookmarkRoutes()`, `createQuerySkillRoutes()` return Hono instances registered at `"/"` root
- **Insights page**: Available as an AppView (`"insights"`) but has no sidebar nav entry — accessible programmatically only
- **AnalysisPage integrates scheduled query functionality**: The separate `ScheduledPage.tsx` exists but is not rendered in `App.tsx`
- **Design docs in `docs/`**: Contains architecture docs, design specs, and optimization plans (e.g., `docs/superpowers/specs/` for feature specs, `docs/analysis/` for optimization analysis)
- **Multi-Agent framework**: `AgentRegistry` manages agent definitions and tool pools. `initAgentFramework()` is called at startup. New agents are registered in `agent-registration.ts`.
- **Metric Dev Agent workflow** (10步, 含所有内部处理细节):
  1. `check_metric_conflict(dsId, name, display_name?)` — `checkMetricNameConflict()` (SELECT WHERE name=?) → 同名→error; `checkMetricDisplayNameConflict()` (SELECT WHERE display_name=?) → 同显示名→warning; deprecated指标建议覆盖
  2. `discover_schema(dsId, table_names?)` — INFORMATION_SCHEMA → setSchemaCache → discoverValueDomains → formatSchemaForPrompt
  3. `lookup_semantic_layer(dsId, query)` — tokenize(jieba) → 搜published指标/维度 → resolveSemanticSql()
  4. `read_skill(skill_name)` + `lookup_examples(dsId, query)` — 加载qs-*技能完整内容 + top3历史示例(7因子评分)
  5. LLM生成SQL (遵循SQL质量标准: AS别名/GROUP BY/DATE_FORMAT/NULLIF/大表时间限制)
  6. `validate_and_test_metric(dsId, sql, metric_type)` — ①`validateSqlViaExplain()` (EXPLAIN语法检查) → ②`executeSql(LIMIT 10)` (样本数据) → ③结果分析 (0行检测/空值比例>50%警告/负值警告/极大值>1e12警告)
  7. 验证失败 → LLM分析原因 → 修正SQL → 重试步骤6 (最多3次)
  8. `request_user_confirm(title, items, action_type:"save_draft")` → 生成confirmId → details.confirmAction → chat-handler检测 → WS confirm_action事件 → 前端ConfirmActionCard渲染 → 用户[确认保存]/[取消]
  9. 用户确认后自动保存: `create_metric_draft` (冲突检查→EXPLAIN验证→createMetric({status:"draft",created_by:"agent",validation_status:"passed"})) / `create_dimension_draft` (createDimension({status:"draft",created_by:"agent"}))
  10. 通知用户 → MetricCard + DimensionCard + ValidationResult → "请前往指标管理页面审核并发布"
- **Metric lifecycle extended**: `draft` → `published` → `deprecated`. New columns: `created_by` (manual/agent/ai_suggest), `agent_session_id`, `validation_status` (unvalidated/passed/failed), `validation_result`.
- **Dimension lifecycle extended**: Same `draft` → `published` → `deprecated`. New columns: `created_by`, `agent_session_id`.
- **Chinese tokenization**: `tokenizer.ts` (nodejieba) provides `tokenize()` function used by `lookup-semantic-layer` and `lookup-examples` for Chinese word segmentation
- **Query Skills module**: Replaces the old Business Knowledge module. Query skills are actionable query strategies (not business explanations) that help the Agent handle complex queries the semantic layer can't directly answer. Each skill generates a `qs-{skillId}/SKILL.md` file under `data/skills/`. The Agent's priority chain is: `lookup_semantic_layer` → check `qs-*` skills → `lookup_examples` → `discover_schema`.
- **Query Skills JSON fields**: `trigger_keywords` and `core_tables` are stored as JSON strings in SQLite. The route layer (`query-skills.ts`) handles `JSON.stringify` for arrays/objects coming from the frontend. AI-generated data may return `query_steps`, `caveats`, `common_issues` as arrays — `SkillForm` and `AIGenerateDialog` coerce these to strings via `Array.isArray()` checks.
- **Query Skills form initialization**: `SkillForm` uses `useState(buildInitialForm)` instead of `useEffect` to avoid the `onClearInitialData` → re-render → form reset bug. The parent `QuerySkillsPage` uses a `formKey` counter to force remount when switching between skills or AI-generated data.
