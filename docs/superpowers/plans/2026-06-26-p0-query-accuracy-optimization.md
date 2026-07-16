# P0 Query Accuracy Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three most critical feedback loops in DataNova's SQL query pipeline — user feedback → example quality, execution errors → self-correction, and column hallucination → validation.

**Architecture:** Three independent but complementary improvements to the query execution pipeline. P0-1 (feedback loop) adds read paths for existing feedback data and integrates it into example scoring. P0-2 (self-correction) wraps execute_sql in a retry loop that feeds errors back to the LLM. P0-3 (column validation) extends the existing table-name validator to also check column references against the schema cache. All three target the `execute_sql` → `lookup_examples` → `validator` hot path.

**Tech Stack:** TypeScript (ESM with `.js` imports), Hono, better-sqlite3, React 19, TailwindCSS

---

## File Structure

| File | Responsibility | Status |
|------|---------------|--------|
| `packages/server/src/store.ts` | SQLite CRUD — add feedback read functions, DB migration for new columns | Modify |
| `packages/server/src/types.ts` | TypeScript interfaces — add new fields to QueryFeedback, SqlQueryHistory | Modify |
| `packages/server/src/agent/tools/lookup-examples.ts` | Few-shot example tool — integrate feedback scores into ranking | Modify |
| `packages/server/src/agent/tools/execute-sql.ts` | SQL execution tool — add self-correction loop, pass conversation_id | Modify |
| `packages/server/src/mysql/validator.ts` | SQL validation — extend to validate column names | Modify |
| `packages/server/src/agent/prompt-builder.ts` | System prompt — add self-correction instructions | Modify |
| `packages/server/src/ws/chat-handler.ts` | WebSocket handler — pass conversation_id to tool context | Modify |
| `packages/server/src/index.ts` | Route registration — update feedback endpoint for new fields | Modify |
| `packages/web/src/api/client.ts` | API client — update feedback submission with category | Modify |
| `packages/web/src/components/Chat/FeedbackButtons.tsx` | Feedback UI — add feedback_category to submission | Modify |
| `packages/web/src/components/Chat/MessageItem.tsx` | Message display — show correction indicator | Modify |
| `packages/web/src/hooks/useAgentStream.ts` | Agent stream — handle correction events | Modify |

---

## Task 1: P0-1a — DB Migration for query_feedback and sql_query_history

**Files:**
- Modify: `packages/server/src/store.ts`
- Modify: `packages/server/src/types.ts`

- [ ] **Step 1: Add new columns to `query_feedback` and `sql_query_history` tables in the migration block**

In `store.ts`, find the `initTables()` function. After the existing `CREATE TABLE IF NOT EXISTS query_feedback` block (~line 115), add migration logic for new columns:

```typescript
// After the query_feedback CREATE TABLE block (~line 115):

// Migration: Add feedback_category and sql_query_history_id to query_feedback
try {
  database.exec(`ALTER TABLE query_feedback ADD COLUMN feedback_category TEXT`);
} catch { /* column already exists */ }
try {
  database.exec(`ALTER TABLE query_feedback ADD COLUMN sql_query_history_id TEXT`);
} catch { /* column already exists */ }
```

After the existing `CREATE TABLE IF NOT EXISTS sql_query_history` block (~line 255), add:

```typescript
// Migration: Add parent_query_id, correction_round, intent_type to sql_query_history
try {
  database.exec(`ALTER TABLE sql_query_history ADD COLUMN parent_query_id TEXT`);
} catch { /* column already exists */ }
try {
  database.exec(`ALTER TABLE sql_query_history ADD COLUMN correction_round INTEGER DEFAULT 0`);
} catch { /* column already exists */ }
try {
  database.exec(`ALTER TABLE sql_query_history ADD COLUMN intent_type TEXT`);
} catch { /* column already exists */ }
```

- [ ] **Step 2: Update TypeScript interfaces in `types.ts`**

In `types.ts`, update the `QueryFeedback` interface (~line 38):

```typescript
export interface QueryFeedback {
  id: string;
  message_id: string;
  conversation_id: string;
  rating: "positive" | "negative";
  issue_type: string | null;
  issue_detail: string | null;
  feedback_category: string | null;  // NEW: 'wrong_result' | 'slow_query' | 'wrong_table' | 'missing_data' | 'other'
  sql_query_history_id: string | null;  // NEW: FK to sql_query_history
  created_at: string;
}
```

