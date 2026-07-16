import { Hono } from "hono";
import { getInsightsStats, getTopQueries } from "../store.js";
import { executeSql } from "../mysql/executor.js";

export function createInsightsRoutes(): Hono {
  const app = new Hono();

  // GET stats: total queries, success rate, top table, daily trend
  app.get("/api/datasources/:dsId/insights/stats", (c) => {
    const dsId = c.req.param("dsId");
    return c.json(getInsightsStats(dsId));
  });

  // GET top queries: most-executed successful SQL queries
  app.get("/api/datasources/:dsId/insights/top-queries", (c) => {
    const dsId = c.req.param("dsId");
    const limit = parseInt(c.req.query("limit") || "10", 10);
    return c.json(getTopQueries(dsId, limit));
  });

  // POST execute: run a specific SQL and return results
  app.post("/api/datasources/:dsId/insights/execute", async (c) => {
    const dsId = c.req.param("dsId");
    const { sql } = await c.req.json();
    if (!sql || typeof sql !== "string") {
      return c.json({ error: "sql is required" }, 400);
    }
    try {
      const result = await executeSql(dsId, sql, { timeout: 30000, rowLimit: 500 });
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: err.message || "Query execution failed" }, 500);
    }
  });

  return app;
}
