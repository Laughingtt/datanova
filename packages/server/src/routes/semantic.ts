import { Hono } from "hono";
import {
  listMetrics, getMetric, createMetric, updateMetric, deleteMetric,
  listDimensions, createDimension, updateDimension, deleteDimension,
  listModels, createModel, updateModel, deleteModel,
} from "../store.js";
import { executeSql } from "../mysql/executor.js";

export function createSemanticRoutes(): Hono {
  const app = new Hono();

  // === Metrics ===
  app.get("/api/datasources/:dsId/metrics", (c) => {
    return c.json(listMetrics(c.req.param("dsId")));
  });

  app.post("/api/datasources/:dsId/metrics", async (c) => {
    const body = await c.req.json();
    const metric = createMetric({ datasource_id: c.req.param("dsId"), ...body });
    return c.json(metric, 201);
  });

  app.put("/api/datasources/:dsId/metrics/:id", async (c) => {
    const body = await c.req.json();
    const updated = updateMetric(c.req.param("id"), body);
    return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
  });

  app.delete("/api/datasources/:dsId/metrics/:id", (c) => {
    return deleteMetric(c.req.param("id")) ? c.json({ success: true }) : c.json({ error: "Not found" }, 404);
  });

  app.post("/api/datasources/:dsId/metrics/:id/test", async (c) => {
    const dsId = c.req.param("dsId");
    const metricId = c.req.param("id");
    const metric = getMetric(metricId);
    if (!metric) return c.json({ error: "Metric not found" }, 404);

    // Build test SQL from metric expression
    let sql = `SELECT ${metric.sql_expression} AS ${metric.name}`;
    const models = listModels(dsId);
    const matchingModel = models.find(m => {
      const mMetrics = JSON.parse(m.metrics) as string[];
      return mMetrics.includes(metric.name);
    });

    if (matchingModel) {
      sql += ` FROM ${matchingModel.base_table}`;
      const joins = JSON.parse(matchingModel.joins) as Array<{ table: string; on: string; type: string }>;
      for (const j of joins) {
        sql += ` ${j.type.toUpperCase()} JOIN ${j.table} ON ${j.on}`;
      }
    } else {
      return c.json({ columns: [metric.name], rows: [], rowCount: 0, executionTime: 0 });
    }

    const filters = JSON.parse(metric.filters) as Array<{ column: string; operator: string; value: string }>;
    if (filters.length > 0) {
      sql += ` WHERE ${filters.map(f => `${f.column} ${f.operator} '${f.value}'`).join(" AND ")}`;
    }
    sql += " LIMIT 10";

    try {
      const result = await executeSql(dsId, sql, { timeout: 5000, rowLimit: 10 });
      return c.json(result);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // === Dimensions ===
  app.get("/api/datasources/:dsId/dimensions", (c) => {
    return c.json(listDimensions(c.req.param("dsId")));
  });

  app.post("/api/datasources/:dsId/dimensions", async (c) => {
    const body = await c.req.json();
    const dim = createDimension({ datasource_id: c.req.param("dsId"), ...body });
    return c.json(dim, 201);
  });

  app.put("/api/datasources/:dsId/dimensions/:id", async (c) => {
    const body = await c.req.json();
    const updated = updateDimension(c.req.param("id"), body);
    return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
  });

  app.delete("/api/datasources/:dsId/dimensions/:id", (c) => {
    return deleteDimension(c.req.param("id")) ? c.json({ success: true }) : c.json({ error: "Not found" }, 404);
  });

  // === Models ===
  app.get("/api/datasources/:dsId/models", (c) => {
    return c.json(listModels(c.req.param("dsId")));
  });

  app.post("/api/datasources/:dsId/models", async (c) => {
    const body = await c.req.json();
    const model = createModel({ datasource_id: c.req.param("dsId"), ...body });
    return c.json(model, 201);
  });

  app.put("/api/datasources/:dsId/models/:id", async (c) => {
    const body = await c.req.json();
    const updated = updateModel(c.req.param("id"), body);
    return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
  });

  app.delete("/api/datasources/:dsId/models/:id", (c) => {
    return deleteModel(c.req.param("id")) ? c.json({ success: true }) : c.json({ error: "Not found" }, 404);
  });

  // === AI Suggest Semantic ===
  app.post("/api/datasources/:dsId/ai-suggest-semantic", async (c) => {
    // Returns schema data for frontend/Agent to generate recommendations
    const dsId = c.req.param("dsId");
    try {
      const { discoverSchema } = await import("../mysql/discovery.js");
      const schemaInfo = await discoverSchema(dsId);
      return c.json({
        tables: schemaInfo.tables.map(t => ({
          name: t.table.name,
          comment: t.table.comment,
          columns: t.columns.map(c => `${c.name} (${c.type})`),
          foreignKeys: t.foreignKeys.map(fk => `${fk.columnName} → ${fk.referencedTable}.${fk.referencedColumn}`),
        })),
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  return app;
}