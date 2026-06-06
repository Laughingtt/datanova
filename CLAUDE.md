# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DataNova is an AI-powered SQL data query assistant. Users interact via natural language chat; an Agent discovers database schemas, generates and executes SQL queries, and displays results in tables.

## Tech Stack

- **Monorepo**: npm workspaces (`packages/server`, `packages/web`)
- **Backend**: Hono + Node.js, better-sqlite3 (metadata), mysql2 (user queries)
- **Frontend**: React 19 + Vite 6 + TailwindCSS 3 + Zustand 5 + TanStack Table
- **AI**: @earendil-works/pi-agent-core (AgentHarness), @earendil-works/pi-ai (multi-provider LLM)
- **Encryption**: AES-256-GCM (datasource passwords)

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
| `packages/server/src/agent/skill-manager.ts` | Skill file loading from `data/skills/` |
| `packages/server/src/store.ts` | SQLite CRUD (datasources, conversations, annotations, semantic layer, scheduled queries) |
| `packages/server/src/index.ts` | Hono app entry, route registration, WebSocket endpoint |
| `packages/web/src/components/Chat/ChatWindow.tsx` | Main chat orchestrator, message state, WS event handling |
| `packages/web/src/hooks/useAgentStream.ts` | Agent stream processing, processWsEvent, ChatMessage types |
| `packages/web/src/hooks/useWebSocket.ts` | WebSocket connection management, auto-reconnect |

### Agent Tools

Registered in `harness-factory.ts`:

- `discover_schema` — Query INFORMATION_SCHEMA for table/column/foreign key metadata
- `execute_sql` — Execute SELECT queries with validation (30s timeout, 1000 row limit)
- `ai_annotate_schema` — Generate business annotations from schema + sample data
- `lookup_semantic_layer` — Search semantic metrics/dimensions by keyword, return deterministic SQL
- `lookup_examples` — Search past successful queries for few-shot examples
- `ai_suggest_semantic_layer` — Analyze schema and recommend metrics/dimensions/models

### SQLite Schema (Key Tables)

- `datasources` — MySQL connection config (encrypted password)
- `conversations` / `messages` — Chat history
- `schema_annotations` — Table/column business descriptions (with `status`, `domain_type`, `domain_values`)
- `table_query_examples` — Verified query examples per table
- `query_examples` — Auto-saved successful queries from conversations
- `query_feedback` — User feedback (👍👎) on query results
- `semantic_metrics` / `semantic_dimensions` / `semantic_models` — Semantic layer definitions
- `scheduled_queries` / `query_alerts` / `query_execution_history` — Cron-based scheduled queries

### REST API Routes

Registered in `packages/server/src/index.ts` via `app.route()`:

- `/api/datasources` — Datasource CRUD + test connection
- `/api/schemas` — Schema discovery + annotations + query examples + AI annotate
- `/api/datasources/:dsId/metrics` — Semantic metrics CRUD + test
- `/api/datasources/:dsId/dimensions` — Semantic dimensions CRUD
- `/api/datasources/:dsId/models` — Semantic models CRUD
- `/api/datasources/:dsId/scheduled-queries` — Scheduled query CRUD + execute
- `/api/datasources/:dsId/query-alerts` — Alert listing
- `/api/datasources/:dsId/dictionary/search` — Data dictionary search
- `/api/conversations` — Conversation CRUD
- `/api/conversations/:convId/messages/:msgId/feedback` — Query result feedback
- `/api/skills` — Skill listing
- `/api/models` — Available LLM providers/models
- `/api/health` — Health check

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
App.tsx (view switcher: chat | datasources | schemas | metrics | scheduled | dictionary)
  └── Layout.tsx
        ├── Sidebar.tsx (navigation)
        └── Chat/
              ├── ChatWindow.tsx (orchestrator)
              │     ├── ChatInput.tsx
              │     └── MessageList.tsx
              │           └── MessageItem.tsx
              │                 ├── StepIndicator
              │                 ├── ResultSummaryCard (derived from content)
              │                 ├── ValidationBanner
              │                 ├── SqlBlock
              │                 ├── TableResult (trend + anomaly)
              │                 ├── AttributionView
              │                 └── FeedbackButtons
              └── DatasourceSelector / ModelSelector
        └── Schema/SchemaPage.tsx (or SchemaEnhancement)
        └── Metrics/MetricsPage.tsx
        └── Scheduled/ScheduledPage.tsx
        └── Dictionary/DictionaryPage.tsx
```

## Code Patterns

### Server (ESM, `.js` imports)

- All imports use `.js` extension (ESM requirement)
- Store functions are synchronous (better-sqlite3) except password encryption
- Agent tools: factory function returning `{ name, description, label, parameters, execute }`
- Tool execute signature: `async (_toolCallId: string, params: any) => { content: [{type: "text", text}], details: {}, isError? }`

### Frontend

- CSS variables: `--hairline`, `--surface`, `--steel`, `--ink`, `--primary`, `--canvas`, `--slate`
- Tailwind classes for layout, CSS variables for theming
- Zustand store: `stores/app.ts` — view, selectedDatasourceId, selectedConversationId, modelProvider/modelId
- API client: `api/client.ts` — generic `request<T>()` wrapper with fetch

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
