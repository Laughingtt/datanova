# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DataNova is an AI-powered SQL data query assistant. Users interact via natural language chat; an Agent discovers database schemas, generates and executes SQL queries, and displays results in tables. The UI is fully in Simplified Chinese.

## Tech Stack

- **Monorepo**: npm workspaces (`packages/server`, `packages/web`)
- **Backend**: Hono + Node.js, better-sqlite3 (metadata), mysql2 (user queries)
- **Frontend**: React 19 + Vite 6 + TailwindCSS 3 + Zustand 5 + TanStack Table
- **AI**: @earendil-works/pi-agent-core (AgentHarness), @earendil-works/pi-ai (multi-provider LLM config — NOT a callable client)
- **Encryption**: AES-256-GCM (datasource passwords)
- **E2E**: Playwright (`@playwright/test`)

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

# E2E tests (requires server running on :3000)
npx playwright test
```

## Architecture

### Data Flow (Hot Path)

```
ChatInput → ChatWindow.handleSend() → optimistic UI update
  ↓
useAgentStream.sendMessage() → useWebSocket.send({ type:"message" })
  ↓
Vite Proxy /ws → ws://localhost:3000/ws/chat
  ↓
chat-handler.ts → harnessMap.get(conversationId) → harness.prompt(text)
  ↓
AgentHarness → LLM API (multi-turn tool calls: discover_schema / execute_sql)
  ↓