Update the `SqlQueryHistory` interface (~line 229):

```typescript
export interface SqlQueryHistory {
  id: string;
  datasource_id: string;
  datasource_name: string;
  conversation_id: string | null;
  question: string | null;
  sql: string;
  executed_at: string;
  execution_time_ms: number | null;
  row_count: number | null;
  status: "success" | "error";
  error_message: string | null;
  parent_query_id: string | null;    // NEW: for self-correction chain
  correction_round: number;           // NEW: 0 = original, 1+ = correction attempt
  intent_type: string | null;         // NEW: 'new_query' | 'refine' | 'drill_down' | 'compare' | 'explain' | 'correction'
  created_at: string;
}
```

- [ ] **Step 3: Verify the app starts successfully with the new columns**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova && npm run dev:server`
Expected: Server starts without errors. Check console for any migration-related errors.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/store.ts packages/server/src/types.ts
git commit -m "feat: add DB migration for query_feedback.category, sql_query_history.correction columns"
```

---

## Task 2: P0-1b — Add Feedback Read Functions to store.ts

**Files:**
- Modify: `packages/server/src/store.ts`

- [ ] **Step 1: Add `listFeedbackByDatasource` function**

Add after the `saveFeedback` function (~line 573):

```typescript
/**
 * List feedback for a datasource, joining with sql_query_history to get SQL info.
 * Used by lookup_examples to adjust example scores based on user feedback.
 */
export function listFeedbackByDatasource(datasourceId: string, limit = 100): Array<{
  id: string;
  rating: string;
  issue_type: string | null;
  feedback_category: string | null;
  sql: string | null;
  sql_query_history_id: string | null;
}> {
  return getDb().prepare(`
    SELECT
      qf.id,
      qf.rating,
      qf.issue_type,
      qf.feedback_category,
      sqh.sql,
      qf.sql_query_history_id
    FROM query_feedback qf
    LEFT JOIN sql_query_history sqh ON qf.sql_query_history_id = sqh.id
    LEFT JOIN messages m ON qf.message_id = m.id
    LEFT JOIN conversations c ON m.conversation_id = c.id
    WHERE c.datasource_id = ? OR sqh.datasource_id = ?
    ORDER BY qf.created_at DESC
    LIMIT ?
  `).all(datasourceId, datasourceId, limit) as Array<{
    id: string;
    rating: string;
    issue_type: string | null;
    feedback_category: string | null;
    sql: string | null;
    sql_query_history_id: string | null;
  }>;
}
```

- [ ] **Step 2: Add `getFeedbackStatsBySQL` function**

```typescript
/**
 * Get aggregated feedback statistics per SQL for a datasource.
 * Returns a Map of sql -> { positiveCount, negativeCount, topCategories }.
 */
export function getFeedbackStatsBySQL(datasourceId: string): Map<string, {
  positiveCount: number;
  negativeCount: number;
  topCategories: string[];
}> {
  // Get feedback joined with SQL from history
  const rows = getDb().prepare(`
    SELECT
      sqh.sql,
      SUM(CASE WHEN qf.rating = 'positive' THEN 1 ELSE 0 END) AS positive_count,
      SUM(CASE WHEN qf.rating = 'negative' THEN 1 ELSE 0 END) AS negative_count,
      GROUP_CONCAT(DISTINCT CASE WHEN qf.feedback_category IS NOT NULL THEN qf.feedback_category END) AS categories
    FROM query_feedback qf
    INNER JOIN sql_query_history sqh ON qf.sql_query_history_id = sqh.id
    WHERE sqh.datasource_id = ?
    GROUP BY sqh.sql
  `).all(datasourceId) as Array<{
    sql: string;
    positive_count: number;
    negative_count: number;
    categories: string | null;
  }>;

  const map = new Map<string, { positiveCount: number; negativeCount: number; topCategories: string[] }>();
  for (const row of rows) {
    map.set(row.sql, {
      positiveCount: row.positive_count,
      negativeCount: row.negative_count,
      topCategories: row.categories ? row.categories.split(",") : [],
    });
  }
  return map;
}
```

- [ ] **Step 3: Update `saveFeedback` to accept new fields**

Replace the existing `saveFeedback` function (~line 566):

