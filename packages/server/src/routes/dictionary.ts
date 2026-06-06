import { Hono } from "hono";
import {
  listMetrics, listDimensions, getAnnotations,
} from "../store.js";
import { discoverSchema } from "../mysql/discovery.js";

export function createDictionaryRoutes(): Hono {
  const app = new Hono();

  // Global search
  app.get("/api/datasources/:dsId/dictionary/search", async (c) => {
    const dsId = c.req.param("dsId");
    const q = (c.req.query("q") ?? "").toLowerCase();
    if (!q || q.length < 1) return c.json({ metrics: [], dimensions: [], tables: [], columns: [] });

    // Search metrics
    const metrics = listMetrics(dsId)
      .filter(m => m.status === "published")
      .filter(m => {
        const aliases = (() => { try { return JSON.parse(m.aliases) as string[]; } catch { return []; } })();
        return m.name.toLowerCase().includes(q) ||
          m.display_name.toLowerCase().includes(q) ||
          aliases.some(a => a.toLowerCase().includes(q)) ||
          m.description.toLowerCase().includes(q);
      })
      .map(m => ({ id: m.id, name: m.name, display_name: m.display_name, description: m.description, type: "metric" as const }));

    // Search dimensions
    const dimensions = listDimensions(dsId)
      .filter(d => {
        const values = (() => { try { return d.values ? JSON.parse(d.values!) as string[] : []; } catch { return []; } })();
        return d.name.toLowerCase().includes(q) ||
          d.display_name.toLowerCase().includes(q) ||
          values.some(v => v.toLowerCase().includes(q));
      })
      .map(d => ({ id: d.id, name: d.name, display_name: d.display_name, type: "dimension" as const }));

    // P4-C5: Search annotations AND schema for tables/columns
    const annotations = getAnnotations(dsId);
    const tableMatches = annotations
      .filter(a => !a.field_name && a.status === "confirmed" && (a.annotation.toLowerCase().includes(q) || a.table_name.toLowerCase().includes(q)))
      .map(a => ({ table_name: a.table_name, annotation: a.annotation, type: "table" as const }));

    const columnMatches = annotations
      .filter(a => a.field_name && a.status === "confirmed" && (a.annotation.toLowerCase().includes(q) || a.field_name.toLowerCase().includes(q)))
      .map(a => ({ table_name: a.table_name, field_name: a.field_name, annotation: a.annotation, type: "column" as const }));

    // Also search table names directly from schema if no annotation matches
    if (tableMatches.length === 0) {
      try {
        const schemaInfo = await discoverSchema(dsId);
        for (const t of schemaInfo.tables) {
          if (t.table.name.toLowerCase().includes(q) && !tableMatches.some(m => m.table_name === t.table.name)) {
            tableMatches.push({ table_name: t.table.name, annotation: t.table.comment ?? "", type: "table" as const });
          }
        }
      } catch { /* skip if schema discovery fails */ }
    }

    return c.json({ metrics, dimensions, tables: tableMatches, columns: columnMatches });
  });

  // Table detail
  app.get("/api/datasources/:dsId/dictionary/tables/:tableName", async (c) => {
    const dsId = c.req.param("dsId");
    const tableName = c.req.param("tableName");
    try {
      const schemaInfo = await discoverSchema(dsId, [tableName]);
      const annotations = getAnnotations(dsId).filter(a => a.table_name === tableName);
      const relatedMetrics = listMetrics(dsId).filter(m => {
        return m.sql_expression.toLowerCase().includes(tableName.toLowerCase()) || m.status === "published";
      }).filter(m => m.sql_expression.toLowerCase().includes(tableName.toLowerCase()));

      return c.json({
        table: schemaInfo.tables[0] ?? null,
        annotations,
        relatedMetrics: relatedMetrics.map(m => ({ id: m.id, name: m.name, display_name: m.display_name })),
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // Recent changes
  app.get("/api/datasources/:dsId/dictionary/recent-changes", (c) => {
    const dsId = c.req.param("dsId");
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const recentAnnotations = getAnnotations(dsId).filter(a => a.updated_at >= sevenDaysAgo);
    const recentMetrics = listMetrics(dsId).filter(m => m.updated_at >= sevenDaysAgo);
    const recentDimensions = listDimensions(dsId).filter(d => d.updated_at >= sevenDaysAgo);

    return c.json({ annotations: recentAnnotations, metrics: recentMetrics, dimensions: recentDimensions });
  });

  return app;
}