# Review Fix Addendum — Data Agent Phase 1-4

> Applies to: plans in `docs/superpowers/plans/2026-06-06-data-agent-phase*.md`  
> Based on: architecture reviews in `docs/superpowers/specs/2026-06-06-phase*-architecture-review.md`

---

## Pre-Phase 1: Foundation Fixes (1-2 days)

### F0.1: AgentTool Signature Template
All new tools MUST use this signature (from existing discover-schema.ts/execute-sql.ts):
```
execute: async (_toolCallId: string, params: any) => {
  const typedParams = params as XxxParams;
  try { ... } catch (err) {
    return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], details: {}, isError: true };
  }
  return { content: [{ type: "text" as const, text: result }], details: { ... } };
}
```
**Applies to**: P1 Task 4 (ai_annotate_schema), P2 Task 3 (lookup_semantic_layer, lookup_examples, ai_suggest_semantic), P4 Task 1

### F0.2: Migration Versioning
In `store.ts initTables()`, add at the end:
```typescript
// Track schema version for migration management
const currentVersion = getConfig("schema_version");
if (!currentVersion) setConfig("schema_version", "1");
```
Each Phase that adds tables should increment: P1→"2", P2→"3", P4→"4".

### F0.3: API Route Convention
Schema-related endpoints go under `/api/schemas/:dsId/...` (existing schemasRoutes).
Datasource management stays under `/api/datasources/...`.
Conversations stay under `/api/conversations/...`.

---

## Phase 1 Fixes

### P1-C1: AI Annotation Tool Must Be Self-Contained
**Location**: Task 4, Step 1 (ai-annotate-schema.ts)  
**Problem**: Tool returns prompt asking Agent to call `save_annotations` — but that tool doesn't exist.  
**Fix**: Make `ai_annotate_schema` self-contained. Inside execute(), after getting DDL+samples, call the LLM directly (via pi-ai `streamSimple`), parse the structured JSON response, save as draft annotations via `upsertAnnotation({status: "draft"})`, and return a summary of saved drafts. No callback needed.

### P1-C2: Executor.ts LIMIT Fix
**Location**: Task 5 affects executor.ts  
**Problem**: `sql + " LIMIT 1000"` breaks on `SELECT * FROM orders; -- comment`  
**Fix**: Before appending LIMIT, strip trailing comments and semicolons:
```typescript
let cleanSql = sql.trim().replace(/;?\s*(--.*)?$/, '');
if (!/\bLIMIT\s+\d+/i.test(cleanSql)) cleanSql += ` LIMIT ${rowLimit}`;
```
Also: call `isSelectQuery()` BEFORE this LIMIT logic, reject early.

### P1-C3: Integrate generateAnnotationSkill()
**Location**: After Task 1 (confirmAnnotation) and Task 2 (upsertDomainAnnotation)  
**Fix**: After every annotation write/confirm/delete, call:
```typescript
import { generateAnnotationSkill } from "../agent/skill-manager.js";
const ds = getDatasource(datasourceId);
if (ds) await generateAnnotationSkill(datasourceId, ds.name);
// Refresh active harnesses
import { refreshHarnessSkills } from "../agent/harness-factory.js";
// Iterate harnessMap to find matching conversations (requires exporting a helper)
```
Add a `refreshHarnessesForDatasource(datasourceId)` helper to harness-factory.ts.

### P1-C4: formatSchemaForPrompt Refactor
**Location**: Task 2 Step 3, Task 3 Step 6  
**Change signature** from:
`formatSchemaForPrompt(schema: SchemaInfo, annotationMap: Map<string, string>)`
to:
`formatSchemaForPrompt(schema: SchemaInfo, annotations: SchemaAnnotation[])`  
Build the map internally from typed annotations, extracting domain_type/domain_values directly. No `__domain_type` special keys.

### P1-C5: Value Domain Discovery Opt-In
**Location**: Task 2  
**Fix**: Add `discover_domains` boolean parameter to `discover_schema` tool (default false). Only run `discoverValueDomains()` when true. Avoids blocking schema discovery on large databases.

### P1-C6: skip_probe Parameter
**Location**: Task 5  
**Fix**: Add `skip_probe: boolean` parameter to `execute_sql` tool. When true, skip probe execution. System prompt instructs: "For semantic layer queries (marked with `/* source: semantic_layer */`), set skip_probe to true."

### P1-C7: Validation Events in chat-handler.ts
**Location**: Task 5 Step 6  
**Fix**: Add `validation_warning` and `validation_error` to `forwardEvent()` switch in chat-handler.ts. These are new event types emitted by execute-sql tool.

### P1-C8: Frontend summarySections/validationStatus
**Location**: Task 6, Task 7  
**Fix**: Don't store in ChatMessage state. Instead, derive on render:
- `ResultSummaryCard` calls `parseSummarySections(message.content)` directly
- `ValidationBanner` reads from `message.validationStatus` (this one IS in state since it comes from WS events)
- Remove `summarySections` from ChatMessage interface

### P1-C9: conversationId for FeedbackButtons
**Location**: Task 7 Step 4  
**Fix**: Add `conversationId` prop chain: ChatWindow → MessageList → MessageItem → FeedbackButtons.

---

## Phase 2 Fixes