```typescript
export function saveFeedback(input: Omit<QueryFeedback, "id" | "created_at">): QueryFeedback {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO query_feedback (id, message_id, conversation_id, rating, issue_type, issue_detail, feedback_category, sql_query_history_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.message_id, input.conversation_id, input.rating, input.issue_type ?? null, input.issue_detail ?? null, input.feedback_category ?? null, input.sql_query_history_id ?? null);
  return getDb().prepare(`SELECT * FROM query_feedback WHERE id = ?`).get(id) as QueryFeedback;
}
```

- [ ] **Step 4: Update `createSqlQueryHistory` to accept new fields**

Replace the existing `createSqlQueryHistory` function (~line 1056):

```typescript
export function createSqlQueryHistory(input: Omit<SqlQueryHistory, "id" | "created_at">): SqlQueryHistory {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO sql_query_history (id, datasource_id, datasource_name, conversation_id, question, sql, executed_at, execution_time_ms, row_count, status, error_message, parent_query_id, correction_round, intent_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.datasource_id,
    input.datasource_name,
    input.conversation_id ?? null,
    input.question ?? null,
    input.sql,
    input.executed_at,
    input.execution_time_ms ?? null,
    input.row_count ?? null,
    input.status,
    input.error_message ?? null,
    input.parent_query_id ?? null,
    input.correction_round ?? 0,
    input.intent_type ?? null,
  );
  return getDb().prepare(`SELECT * FROM sql_query_history WHERE id = ?`).get(id) as SqlQueryHistory;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova && npx tsc --noEmit -p packages/server/tsconfig.json`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/store.ts
git commit -m "feat: add feedback read functions and update createSqlQueryHistory for new columns"
```

---

## Task 3: P0-1c — Integrate Feedback into lookup_examples Scoring

**Files:**
- Modify: `packages/server/src/agent/tools/lookup-examples.ts`

- [ ] **Step 1: Import `getFeedbackStatsBySQL` and add feedback scoring**

Replace the imports at the top of `lookup-examples.ts` (line 3):

```typescript
import { listAutoQueryExamples, listDatasources, syncQueryExamplesFromHistory, getQueryExecutionStats, getFeedbackStatsBySQL } from "../../store.js";
```

- [ ] **Step 2: Integrate feedback into the scoring loop**

Find the `scored` mapping block (around line 34-55). After the line `const execStats = getQueryExecutionStats(typedParams.datasource_id);` (line 28), add:

```typescript
        const feedbackStats = getFeedbackStatsBySQL(typedParams.datasource_id);
```

Then in the scoring loop, after the `if (stats)` block (after line 53), add feedback scoring:

```typescript
          // Feedback-based scoring: negative feedback penalizes, positive boosts
          const fbStats = feedbackStats.get(ex.sql);
          if (fbStats) {
            score += Math.min(fbStats.positiveCount, 3);  // +1 per positive, max +3
            score -= Math.min(fbStats.negativeCount * 2, 10);  // -2 per negative, max -10
          }
```

- [ ] **Step 3: Filter out heavily downvoted examples**

After the `qualityExamples` filter (line 31), add a filter that excludes examples with ≥3 negative feedback and no positive feedback:

```typescript
        // Exclude examples with heavy negative feedback (≥3 negative, 0 positive)
        const feedbackFiltered = qualityExamples.filter(ex => {
          const fbStats = feedbackStats.get(ex.sql);
          if (!fbStats) return true;
          return !(fbStats.negativeCount >= 3 && fbStats.positiveCount === 0);
        });
