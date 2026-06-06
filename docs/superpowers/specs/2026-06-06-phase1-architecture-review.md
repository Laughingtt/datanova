# Phase 1 Architecture Review: Schema Enhancement + AI Annotation + SQL Validation + Result Summary

> Reviewer: Architecture review against actual codebase  
> Date: 2026-06-06  
> Status: 🔴 Critical issues found — must fix before implementation

---

## Executive Summary

Phase 1 的计划方向正确，spec 覆盖率高，但与现有代码库存在 **7 个关键对齐问题** 和 **5 个架构风险**。最严重的问题是：Agent 工具接口不匹配（plan 使用的签名与 pi-agent-core 的 AgentTool 完全不同）、SQL 注入风险（validator 中直接拼接表名）、以及缺少对现有 annotation skill 自动生成机制的集成。建议修复所有 🔴 Critical 问题后再开始实施。

---

## 1. Spec Coverage Analysis

| Spec Requirement | Plan Coverage | Status |
|---|---|---|
| Column value domain discovery | Task 2 | ✅ Complete |
| Enhanced schema prompt with value domains | Task 2 Step 3 | ✅ Complete |
| Common query examples per table | Task 3 | ✅ Complete |
| AI auto-annotation generation | Task 4 | ✅ Complete |
| Schema annotation status tracking | Task 1 | ✅ Complete |
| Incremental schema sync | ⚠️ Self-review flagged as missing | 🟡 Backlog |
| Schema enhancement management UI | Task 9 | ✅ Complete |
| SQL write-safety enforcement | Task 5 | ✅ Complete |
| Table and column name validation | Task 5 | ✅ Complete |
| Large table WHERE clause check | Task 5 | ✅ Complete |
| Probe execution before full query | Task 5 partially + Self-review flagged | 🟡 Partial |
| Empty result auto-correction | Task 5 Step 4 (prompt only) | ✅ Complete |
| SQL validation status in frontend | Task 7 | ✅ Complete |
| Structured result summary | Task 6 | ✅ Complete |
| Result summary card component | Task 6 | ✅ Complete |
| Trend annotation in table results | Task 8 | ✅ Complete |
| Anomaly highlighting in table results | Task 8 | ✅ Complete |
| Result explanation on demand | Task 7 (button) | ✅ Complete |
| Intent classification for user messages | Task 5 Step 4 (prompt) | ✅ Complete |
| Previous SQL context injection | Task 5 Step 4 (prompt) | ✅ Complete |
| Multi-turn conversation context display | Task 10 | ✅ Complete |
| Conversation context reset | Task 10 | ✅ Complete |
| User feedback on query results | Task 7 + Task 11 | ✅ Complete |
| Feedback-driven knowledge management | Task 11 (basic) | ✅ Complete |

**覆盖率**: 23/25 完整，2 个部分覆盖。Spec 覆盖率高。

---

## 2. Code Alignment Issues (Critical)

### 🔴 C1: Agent Tool execute() signature mismatch

**Plan assumes**: `execute: async (args: { datasource_id: string; ... }) => { ... }`

**Actual codebase** (discover-schema.ts:22, execute-sql.ts:19):
```typescript
execute: async (_toolCallId: string, params: any) => {
  const typedParams = params as DiscoverSchemaParams;
  // ...
  return {
    content: [{ type: "text" as const, text: formatted }],
    details: { tableCount: schema.tables.length },
  };
}
```

The actual AgentTool from pi-agent-core expects: `execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: Function)`. The return format is `{ content: Array<{type: "text", text: string}>, details: any, isError?: boolean }`.

**Impact**: ALL new tool code in the plan (ai-annotate-schema, lookup-semantic-layer, lookup-examples, ai-suggest-semantic) uses the wrong signature and return format. They must be rewritten to match the actual interface.

**Fix**: Every tool must use the `(_toolCallId, params) => { ... }` signature and return `{ content: [{ type: "text", text: string }], details: {} }` format. The plan's `ai_annotate_schema` tool (Task 4 Step 1) returns a flat object — it needs to wrap everything in `content: [{ type: "text", text: JSON.stringify(...) }]`.

---

### 🔴 C2: SQL Injection vulnerability in validator.ts

**Plan code** (Task 5 Step 1):
```typescript
await conn.query(`SELECT COUNT(DISTINCT ${conn.escapeId(col.name)}) as cnt FROM ${conn.escapeId(tableSchema.table.name)}`);
```

This uses `escapeId()` which is correct for identifiers. But later in `checkLargeTableWithoutWhere`:
```typescript
const [rows] = await conn.query<RowDataPacket[]>(
  `SELECT TABLE_ROWS as row_count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()`,
  [table]
);
```

