import { Hono } from "hono";
import {
  listDatasources,
  getDatasource,
  createDatasource,
  updateDatasource,
  deleteDatasource,
} from "../store.js";
import { testConnection, testRawConnection, closePool } from "../mysql/pool.js";
import { executeSql, isSelectQuery } from "../mysql/executor.js";
import { validateSqlAgainstSchema } from "../mysql/validator.js";
import { createSqlQueryHistory } from "../store.js";
import { decrypt } from "../crypto.js";

const app = new Hono();

// List all datasources
app.get("/", (c) => {
  const datasources = listDatasources();
  // Strip passwords from list response
  const safe = datasources.map(({ password: _, ...ds }) => ({
    ...ds,
    hasPassword: true,
  }));
  return c.json(safe);
});

// Get single datasource
app.get("/:id", (c) => {
  const ds = getDatasource(c.req.param("id"));
  if (!ds) return c.json({ error: "Not found" }, 404);
  const { password: _, ...safe } = ds;
  return c.json({ ...safe, hasPassword: true });
});

// Create datasource (tests connection first)
app.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.name || !body.host || !body.port || !body.database || !body.user || !body.password) {
    return c.json({ error: "Missing required fields: name, host, port, database, user, password" }, 400);
  }

  // Test connection before creating
  const testResult = await testRawConnection({
    host: body.host,
    port: body.port,
    database: body.database,
    user: body.user,
    password: body.password,
  });

  if (!testResult.success) {
    return c.json({ error: `Connection test failed: ${testResult.error}` }, 400);
  }

  try {
    const ds = await createDatasource({
      name: body.name,
      host: body.host,
      port: body.port,
      database: body.database,
      user: body.user,
      password: body.password,
      enabled: body.enabled ?? true,
    });

    const { password: _, ...safe } = ds;
    return c.json({ ...safe, hasPassword: true }, 201);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes("UNIQUE constraint failed")) {
      return c.json({ error: `Datasource name "${body.name}" already exists` }, 409);
    }
    return c.json({ error: error.message }, 500);
  }
});

// Update datasource
app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = getDatasource(id);
  if (!existing) return c.json({ error: "Not found" }, 404);

  // If connection details changed, test new connection
  if (body.host || body.port || body.database || body.user || body.password) {
    // Decrypt existing password when not providing a new one,
    // since existing.password is encrypted ciphertext
    const passwordForTest = body.password ?? decrypt(existing.password);

    const testResult = await testRawConnection({
      host: body.host ?? existing.host,
      port: body.port ?? existing.port,
      database: body.database ?? existing.database,
      user: body.user ?? existing.user,
      password: passwordForTest,
    });

    if (!testResult.success) {
      return c.json({ error: `Connection test failed: ${testResult.error}` }, 400);
    }

    // Close old pool since connection details changed
    await closePool(id);
  }

  const ds = await updateDatasource(id, body);
  if (!ds) return c.json({ error: "Not found" }, 404);

  const { password: _, ...safe } = ds;
  return c.json({ ...safe, hasPassword: true });
});

// Test datasource connection
app.post("/:id/test", async (c) => {
  const id = c.req.param("id");
  const result = await testConnection(id);
  return c.json(result);
});

// Delete datasource
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await closePool(id);
  const deleted = deleteDatasource(id);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

// Execute SQL query directly
app.post("/:id/execute-sql", async (c) => {
  const datasourceId = c.req.param("id");
  const body = await c.req.json();
  const sql: string = body.sql ?? "";

  if (!sql.trim()) {
    return c.json({ error: "SQL query is required" }, 400);
  }

  if (!isSelectQuery(sql)) {
    return c.json({ error: "Only SELECT, SHOW, DESCRIBE, and EXPLAIN queries are allowed" }, 400);
  }

  const ds = getDatasource(datasourceId);
  if (!ds) return c.json({ error: "Datasource not found" }, 404);
  if (!ds.enabled) return c.json({ error: "Datasource is not enabled" }, 400);

  // Validate SQL against schema
  const validation = validateSqlAgainstSchema(sql, datasourceId);
  if (!validation.passed) {
    return c.json({ error: `SQL validation failed: ${validation.errors.join("; ")}` }, 400);
  }

  try {
    const result = await executeSql(datasourceId, sql);

    // Record in query history
    try {
      createSqlQueryHistory({
        datasource_id: datasourceId,
        datasource_name: ds.name,
        conversation_id: null,
        question: null,
        sql,
        executed_at: new Date().toISOString(),
        execution_time_ms: result.executionTime,
        row_count: result.rowCount,
        status: "success",
        error_message: null,
      });
    } catch (_) {}

    return c.json({
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      executionTime: result.executionTime,
    });
  } catch (err) {
    const error = err as Error;

    try {
      createSqlQueryHistory({
        datasource_id: datasourceId,
        datasource_name: ds.name,
        conversation_id: null,
        question: null,
        sql,
        executed_at: new Date().toISOString(),
        execution_time_ms: 0,
        row_count: 0,
        status: "error",
        error_message: error.message,
      });
    } catch (_) {}

    return c.json({ error: error.message }, 500);
  }
});

export default app;