forwardEvent(ws, event) → WebSocket → processWsEvent() → React re-render
```

### Key Files

| File | Responsibility |
|---|---|
| `packages/server/src/ws/chat-handler.ts` | WebSocket event handling, harness lifecycle, event forwarding |
| `packages/server/src/agent/harness-factory.ts` | AgentHarness creation, tool registration, system prompt assembly |
| `packages/server/src/agent/prompt-builder.ts` | System prompt construction with datasource/skills context |
| `packages/server/src/store.ts` | SQLite CRUD — all tables: datasources, conversations, annotations, semantic layer, scheduled queries, query history |
| `packages/server/src/index.ts` | Hono app entry, route registration, WebSocket endpoint |
| `packages/server/src/scheduler.ts` | Cron scheduler for scheduled query execution with alert conditions |
| `packages/web/src/components/Chat/ChatWindow.tsx` | Main chat orchestrator, message state, WS event handling |
| `packages/web/src/hooks/useAgentStream.ts` | Agent stream processing, processWsEvent, ChatMessage types |
| `packages/web/src/hooks/useWebSocket.ts` | WebSocket connection management, auto-reconnect |

### Route Registration Pattern

Routes are registered in `index.ts` using two patterns:
- **Direct routes**: `app.route("/api/datasources", datasourcesRoutes)` — prefix-based
- **Factory routes**: `app.route("/", createSemanticRoutes())` — factory functions return Hono instances with full paths

Factory routes (semantic, scheduled, dictionary) define their own `/api/...` paths internally rather than receiving a prefix.

### Agent Tools

Registered in `harness-factory.ts`, each is a factory function returning `{ name, description, label, parameters, execute }`:

| Tool | File | Purpose |
|---|---|---|
| `discover_schema` | `tools/discover-schema.ts` | Query INFORMATION_SCHEMA for table/column/FK metadata |
| `execute_sql` | `tools/execute-sql.ts` | Execute SELECT queries with validation (30s timeout, 1000 row limit). Records EVERY execution to `sql_query_history`. |
| `ai_annotate_schema` | `tools/ai-annotate-schema.ts` | Generate business annotations from schema + sample data |
| `lookup_semantic_layer` | `tools/lookup-semantic-layer.ts` | Search semantic metrics/dimensions by keyword, return deterministic SQL |
| `lookup_examples` | `tools/lookup-examples.ts` | Search past successful queries for few-shot examples |
| `ai_suggest_semantic_layer` | `tools/ai-suggest-semantic.ts` | Analyze schema and recommend metrics/dimensions/models |

Tool execute signature: `async (_toolCallId: string, params: any) => { content: [{type: "text", text}], details: {}, isError? }`

The `execute_sql` tool includes an optional `question` param (used for query history recording) and a `skip_probe` param (for semantic layer queries).

### SQLite Schema (Key Tables)

- `datasources` — MySQL connection config (encrypted password)
- `conversations` / `messages` — Chat history
- `schema_annotations` — Table/column business descriptions (`status`: draft/confirmed, `domain_type`, `domain_values`)
- `table_query_examples` — Verified query examples per table
- `query_examples` — Auto-saved successful queries from conversations
- `query_feedback` — User feedback (👍👎) on query results
- `semantic_metrics` / `semantic_dimensions` / `semantic_models` — Semantic layer definitions
- `scheduled_queries` / `query_alerts` / `query_execution_history` — Cron-based scheduled queries
- `sql_query_history` — **All executed SQL queries** (datasource, question, SQL, timing, row count, status, error message)
- `app_config` — Key-value app configuration (schema version, etc.)

### REST API Routes

**Datasources & Schema:**
- `/api/datasources` — CRUD + `POST /:id/test`
- `/api/schemas` — Schema discovery + annotations + query examples + `POST /:dsId/ai-annotate` + `GET /:dsId/browse`
- `/api/datasources/:dsId/query-history` — SQL query history per datasource
- `/api/query-history` — All query history

**Semantic Layer:**
- `/api/datasources/:dsId/metrics` — CRUD + `POST /:id/test`
- `/api/datasources/:dsId/dimensions` — CRUD
- `/api/datasources/:dsId/models` — CRUD
- `/api/datasources/:dsId/ai-suggest-semantic` — AI suggest (calls DeepSeek API, creates metrics/dimensions/models)

**Scheduled Queries:**
- `/api/datasources/:dsId/scheduled-queries` — CRUD + `POST /:id/execute` + `GET /:id/history`
- `/api/datasources/:dsId/scheduled-queries/generate-sql` — AI SQL generation (calls Anthropic API via fetch)
- `/api/datasources/:dsId/query-alerts` — Alert listing

**Dictionary & General:**
- `/api/datasources/:dsId/dictionary/search` + `/tables/:tableName` + `/recent-changes`
- `/api/conversations` — CRUD + `POST /:convId/messages/:msgId/feedback`
- `/api/skills` — Skill listing + CRUD
- `/api/models` — Available LLM providers/models
- `/api/health` — Health check

### AI Model Calling Pattern

The pi-ai `Model` type only contains config fields (id, name, provider, cost, contextWindow) — it does NOT have call methods like `sendMessage`. Actual LLM interaction goes through:

1. **AgentHarness** (pi-agent-core) — for multi-turn agent conversations with tool use
2. **Direct `fetch()`** — for single-shot AI calls (e.g., `generate-sql` in scheduled.ts, `ai-suggest-semantic` in semantic.ts)

When using direct fetch, read the API key from `process.env.ANTHROPIC_API_KEY` or `process.env.DEEPSEEK_API_KEY` and call the provider's HTTP API directly.

### WebSocket Protocol

**Client → Server:**
- `{ type: "init", payload: { conversationId, datasourceId, ... } }` — Initialize harness
- `{ type: "message", text, payload: { conversationId } }` — Send user message
- `{ type: "reset_context", payload: { conversationId, ... } }` — Reset conversation context

**Server → Client:**
- `connected`, `init_success`, `agent_start`, `thinking`, `message_start`
- `text_delta`, `tool_execution_start/end`, `tool_result`
- `agent_end`, `settled`, `response_complete`, `error`

### Frontend Component Hierarchy

```
App.tsx (view switcher: chat|datasources|schemas|metrics|scheduled|dictionary|queryHistory)
  ├── OnboardingWizard (shown when !onboardingCompleted && selectedDatasourceId)
  └── Layout.tsx
        ├── Sidebar.tsx (7 nav items, all Chinese)
        └── View pages:
              Chat/ChatWindow.tsx → ChatInput, MessageList → MessageItem
                  (SqlBlock, TableResult, StepIndicator, AttributionView, FeedbackButtons)
              Datasource/DatasourcePage.tsx → DatasourceList, DatasourceForm
              Schema/SchemaPage.tsx → SchemaTree, SchemaEnhancement
                  (AIAnnotationProgress, AIAnnotationReview, QueryExampleForm, SchemaPromptPreview)
              Metrics/MetricsPage.tsx → MetricForm, DimensionForm, ModelForm
                  (TableColumnPicker, VisualFilterBuilder)
              Scheduled/ScheduledPage.tsx → ScheduledForm, AlertConfig
              Dictionary/DictionaryPage.tsx → BrowseTree, RelationshipDiagram, EntryDetail
              History/QueryHistoryPage.tsx
              Onboarding/OnboardingWizard.tsx → WizardStep