### P2-C0: NEW TASK — buildSemanticSql() [CRITICAL]
**New file**: `packages/server/src/agent/semantic-sql-builder.ts`  
**Purpose**: Deterministically build SQL from metric + dimensions + model data.  
**This is the most important code in the entire project.** Without it, the semantic layer cannot deliver 100% accuracy.

```typescript
export function buildSemanticSql(options: {
  metric: { sql_expression: string; name: string; filters: string };
  dimensions: Array<{ sql_expression: string; name: string }>;
  model: { base_table: string; joins: string };
  userFilters?: Array<{ column: string; operator: string; value: string }>;
}): string {
  // 1. Build SELECT: metric.sql_expression AS name, dim.sql_expression AS name...
  // 2. Build FROM: model.base_table
  // 3. Build JOINs from model.joins JSON
  // 4. Build WHERE: metric.filters + userFilters
  // 5. Build GROUP BY: dimension sql_expressions
  // Prefix with /* source: semantic_layer */
}
```

Integrate into `lookup_semantic_layer` tool: when metrics match, call `buildSemanticSql()` and include `generated_sql` in the return value. System prompt: "If lookup_semantic_layer returns generated_sql, execute it directly."

### P2-C1: Move testMetric Out of store.ts
**Location**: Task 1 Step 4  
**Fix**: Create `packages/server/src/agent/semantic-test.ts` for testMetric(). Import store + mysql/executor there. Keep store.ts as pure SQLite.

### P2-C2: Fix ai_suggest_semantic Tool
**Location**: Task 3 Step 3  
**Fix**: Same as P1-C1 — make self-contained. Call LLM directly, parse response, save as draft metrics/dimensions/models. No callback needed.

### P2-C3: Improve Keyword Matching
**Location**: Task 3 Step 1 (lookup_semantic_layer)  
**Fix**: Split query by whitespace AND by Chinese characters. Check aliases, display_name, AND dimension values. Score partial matches higher than substring matches.

### P2-C4: Few-Shot Injection Filter
**Location**: Task 3 Step 2 (lookup_examples)  
**Fix**: Only return examples where `is_verified === 1 OR success_count >= 3`. Prevents garbage examples from polluting Few-Shot.

### P2-C5: Extend generateAnnotationSkill for Semantic Layer
**Location**: New, after Task 4  
**Fix**: Create `generateSemanticSkill(datasourceId, datasourceName)` that generates a SKILL.md including metric definitions and dimension info. Call it when metrics/dimensions change, and refresh harness skills.

### P2-C6: Break Task 4 into Sub-Tasks
Task 4a: MetricForm + DimensionForm + ModelForm  
Task 4b: MetricsPage layout + list  
Task 4c: AI suggest + test metric  
Task 4d: QueryExamplesSection integration

### P2-C7: Frontend Routing
Continue with Zustand `view` field. Add `"metrics"` to AppView type. Add nav item to Layout.tsx. No React Router.

---

## Phase 3 Fixes

### P3-C1: Attribution Depends on buildSemanticSql()
Add note: attribution decomposition queries (break down by each dimension) should use `buildSemanticSql()` from P2 to generate deterministic GROUP BY swaps. Without it, each decomposition query is LLM-generated (less reliable).

### P3-C2: AttributionView Chart
CSS-based horizontal bar chart is acceptable for P3. Add note that recharts can replace it later if needed.

### P3-C3: Dimension Hierarchies Required
Add note: attribution effectiveness depends on having dimension hierarchies defined in the semantic layer. Without them, the Agent must infer hierarchies from schema (less reliable).

---

## Phase 4 Fixes

### P4-C1: Fix scheduler.ts ESM Issue [BLOCKING]
**Location**: Task 1 Step 4 (scheduler.ts)  
**Fix**: Replace `require("./store.js")` with proper `import` at top of file. Project uses ESM.

### P4-C2: Alert Notification — Use Polling for MVP
**Location**: After Task 2  
**Fix**: Instead of WebSocket broadcast (which doesn't exist):
- Frontend polls `GET /api/datasources/:dsId/query-alerts?since=<timestamp>` every 30s
- Add `since` query parameter to listAlerts endpoint
- Display new alerts as a notification banner in ChatWindow

### P4-C3: Add Execution History Table
**Location**: Task 1 (storage)  
**Fix**: Add `query_execution_history` table alongside `scheduled_queries`:
```sql
CREATE TABLE IF NOT EXISTS query_execution_history (
  id TEXT PRIMARY KEY,
  scheduled_query_id TEXT NOT NULL,
  executed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success', 'error')),
  result_summary TEXT,
  execution_time_ms INTEGER,
  row_count INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scheduled_query_id) REFERENCES scheduled_queries(id) ON DELETE CASCADE
);
```
Insert after each execution. Add REST API `GET /api/datasources/:dsId/scheduled-queries/:id/history`. Update ExecutionHistory component.

### P4-C4: Defer Report Template Customization
Mark Task 5 as **deferred**. Keep default 6-section report structure. Add note: "Template customization deferred to Phase 5 to keep scope manageable."

### P4-C5: Data Dictionary Search Without Annotations
**Location**: Task 4 Step 1  
**Fix**: When no annotation matches for tables, also search schema directly (cache in SQLite or call discoverSchema). Tables should be findable by name even without annotations.

### P4-C6: Graceful Shutdown for Scheduler
**Location**: Task 1 Step 4  
**Fix**: Add AbortController for in-flight executions. In `stopScheduler()`, signal abort and wait for completion before clearing tasks.