This uses parameterized queries, which is good. However, the `extractTableNames()` function uses regex to extract table names from SQL and then passes them to queries — this is acceptable since the names come from schema cache, not user input. But the validator creates `schemaCaches` as an in-memory Map that is populated only when `discover_schema` is called. If the server restarts, the cache is lost and validation is silently skipped.

**Additional risk**: The `executeSql()` function in executor.ts blindly appends `LIMIT` to any query:
```typescript
const limitedSql = sql.trim().endsWith(";")
  ? sql.slice(0, -1) + ` LIMIT ${rowLimit}`
  : sql + ` LIMIT ${rowLimit}`;
```

This means `SELECT * FROM orders WHERE id = 1; DROP TABLE orders` would get `LIMIT 1000` appended, but the `isSelectQuery()` check (when enabled) should catch it. However, this LIMIT-appending logic will break with subqueries: `SELECT * FROM (SELECT * FROM orders LIMIT 10) AS sub` → `SELECT * FROM (SELECT * FROM orders LIMIT 10) AS sub LIMIT 1000` — this actually works, but `SELECT * FROM orders; -- comment` → `SELECT * FROM orders; -- comment LIMIT 1000` — broken, the comment eats the LIMIT.

**Fix**: The LIMIT-appending logic needs to be smarter (use regex to detect if SQL already has LIMIT, handle comments). The `isSelectQuery()` check must be enforced BEFORE the LIMIT is appended. The schema cache should be persisted or repopulated on startup.

---

### 🔴 C3: Missing integration with existing annotation skill auto-generation

**Current codebase** has `skill-manager.ts` with `generateAnnotationSkill()` which auto-generates a SKILL.md file from annotations. The schemas route (`schemas.ts:49`) calls this after every annotation upsert/delete.

**Plan ignores this entirely.** Task 1 adds `confirmAnnotation()` but never calls `generateAnnotationSkill()`. Task 4's AI annotation also doesn't trigger it. The result: annotations will be stored in SQLite but the Agent won't see them through the skill system.

**Impact**: The existing mechanism that feeds annotations into AgentHarness via `loadAllSkills()` → `setResources()` will be broken. New confirmed annotations won't reach the Agent until server restart.

**Fix**: Every function that modifies annotations (upsert, confirm, delete) must call `generateAnnotationSkill()` and then `refreshHarnessSkills()` for active conversations. Add this to `confirmAnnotation()`, `upsertDomainAnnotation()`, and the AI annotation save logic.

---

### 🔴 C4: Plan adds routes under wrong path prefix

**Plan code** (Task 3 Step 4):
```typescript
app.get("/api/datasources/:dsId/table-query-examples", ...)
app.post("/api/datasources/:dsId/ai-annotate", ...)
```

**Current codebase** (`index.ts:38-42`):
```typescript
app.route("/api/datasources", datasourcesRoutes);
app.route("/api/schemas", schemasRoutes);
```

Routes are registered via `app.route()` with sub-apps. The schemas routes use relative paths (`"/:datasourceId"` → maps to `/api/schemas/:datasourceId`). But the plan mixes two conventions:
- `/api/datasources/:dsId/table-query-examples` (datasource-scoped)
- `/api/schemas/:dsId/ai-annotate` (schema-scoped, from Task 4 Step 3)

The frontend `schemasApi` currently calls `/api/schemas/${dsId}/...`, but the plan's new APIs use `/api/datasources/:dsId/...`.

**Fix**: Decide on one convention. Since table_query_examples and annotations are schema-related, they should live under `/api/schemas/:dsId/...` to match the existing pattern. Update both server routes and frontend API client.

---

### 🟡 C5: `formatSchemaForPrompt()` signature change breaks existing callers

**Current signature**: `formatSchemaForPrompt(schema: SchemaInfo, annotationMap: Map<string, string>): string`

**Plan adds** (Task 2 Step 3 / Task 3 Step 6): `formatSchemaForPrompt(schema, annotationMap, queryExamplesMap?)`

The optional parameter is backward-compatible. BUT the plan also changes how annotationMap is built — adding domain_type/domain_values entries with special keys like `${table}.${col}.__domain_type`. This pollutes the annotation map with non-annotation data.

**Better approach**: Read domain_type/domain_values directly from the SchemaAnnotation objects (which now have those fields), rather than inventing special keys in the annotationMap. Pass the full annotations array to formatSchemaForPrompt instead of a string Map.