```

Then change the `scored` mapping to use `feedbackFiltered` instead of `qualityExamples`:

```typescript
        const scored = feedbackFiltered.map(ex => {
```

- [ ] **Step 4: Verify the tool compiles and the app runs**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova && npx tsc --noEmit -p packages/server/tsconfig.json`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/agent/tools/lookup-examples.ts
git commit -m "feat: integrate user feedback into lookup_examples scoring — negative feedback penalizes examples"
```

---

## Task 4: P0-1d — Update Feedback API and Frontend

**Files:**
- Modify: `packages/server/src/index.ts`
- Modify: `packages/web/src/api/client.ts`
- Modify: `packages/web/src/components/Chat/FeedbackButtons.tsx`

- [ ] **Step 1: Update the feedback POST endpoint in `index.ts` to accept new fields**

Replace the feedback endpoint (~lines 53-65):

```typescript
// Feedback API
app.post("/api/conversations/:convId/messages/:msgId/feedback", async (c) => {
  const convId = c.req.param("convId");
  const msgId = c.req.param("msgId");
  const body = await c.req.json();
  const feedback = saveFeedback({
    message_id: msgId,
    conversation_id: convId,
    rating: body.rating,
    issue_type: body.issue_type ?? null,
    issue_detail: body.issue_detail ?? null,
    feedback_category: body.feedback_category ?? null,
    sql_query_history_id: body.sql_query_history_id ?? null,
  });
  return c.json(feedback, 201);
});
```

- [ ] **Step 2: Update `api/client.ts` feedback submission to include category**

Replace the `feedbackApi` section (~lines 232-238):

```typescript
export const feedbackApi = {
  submit: (convId: string, msgId: string, data: {
    rating: string;
    issue_type?: string;
    issue_detail?: string;
    feedback_category?: string;
    sql_query_history_id?: string;
  }) =>
    request<any>(`/api/conversations/${convId}/messages/${msgId}/feedback`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
```

- [ ] **Step 3: Update FeedbackButtons to send feedback_category**

In `FeedbackButtons.tsx`, the `ISSUE_TYPES` array already has the right categories. We just need to pass `feedback_category` in the `onFeedbackSubmit` call. Find the `handleRatingClick` function and update the positive feedback path:

```typescript
  const handleRatingClick = (newRating: Rating) => {
    setRating(newRating);
    if (newRating === "positive") {
      // Submit positive feedback immediately — no category needed for positive
      onFeedbackSubmit?.("positive");
      setSubmitted(true);
    } else {
      // Show feedback form for negative rating
      setShowFeedbackForm(true);
    }
  };
```

Then update `handleSubmitFeedback` to pass `feedback_category`:

```typescript
  const handleSubmitFeedback = () => {
    onFeedbackSubmit?.("negative", selectedIssue, issueDetail, selectedIssue);
    setSubmitted(true);
    setShowFeedbackForm(false);
  };
```

Update the `FeedbackButtonsProps` interface:

```typescript
interface FeedbackButtonsProps {
  conversationId: string;
  messageId: string;
  onFeedbackSubmit?: (rating: string, issueType?: string, issueDetail?: string, feedbackCategory?: string) => void;
  onExplainRequest?: () => void;
}
```

- [ ] **Step 4: Update MessageItem.tsx to pass feedback_category to API**

Find where `feedbackApi.submit` is called in `MessageItem.tsx`. Update the call to include `feedback_category`:

The `onFeedbackSubmit` handler likely lives in `ChatWindow.tsx` or `MessageItem.tsx`. Search for `feedbackApi.submit` and update the call:

```typescript
const handleFeedback = (rating: string, issueType?: string, issueDetail?: string, feedbackCategory?: string) => {
  feedbackApi.submit(conversationId, messageId, {
    rating,
    issue_type: issueType,
    issue_detail: issueDetail,
    feedback_category: feedbackCategory,
  });
};
```

- [ ] **Step 5: Verify the full flow works end-to-end**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova && npm run dev:server` and `npm run dev:web`
Expected: App loads, chat works, 👍👎 buttons still work, clicking 👎 shows category form, submitting sends `feedback_category` in the request body.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/index.ts packages/web/src/api/client.ts packages/web/src/components/Chat/FeedbackButtons.tsx packages/web/src/components/Chat/MessageItem.tsx packages/web/src/components/Chat/ChatWindow.tsx
git commit -m "feat: complete feedback loop — frontend sends feedback_category, backend stores and reads feedback"
```

---

## Task 5: P0-2a — Pass conversation_id to execute_sql Tool

**Files:**
- Modify: `packages/server/src/ws/chat-handler.ts`
- Modify: `packages/server/src/agent/tools/execute-sql.ts`

This is a prerequisite for both P0-2 (self-correction tracking) and P1-3 (context isolation). Currently `conversation_id` is hardcoded to `null` in `createSqlQueryHistory`.

- [ ] **Step 1: Store conversation_id in a module-level map accessible to tools**

In `chat-handler.ts`, add a new Map after the existing `conversationDatasourceMap` (line 7):

```typescript
// Track conversationId -> datasourceId for context injection
const conversationDatasourceMap = new Map<string, string>();

// Track current active conversation_id so tools can access it
const activeConversationId = new Map<string, string>();  // sessionId -> conversationId
```

- [ ] **Step 2: Set the active conversation_id in handleMessage**

In `handleMessage`, after the line `const conversationId = (data.payload?.conversationId as string) ?? "";` (line 137), add:

```typescript
    // Make conversation_id available to tools
    activeConversationId.set(ws.toString(), conversationId);
```

- [ ] **Step 3: Export a function to get the active conversation_id**

Add at the bottom of `chat-handler.ts` (before the final closing or after `createChatHandler`):

```typescript
/**
 * Get the active conversation_id for the current WS session.
 * Used by execute_sql and other tools to record conversation context.
 */
export function getActiveConversationId(sessionKey: string): string | undefined {
  return activeConversationId.get(sessionKey);
}
```

- [ ] **Step 4: Update execute_sql to use conversation_id**

In `execute-sql.ts`, we need an alternative approach since tools don't have access to the WS context. Instead, add `conversation_id` as an optional parameter to the tool:

Update the `ExecuteSqlParams` schema (~line 7):

```typescript
const ExecuteSqlParams = Type.Object({
  datasource_id: Type.String({ description: "The ID of the datasource to execute the SQL query against. If you don't know the ID, use any string and the tool will return a list of available datasources." }),
  sql: Type.String({ description: "The SELECT SQL query to execute. Only SELECT, SHOW, DESCRIBE, and EXPLAIN statements are allowed." }),
  question: Type.Optional(Type.String({ description: "The user's original question that prompted this SQL query. Used for recording query history." })),
  skip_probe: Type.Optional(Type.Boolean({ description: "If true, skip probe execution. Set to true for semantic layer queries marked with /* source: semantic_layer */." })),
  conversation_id: Type.Optional(Type.String({ description: "The current conversation ID for linking query history to the conversation." })),
});
```

Then update both `createSqlQueryHistory` calls to use `typedParams.conversation_id`:

Success case (~line 109):
```typescript
          createSqlQueryHistory({
            datasource_id: typedParams.datasource_id,
            datasource_name: validDs.name,
            conversation_id: typedParams.conversation_id ?? null,
            question: typedParams.question ?? null,
            sql: typedParams.sql,
            executed_at: new Date().toISOString(),
            execution_time_ms: result.executionTime,
            row_count: rows.length,
            status: "success",
            error_message: null,
          });
```

Error case (~line 140):
```typescript
          createSqlQueryHistory({
            datasource_id: typedParams.datasource_id,
            datasource_name: ds?.name ?? typedParams.datasource_id,
            conversation_id: typedParams.conversation_id ?? null,
            question: typedParams.question ?? null,
            sql: typedParams.sql,
            executed_at: new Date().toISOString(),
            execution_time_ms: 0,
            row_count: 0,
            status: "error",
            error_message: error.message,
          });
```

- [ ] **Step 5: Update the system prompt to instruct the LLM to pass conversation_id**

In `prompt-builder.ts`, in the tool usage guidelines section, add:

After the line about `lookup_semantic_layer` (around line 63), add:

```typescript
  - When calling execute_sql, always include the conversation_id parameter if it's provided in the context. This links the query to the conversation for better history tracking.
```

- [ ] **Step 6: Pass conversation_id from chat-handler to the prompt context**

In `chat-handler.ts`, in the `handleMessage` function, update the contextPrefix to include conversation_id:

After the `contextPrefix` construction (~line 174), add:

```typescript
    // Inject conversation_id into context so LLM can pass it to tools
    if (conversationId) {
      contextPrefix += `[Current conversation_id: ${conversationId}]\n\n`;
    }
```

- [ ] **Step 7: Verify conversation_id is recorded in sql_query_history**

Run the dev server, send a chat message that triggers execute_sql, then check:
```bash
sqlite3 data/datanova.db "SELECT id, conversation_id, question, sql FROM sql_query_history ORDER BY created_at DESC LIMIT 5"
```
Expected: `conversation_id` column is no longer null for new queries.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/ws/chat-handler.ts packages/server/src/agent/tools/execute-sql.ts packages/server/src/agent/prompt-builder.ts
git commit -m "feat: pass conversation_id to execute_sql tool and record in query history"
```

---

## Task 6: P0-2b — Implement Self-Correction Loop in execute_sql

**Files:**
- Modify: `packages/server/src/agent/tools/execute-sql.ts`
- Modify: `packages/server/src/agent/prompt-builder.ts`

- [ ] **Step 1: Add self-correction constants and types**

At the top of `execute-sql.ts`, after the imports, add:

```typescript
const MAX_CORRECTION_ROUNDS = 3;
const ZERO_RESULT_HINT_THRESHOLD = 0;  // 0 rows triggers analysis
```

- [ ] **Step 2: Wrap the SQL execution in a correction loop**

Replace the entire `execute` function body (from line 22 to line 161). The new logic wraps the existing execution in a loop, and on error or 0-row result, returns a structured hint that tells the LLM what went wrong and asks it to correct. The LLM will then call execute_sql again with a corrected SQL.

**Important design decision:** We do NOT auto-retry within the tool. Instead, we return richer error/0-row information so the LLM can make an informed correction. This keeps the tool simple and lets the LLM's reasoning handle the correction logic. The `correction_round` is tracked so we can limit retries via the system prompt.

Replace the success-path return (around line 123) with enhanced 0-row detection:

```typescript
        // Check for 0-row result and add diagnostic hint
        if (rows.length === 0 && columns.length > 0) {
          output += `\n\n⚠️ 查询返回0行结果。可能原因：\n`;
          output += `1. WHERE条件过于严格，尝试放宽或移除部分条件\n`;
          output += `2. 日期范围可能不在数据范围内，尝试扩大时间范围\n`;
          output += `3. JOIN条件可能不匹配，检查关联字段\n`;
          output += `4. 表名或表的选择可能有误\n`;
          output += `请修正SQL后重新执行。这是第1次修正尝试。`;
        }
```

Replace the error-path return (around line 154) with enhanced error diagnostics:

```typescript
        return {
          content: [{ type: "text" as const, text: `SQL执行错误: ${error.message}\n\n请分析错误原因并修正SQL：\n1. 如果是语法错误，检查SQL语法\n2. 如果是表/列不存在，先调用discover_schema确认schema\n3. 如果是函数不存在，检查函数名拼写\n4. 修正后重新调用execute_sql执行` }],
          details: { rowCount: 0, executionTime: 0 },
          isError: true,
        };
```

- [ ] **Step 3: Update system prompt with self-correction rules**

In `prompt-builder.ts`, replace the existing 0-row retry instruction (around line 43-46):

Replace:
```
  - If a SQL query returns 0 rows, DO NOT just report "no results". Instead:
    1. Analyze possible causes: wrong table, wrong filter conditions, wrong JOIN, wrong date range
    2. Automatically attempt to correct the SQL and re-execute (max 2 retries)
    3. If still no results after 2 retries, explain to the user what you tried and suggest they provide more specific criteria
```

With:
```
  - SQL执行错误自修正规则（严格遵守）：
    当execute_sql返回错误时，你必须分析错误原因并修正SQL，然后重新执行。修正策略：
    1. 语法错误 → 检查SQL语法，特别是引号、括号、逗号
    2. 表不存在 → 调用discover_schema确认表名，可能是拼写错误
    3. 列不存在 → 调用discover_schema确认列名，可能是别名或拼写错误
    4. 函数不存在 → 检查函数名拼写，使用标准SQL函数
    最多修正3次。如果3次后仍失败，向用户解释已尝试的修正和最终错误。

  - 查询返回0行自修正规则：
    当execute_sql成功执行但返回0行时，分析可能原因并修正：
    1. 条件过严 → 尝试移除或放宽WHERE条件
    2. 日期范围 → 尝试扩大日期范围或移除日期筛选
    3. JOIN不匹配 → 检查JOIN条件和关联字段
    4. 表选择错误 → 检查是否查询了正确的表
    最多修正2次。如果2次后仍为0行，向用户展示已尝试的查询和建议。
```

- [ ] **Step 4: Verify self-correction works**

Run the dev server, ask a question that might generate incorrect SQL, observe whether the LLM corrects after an error.
Expected: On SQL error, LLM should analyze the error message and retry with corrected SQL.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/agent/tools/execute-sql.ts packages/server/src/agent/prompt-builder.ts
git commit -m "feat: implement self-correction — enhanced error diagnostics and 0-row analysis in execute_sql"
```

---

## Task 7: P0-3a — Extend validator.ts for Column Name Validation

**Files:**
- Modify: `packages/server/src/mysql/validator.ts`

The schema cache already has a `columns: Map<string, Set<string>>` field (line 12) but it's never used for validation. We need to add column extraction and validation logic.

- [ ] **Step 1: Add `extractColumnReferences` function**

Add after the existing `extractTableNames` function (~line 74):

```typescript
/**
 * Extract column references from a SQL query.
 * Returns an array of { table, column } pairs.
 * Handles: table.column, just column (no table prefix).
 */
function extractColumnReferences(sql: string): Array<{ table: string | null; column: string }> {
  const refs: Array<{ table: string | null; column: string }> = [];
  
  // Match table.column patterns (e.g., orders.amount, o.total)
  const qualifiedRegex = /\b(\w+)\.(\w+)\b/g;
  let match;
  while ((match = qualifiedRegex.exec(sql)) !== null) {
    const table = match[1];
    const column = match[2];
    // Skip SQL keywords that look like table.column
    const sqlKeywords = new Set(['GROUP', 'ORDER', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'NATURAL', 'USING', 'ON', 'AND', 'OR', 'NOT', 'AS', 'IS', 'IN', 'BETWEEN', 'LIKE', 'NULL', 'TRUE', 'FALSE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'EXISTS', 'ASC', 'DESC']);
    if (!sqlKeywords.has(table.toUpperCase())) {
      refs.push({ table, column });
    }
  }
  
  return refs;
}
```

- [ ] **Step 2: Add column validation logic to `validateSqlAgainstSchema`**

In `validateSqlAgainstSchema`, after the table name validation block (after line 118), add column validation:

```typescript
  // 3. Column name validation (warn mode — don't block execution, just warn)
  const columnRefs = extractColumnReferences(sql);
  for (const ref of columnRefs) {
    if (ref.table && cache.columns.has(ref.table)) {
      const tableColumns = cache.columns.get(ref.table)!;
      // Skip common SQL pseudo-columns and functions
      const skipColumns = new Set(['*', 'count', 'sum', 'avg', 'min', 'max', 'row_number', 'rank', 'dense_rank']);
      if (skipColumns.has(ref.column.toLowerCase())) continue;
      
      if (!tableColumns.has(ref.column) && !tableColumns.has(ref.column.toLowerCase())) {
        // Find closest match
        let suggestion = "";
        let minDist = Infinity;
        for (const col of tableColumns) {
          const d = levenshtein(ref.column.toLowerCase(), col.toLowerCase());
          if (d < minDist && d <= 3) {
            minDist = d;
            suggestion = col;
          }
        }
        const msg = suggestion
          ? `Column '${ref.table}.${ref.column}' does not exist. Did you mean '${ref.table}.${suggestion}'?`
          : `Column '${ref.table}.${ref.column}' does not exist in table '${ref.table}'.`;
        // Use warning (not error) for column validation — LLM may use aliases or expressions
        result.warnings.push(msg);
      }
    }
  }
```

- [ ] **Step 3: Update `execute_sql` to include validation warnings in the response**

In `execute-sql.ts`, after the validation check (around line 49-56), update to also include warnings:

The current code only checks `!validation.passed` and returns errors. We also need to pass through warnings. Update the success path to include `validation.warnings`:

After line 77 (the largeTableWarning block), add:

```typescript
        // Include column validation warnings in output
        if (validation.warnings.length > 0) {
          output += `⚠️ Column Validation Warnings:\n${validation.warnings.map(w => `  - ${w}`).join("\n")}\n\nPlease verify the column names are correct.\n\n`;
        }
```

Also update the details to include warnings:

```typescript
          details: {
            rowCount: rows.length,
            executionTime: result.executionTime,
            validationWarnings: [...(largeTableWarning ? [largeTableWarning] : []), ...validation.warnings],
            columns: columns,
            rows: rows,
            sql: typedParams.sql,
          },
```

- [ ] **Step 4: Verify column validation works**

Run the dev server, test with a query that references a non-existent column (e.g., `SELECT wrong_column FROM orders`).
Expected: The execute_sql response includes a warning like "Column 'orders.wrong_column' does not exist. Did you mean 'orders.order_amount'?"

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/mysql/validator.ts packages/server/src/agent/tools/execute-sql.ts
git commit -m "feat: extend SQL validator to check column names with Levenshtein suggestions"
```

---

## Task 8: P0-3b — Pre-populate Schema Cache on Harness Init

**Files:**
- Modify: `packages/server/src/ws/chat-handler.ts`

Currently the schema cache is only populated when the LLM calls `discover_schema`. If the LLM skips this step, column validation won't work.

- [ ] **Step 1: Import discovery functions and setSchemaCache**

Add imports at the top of `chat-handler.ts`:

```typescript
import { discoverSchema } from "../mysql/discovery.js";
import { setSchemaCache } from "../mysql/validator.js";
```

- [ ] **Step 2: Pre-populate schema cache in handleInit**

In `handleInit`, after the harness is created (after line 93: `const harness = await createHarness(options);`), add:

```typescript
    // Pre-populate schema cache for validator so column validation works
    // even if the LLM skips discover_schema on the first query
    if (options.datasourceId) {
      try {
        const schemaInfo = await discoverSchema(options.datasourceId);
        if (schemaInfo && schemaInfo.tables) {
          const tables = schemaInfo.tables.map(t => t.table.name);
          const columnsByTable = new Map<string, string[]>();
          for (const tableSchema of schemaInfo.tables) {
            columnsByTable.set(
              tableSchema.table.name,
              tableSchema.columns.map(c => c.name)
            );
          }
          setSchemaCache(options.datasourceId, tables, columnsByTable);
        }
      } catch {
        // Non-critical: schema discovery may fail if DB is unreachable
      }
    }
```

- [ ] **Step 3: Verify schema cache is populated on init**

Run the dev server, open a chat with a datasource, check that the schema cache is populated:
```bash
# After opening a chat, try a query with a wrong column name
# It should show a validation warning even without calling discover_schema first
```
Expected: Column validation works from the very first query.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/ws/chat-handler.ts
git commit -m "feat: pre-populate schema cache on harness init for immediate column validation"
```

---

## Task 9: Integration Test — Verify All P0 Improvements Together

**Files:**
- No new files — manual testing

- [ ] **Step 1: Start the dev server and web client**

Run: `cd /mnt/d/projects/datanova/sub_projects/pi-datanova && npm run dev:server` and `npm run dev:web`

- [ ] **Step 2: Test P0-1 (Feedback Loop)**

1. Open chat, ask a data question that returns results
2. Click 👍 — verify no errors in console
3. Ask another question, click 👎 — verify the feedback category form appears
4. Select a category (e.g., "条件不对") and submit
5. Check `query_feedback` table: `sqlite3 data/datanova.db "SELECT * FROM query_feedback ORDER BY created_at DESC LIMIT 3"`
6. Expected: `feedback_category` column is populated

- [ ] **Step 3: Test P0-2 (Self-Correction)**

1. Ask a question that might generate incorrect SQL (e.g., a complex JOIN)
2. If SQL fails, observe that the LLM analyzes the error and retries
3. Ask a question that returns 0 rows — observe the LLM's diagnostic analysis
4. Check `sql_query_history` table: `sqlite3 data/datanova.db "SELECT conversation_id, question, status, error_message, correction_round FROM sql_query_history ORDER BY created_at DESC LIMIT 5"`
5. Expected: `conversation_id` is populated (not null), `correction_round` is 0 for original queries

- [ ] **Step 4: Test P0-3 (Column Validation)**

1. In chat, ask a question that references a specific column
2. If the LLM hallucinates a column name, observe the validation warning
3. Check that the LLM uses the Levenshtein suggestion to correct
4. Expected: Column validation warnings appear in the tool result, LLM corrects the column name

- [ ] **Step 5: Final commit if any fixes are needed**

```bash
git add -A
git commit -m "fix: adjustments from P0 integration testing"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ P0-1: Feedback loop — DB migration (Task 1), read functions (Task 2), scoring integration (Task 3), API+frontend (Task 4)
- ✅ P0-2: Self-Correction — conversation_id pass-through (Task 5), correction logic (Task 6)
- ✅ P0-3: Column validation — validator extension (Task 7), schema cache pre-load (Task 8)
- ✅ Integration test (Task 9)

**2. Placeholder scan:**
- No TBD, TODO, or "implement later" patterns found
- All code steps contain actual implementation code
- All test steps contain specific verification commands

**3. Type consistency:**
- `QueryFeedback` interface updated in Task 1 matches the `saveFeedback` call in Task 2 and Task 4
- `SqlQueryHistory` interface updated in Task 1 matches the `createSqlQueryHistory` call in Task 2 and Task 5
- `feedback_category` field name is consistent across types.ts, store.ts, index.ts, client.ts, FeedbackButtons.tsx
- `correction_round` and `parent_query_id` field names are consistent across types.ts and store.ts
