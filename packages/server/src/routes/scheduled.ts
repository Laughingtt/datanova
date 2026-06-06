import { Hono } from "hono";
import {
  listScheduledQueries, getScheduledQuery, createScheduledQuery,
  updateScheduledQuery, deleteScheduledQuery, listAlerts, listExecutionHistory,
} from "../store.js";
import { registerScheduledQuery, unregisterScheduledQuery, executeScheduledQuery } from "../scheduler.js";

export function createScheduledRoutes(): Hono {
  const app = new Hono();

  app.get("/api/datasources/:dsId/scheduled-queries", (c) => {
    return c.json(listScheduledQueries(c.req.param("dsId")));
  });

  app.post("/api/datasources/:dsId/scheduled-queries", async (c) => {
    const body = await c.req.json();
    const sq = createScheduledQuery({
      datasource_id: c.req.param("dsId"),
      name: body.name,
      description: body.description,
      sql: body.sql,
      cron_expression: body.cron_expression,
      timezone: body.timezone ?? "UTC",
      enabled: body.enabled ?? 1,
      alert_conditions: body.alert_conditions ? JSON.stringify(body.alert_conditions) : null,
    });
    if (sq.enabled) registerScheduledQuery(sq);
    return c.json(sq, 201);
  });

  app.put("/api/datasources/:dsId/scheduled-queries/:id", async (c) => {
    const body = await c.req.json();
    const old = getScheduledQuery(c.req.param("id"));
    if (!old) return c.json({ error: "Not found" }, 404);
    unregisterScheduledQuery(c.req.param("id"));
    const updated = updateScheduledQuery(c.req.param("id"), {
      ...body,
      alert_conditions: body.alert_conditions ? JSON.stringify(body.alert_conditions) : undefined,
    });
    if (updated && updated.enabled) registerScheduledQuery(updated);
    return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
  });

  app.delete("/api/datasources/:dsId/scheduled-queries/:id", (c) => {
    unregisterScheduledQuery(c.req.param("id"));
    return deleteScheduledQuery(c.req.param("id")) ? c.json({ success: true }) : c.json({ error: "Not found" }, 404);
  });

  app.post("/api/datasources/:dsId/scheduled-queries/:id/execute", async (c) => {
    const sq = getScheduledQuery(c.req.param("id"));
    if (!sq) return c.json({ error: "Not found" }, 404);
    try {
      await executeScheduledQuery(sq.id, sq.datasource_id, sq.sql, sq.alert_conditions);
      const updated = getScheduledQuery(sq.id);
      return c.json(updated);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  app.get("/api/datasources/:dsId/scheduled-queries/:id/history", (c) => {
    return c.json(listExecutionHistory(c.req.param("id")));
  });

  app.get("/api/datasources/:dsId/query-alerts", (c) => {
    const since = c.req.query("since");
    return c.json(listAlerts(c.req.param("dsId"), since));
  });

  return app;
}