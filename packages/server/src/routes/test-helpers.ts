import { Hono } from "hono";
import {
  createDatasourceDirect,
  createSqlQueryHistory,
  syncQueryExamplesFromHistory,
  getQueryExecutionStats,
  getRecentSqlContext,
  listAutoQueryExamples,
  createAgentTrace,
  getAgentTrace,
  listAgentTraces,
} from "../store.js";

const app = new Hono();

// Only available in test/development environments
app.use(async (c, next) => {
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }
  await next();
});

// Create a datasource without testing MySQL connection (for testing)
app.post("/datasources", async (c) => {
  const body = await c.req.json();
  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }
  const ds = createDatasourceDirect({
    name: body.name,
    host: body.host ?? "localhost",
    port: body.port ?? 3306,
    database: body.database ?? "test_db",
    user: body.user ?? "root",
    password: body.password ?? "test",
    enabled: true,
  });
  return c.json(ds, 201);
});

// Create a sql_query_history record directly (for testing sync logic)
app.post("/query-history", async (c) => {
  const body = await c.req.json();
  if (!body.datasource_id || !body.sql) {
    return c.json({ error: "datasource_id and sql are required" }, 400);
  }
  const record = createSqlQueryHistory({
    datasource_id: body.datasource_id,
    datasource_name: body.datasource_name ?? "test",
    conversation_id: body.conversation_id ?? null,
    question: body.question ?? null,
    sql: body.sql,
    executed_at: body.executed_at ?? new Date().toISOString(),
    execution_time_ms: body.execution_time_ms ?? null,
    row_count: body.row_count ?? null,
    status: body.status ?? "success",
    error_message: body.error_message ?? null,
  });
  return c.json(record, 201);
});

// Trigger sync from sql_query_history to query_examples
app.post("/sync-examples/:datasourceId", async (c) => {
  const dsId = c.req.param("datasourceId");
  const count = syncQueryExamplesFromHistory(dsId);
  return c.json({ synced: count });
});

// Get query execution stats for a datasource
app.get("/execution-stats/:datasourceId", async (c) => {
  const dsId = c.req.param("datasourceId");
  const stats = getQueryExecutionStats(dsId);
  const result: Record<string, { successCount: number; errorCount: number; avgTimeMs: number }> = {};
  stats.forEach((v: { successCount: number; errorCount: number; avgTimeMs: number }, k: string) => {
    result[k] = v;
  });
  return c.json(result);
});

// Get recent SQL context for multi-turn injection
app.get("/recent-sql-context/:datasourceId", async (c) => {
  const dsId = c.req.param("datasourceId");
  const limit = parseInt(c.req.query("limit") || "3", 10);
  const context = getRecentSqlContext(dsId, limit);
  return c.json(context);
});

// List auto query examples for a datasource
app.get("/auto-examples/:datasourceId", async (c) => {
  const dsId = c.req.param("datasourceId");
  const examples = listAutoQueryExamples(dsId);
  return c.json(examples);
});

// Create an agent_trace record directly (for testing the chain audit flow
// without needing a live LLM/agent run). Accepts the full trace shape;
// omitted fields default sensibly.
app.post("/agent-traces", async (c) => {
  const body = await c.req.json();
  if (!body.conversation_id || !body.user_question) {
    return c.json({ error: "conversation_id and user_question are required" }, 400);
  }
  const trace = createAgentTrace({
    conversation_id: body.conversation_id,
    message_id: body.message_id ?? null,
    datasource_id: body.datasource_id ?? null,
    datasource_name: body.datasource_name ?? "",
    user_question: body.user_question,
    agent_type: body.agent_type ?? "query",
    tool_sequence: body.tool_sequence ?? JSON.stringify([]),
    tool_details: body.tool_details ?? JSON.stringify([]),
    thinking_summary: body.thinking_summary ?? "",
    decision_rationale: body.decision_rationale ?? "",
    final_sql: body.final_sql ?? null,
    total_tool_calls: body.total_tool_calls ?? 0,
    total_turns: body.total_turns ?? 0,
    used_semantic_layer: body.used_semantic_layer ?? 0,
    used_discover_schema: body.used_discover_schema ?? 0,
    used_examples: body.used_examples ?? 0,
    used_skill: body.used_skill ?? 0,
    self_corrected: body.self_corrected ?? 0,
    duration_ms: body.duration_ms ?? null,
  });
  return c.json(trace, 201);
});

// Get a single agent_trace by id (test mirror of the public route).
app.get("/agent-traces/:id", (c) => {
  const trace = getAgentTrace(c.req.param("id"));
  if (!trace) return c.json({ error: "Not found" }, 404);
  return c.json(trace);
});

// List agent_traces (test mirror).
app.get("/agent-traces", (c) => {
  return c.json(listAgentTraces({ limit: 100 }));
});

export default app;
