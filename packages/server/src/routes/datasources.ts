import { Hono } from "hono";
import {
  listDatasources,
  getDatasource,
  createDatasource,
  updateDatasource,
  deleteDatasource,
} from "../store.js";
import { testConnection, testRawConnection, closePool } from "../mysql/pool.js";

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
    const testResult = await testRawConnection({
      host: body.host ?? existing.host,
      port: body.port ?? existing.port,
      database: body.database ?? existing.database,
      user: body.user ?? existing.user,
      password: body.password ?? existing.password,
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

export default app;