```

Zustand store (`stores/app.ts`) tracks: `view`, `selectedDatasourceId`, `selectedConversationId`, `modelProvider`, `modelId`, `onboardingCompleted`.

AppView type: `"chat" | "datasources" | "schemas" | "metrics" | "scheduled" | "dictionary" | "queryHistory"`

## Code Patterns

### Server (ESM, `.js` imports)

- All imports use `.js` extension (ESM requirement)
- Store functions are synchronous (better-sqlite3) except password encryption
- Agent tools: factory function pattern returning `{ name, description, label, parameters, execute }`
- Route files: export either a Hono instance directly (`export default app`) or a factory function (`export function createXxxRoutes(): Hono`)
- DB init: `initTables()` handles migrations by checking column existence with `PRAGMA table_info()`

### Frontend

- CSS variables for theming: `--hairline`, `--surface`, `--steel`, `--ink`, `--primary`, `--canvas`, `--slate`, `--primary-soft`, `--success`, `--warning`, `--error`
- Tailwind classes for layout + CSS variables for colors
- API client (`api/client.ts`): generic `request<T>(path, options?)` wrapper, all API methods return typed promises
- New pages follow the pattern: split layout (list on left, detail/form on right), `sunset-stripe` accent bar on top

## Environment Variables

See `.env.example`:
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` — LLM API keys
- `DATANOVA_ENCRYPTION_KEY` — 32-byte key for datasource password encryption
- `DATANOVA_DIR` — Data directory (default: `./data`)
- `PORT` — Server port (default: `3000`)
- `DATANOVA_PROVIDER` / `DATANOVA_MODEL` — Default LLM provider/model

## Security Constraints

- `execute_sql` only allows SELECT/SHOW/DESCRIBE/EXPLAIN
- 30-second query timeout, max 1000 rows
- Datasource passwords encrypted with AES-256-GCM
- SQL validation via `validator.ts` before execution (schema cache, table name validation)

## Important Notes

- **Single WebSocket connection**: All conversations share one WS connection; switch via `init` message
- **Optimistic UI**: User messages appear immediately without server confirmation
- **InMemorySessionRepo**: Conversation context lives in memory — lost on restart
- **Schema cache**: Populated by `discover_schema` tool, used by `validator.ts` for SQL validation
- **Semantic layer SQL**: Deterministically built via `buildSemanticSql()` — more reliable than LLM-generated SQL
- **execute_sql records history**: Every SQL execution (success or error) is automatically saved to `sql_query_history` table
- **Scheduler runs on startup**: `startScheduler()` in index.ts registers cron jobs for enabled scheduled queries
- **All UI text is Chinese**: The frontend uses Simplified Chinese throughout — new text should follow this convention
- **New routes use factory pattern**: `createSemanticRoutes()`, `createScheduledRoutes()`, `createDictionaryRoutes()` return Hono instances registered at `"/"` root
