import { Hono } from "hono";
import {
  createDatasourceDirect,
  createSqlQueryHistory,
  syncQueryExamplesFromHistory,
  getQueryExecutionStats,
  getRecentSqlContext,
  listAutoQueryExamples,
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

export default app;