**Fix**: Refactor to pass `annotations: SchemaAnnotation[]` instead of `annotationMap: Map<string, string>`, and let `formatSchemaForPrompt` handle both regular annotations and domain info from the typed objects.

---

### 🟡 C6: Frontend ChatMessage type extension strategy

**Plan** adds 3 new fields to ChatMessage: `summarySections`, `validationStatus`, `followUpContext`. It also adds `validationStatus` to `AgentStep`. But the plan doesn't address:

1. **Persisted messages**: The `messages` SQLite table stores content as TEXT and steps as JSON. New fields won't be persisted — they'll be lost on page refresh. This is acceptable for `summarySections` and `validationStatus` (they're derived from content), but `followUpContext` should be persisted if it's meaningful across sessions.

2. **Message history**: When `message_history` is sent on init, the `toChatMessage()` function in ChatWindow.tsx doesn't map the new fields. They'll be undefined on reload.

3. **processWsEvent return type**: Currently returns `ChatMessage | null | "clear"`. The new event types (validation_warning, validation_error) need to be handled, but the function doesn't receive the full current message — only `currentAssistantMessage`. This works because validation events occur during streaming.

**Fix**: Make `summarySections` and `validationStatus` purely derived (parsed from content on render, not stored in state). Only `followUpContext` might need persistence. Add mapping in `toChatMessage()` if persisted.

---

### 🟡 C7: `upsertAnnotation` signature change and existing callers

**Current**: `upsertAnnotation(input: Omit<SchemaAnnotation, "id" | "created_at" | "updated_at">): SchemaAnnotation`

**Plan** (Task 1 Step 3): Adds `upsertDomainAnnotation` with a different input type including `domain_type` and `domain_values`. But the existing `upsertAnnotation` is called from `schemas.ts:41` with the old type. The plan's Step 3 says "update all SQL queries in store.ts that reference schema_annotations to include new columns" but doesn't update the `upsertAnnotation` function itself.

**Fix**: Either extend `upsertAnnotation` to handle the new fields (with defaults), or keep it as-is and only use `upsertDomainAnnotation` for domain-specific saves. The existing `upsertAnnotation` must still work for the schemas route.

---

## 3. Architecture Risks

### ⚠️ R1: In-memory schema cache is fragile

The `validator.ts` stores `schemaCaches` in a `Map<string, SchemaCache>` in memory. It's populated only when `discover_schema` is called. Problems:
- Server restart → cache lost → validation silently skipped
- Multiple conversations sharing same datasource → cache shared (OK)
- Schema changes between discoveries → stale cache

**Recommendation**: Persist schema cache in SQLite (`app_config` or a dedicated table). Or accept the current behavior as "best effort" and document it.

---

### ⚠️ R2: AI annotation tool calls LLM indirectly — unclear flow

The `ai_annotate_schema` tool (Task 4 Step 1) returns structured data telling the LLM to generate annotations. But the actual LLM call happens as part of the Agent's normal response. The flow is:

1. Agent calls `ai_annotate_schema` tool
2. Tool returns `{ needs_annotation: true, tables: "...", instruction: "..." }`
3. Agent reads this and generates annotations as text
4. But... how do the annotations get saved?

The tool returns a prompt asking the Agent to "call the `save_annotations` action" — but no `save_annotations` tool exists! The plan mentions it but never creates it.

**Fix**: Either (a) create a `save_annotations` tool that the Agent can call, or (b) have the `ai_annotate_schema` tool call the LLM directly (like the REST API version does) and save the results as drafts. Option (b) is more reliable since it doesn't depend on the Agent correctly formatting and calling back.

---

### ⚠️ R3: Probe execution adds latency to every NL→SQL query

The probe execution (Task 5, spec requirement) executes `LIMIT 10` before the full query. This doubles the query count. For a 30s timeout query, this adds significant latency.

The plan marks semantic-layer SQL with `/* source: semantic_layer */` to skip probes, but the detection relies on the LLM actually including this comment. If the LLM forgets, the probe runs unnecessarily.

**Recommendation**: Instead of relying on a comment, add a `skipProbe` flag to the execute_sql tool parameters, and instruct the Agent in the system prompt to set it when using semantic layer SQL.

---

### ⚠️ R4: `discoverValueDomains` is expensive on large schemas

Task 2 runs `SELECT DISTINCT` and `SELECT MIN/MAX/AVG` for EVERY column in EVERY table during schema discovery. For a schema with 50 tables × 20 columns = 1000 queries. Even with 5s timeouts, this could take minutes.

**Recommendation**: Make value domain discovery opt-in or asynchronous. Either:
- Add a `discover_domains` parameter to the `discover_schema` tool (default false)
- Run domain discovery as a background job after initial schema discovery
- Cache domain results and only re-discover on explicit user request

---

### ⚠️ R5: Feedback buttons need conversationId in MessageItem

Task 7 Step 4 adds `FeedbackButtons` to `MessageItem`, but `MessageItem` currently only receives `message: ChatMessage`. It doesn't have `conversationId`. The plan notes this ("MessageItem needs conversationId prop") but doesn't detail the prop drilling chain: `ChatWindow` → `MessageList` → `MessageItem`.

**Fix**: This is a minor but required change — update the prop chain through MessageList.

---

## 4. Phase 1 → Phase 2 Dependency Check

| Phase 1 Output | Phase 2 Consumer | Status |
|---|---|---|
| `query_examples` table | Phase 2 Task 2.6 (Few-Shot lookup) | ✅ Table created in P1 Task 11 |
| `query_feedback` table | Phase 2 Task 2.7 (Feedback loop) | ✅ Table created in P1 Task 11 |
| Schema cache in validator | Phase 2 `lookup_semantic_layer` tool | 🟡 Need to ensure schema cache includes semantic layer tables |
| `upsertDomainAnnotation` | Phase 2 AI-suggest-semantic | ✅ Available |
| Annotation skill auto-generation | Phase 2 metric/dimension management | 🔴 Missing — plan doesn't update skill generation for semantic layer |
| System prompt extensions | Phase 2 semantic layer instructions | ✅ Additive — Phase 2 appends to Phase 1's prompt |

**Key gap**: The `generateAnnotationSkill()` mechanism needs to be extended to also include semantic layer metrics/dimensions in the generated SKILL.md. Phase 2 doesn't address this either.

---

## 5. Missing Items

1. **`save_annotations` tool**: Referenced in ai_annotate_schema tool output but never created. Must add or redesign the AI annotation flow.

2. **`generateAnnotationSkill()` integration**: Must be called after every annotation change (upsert, confirm, delete, domain save).

3. **`refreshHarnessSkills()` after annotation changes**: Active AgentHarness instances need their skills refreshed via `harness.setResources()`. This requires tracking which conversations use which datasource.

4. **Migration strategy for existing databases**: Task 1 Step 5-6 adds ALTER TABLE migration, which is good. But no migration versioning system — if Phase 2 adds more columns, there's no framework to manage migrations. Recommend adding a `schema_version` key in `app_config`.

5. **Error handling in validator**: The validator silently skips validation if schema cache is missing. This should at least log a warning.

6. **Frontend `TableData` type extension**: Task 8 adds trend/anomaly computation to TableResult, but `TableData` in `useAgentStream.ts` doesn't change. The computation happens entirely in the frontend component — this is fine, but the execution time display needs the `executionTime` field, which is already in `TableData`.

---

## 6. Recommendations (Priority Order)

### Must Fix Before Implementation

1. **Fix all AgentTool signatures** — rewrite ai-annotate-schema, and all future tools to match `(_toolCallId, params) => { content: [...], details: {} }` format
2. **Add `save_annotations` tool** or redesign AI annotation flow to be self-contained
3. **Integrate `generateAnnotationSkill()`** into all annotation modification paths
4. **Standardize API route paths** — pick one convention (recommend `/api/schemas/:dsId/...` for schema-related endpoints)
5. **Refactor `formatSchemaForPrompt`** to accept typed annotations instead of string map

### Should Fix Before Implementation

6. **Add `schema_version` to `app_config`** for migration tracking
7. **Make value domain discovery async/opt-in** to avoid blocking schema discovery
8. **Fix LIMIT-appending logic** in executor.ts to handle comments and existing LIMITs
9. **Add `skipProbe` parameter** to execute_sql tool instead of relying on SQL comments

### Can Fix During Implementation

10. **Prop-drill conversationId** to MessageItem for feedback buttons
11. **Add validation_warning/error** to WebSocket event forwarding
12. **Persist schema cache** or document the best-effort behavior
13. **Extend `generateAnnotationSkill()`** to include semantic layer info (for Phase 2 prep)

---

## 7. Verdict

**Phase 1 is implementable with fixes.** The plan's direction and scope are correct, spec coverage is excellent, and the task breakdown is logical. The 4 critical code alignment issues (C1-C4) must be resolved before writing code, as they affect the foundation that all new tools and routes build on. The 5 architecture risks should be addressed during implementation.

**Estimated effort adjustment**: +1-2 days to fix the critical alignment issues before starting Task 1.
