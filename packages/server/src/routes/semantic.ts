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
    const dsId = c.req.param("dsId");
    try {
      const { discoverSchema } = await import("../mysql/discovery.js");
      const schemaInfo = await discoverSchema(dsId);

      // Build schema context for the AI
      const tablesSummary = schemaInfo.tables.map(t => ({
        name: t.table.name,
        comment: t.table.comment || "",
        columns: t.columns.map(col => ({
          name: col.name,
          type: col.type,
          comment: col.comment || "",
          isPrimaryKey: col.isPrimaryKey,
        })),
        foreignKeys: t.foreignKeys.map(fk => `${fk.columnName} → ${fk.referencedTable}.${fk.referencedColumn}`),
      }));

      // Use DeepSeek API to generate semantic layer suggestions
      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      if (!deepseekKey) {
        return c.json({ error: "DeepSeek API key not configured. Set DEEPSEEK_API_KEY environment variable." }, 500);
      }

      const prompt = `You are a data analyst. Based on the following database schema, suggest semantic layer definitions.

Schema:
${JSON.stringify(tablesSummary, null, 2)}

Please analyze the schema and return a JSON object with three arrays: "metrics", "dimensions", and "models".

For metrics, include: name (snake_case), display_name (Chinese), description (Chinese), sql_expression (e.g. SUM(amount) or COUNT(*)), filters (JSON array, empty if none), dimensions (JSON array of dimension names), unit (e.g. "元", "个", "%"), category (e.g. "营收", "用户")

For dimensions, include: name (snake_case), display_name (Chinese), sql_expression (column name), data_type ("string"|"number"|"date")

For models, include: name (snake_case), description (Chinese), base_table, joins (JSON array like [{"table":"t2","on":"t1.id=t2.id","type":"left"}]), metrics (array of metric names), dimensions (array of dimension names)

Return ONLY valid JSON, no markdown formatting, no extra text. Example:
{"metrics":[{"name":"total_revenue","display_name":"总营收","description":"所有订单的总金额","sql_expression":"SUM(amount)","filters":"[]","dimensions":"[]","unit":"元","category":"营收"}],"dimensions":[{"name":"order_date","display_name":"订单日期","sql_expression":"order_date","data_type":"date"}],"models":[{"name":"order_analysis","description":"订单分析模型","base_table":"orders","joins":"[]","metrics":"[\"total_revenue\"]","dimensions":"[\"order_date\"]"}]}`;

      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: "You are a data analyst expert. Always respond with valid JSON only, no markdown." },
            { role: "user", content: prompt },
          ],
          max_tokens: 4096,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return c.json({ error: `DeepSeek API error: ${response.status} - ${errText}` }, 500);
      }

      const data = await response.json() as any;
      const rawContent = data.choices?.[0]?.message?.content || "";

      // Extract JSON from response (handle possible markdown wrapping)
      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      }

      let suggestions: { metrics?: any[]; dimensions?: any[]; models?: any[] };
      try {
        suggestions = JSON.parse(jsonStr);
      } catch {
        return c.json({ error: "Failed to parse AI response", raw: rawContent }, 500);
      }

      const created: { metrics: any[]; dimensions: any[]; models: any[] } = {
        metrics: [],
        dimensions: [],
        models: [],
      };

      // Create suggested metrics
      if (suggestions.metrics && Array.isArray(suggestions.metrics)) {
        for (const m of suggestions.metrics) {
          try {
            const metric = createMetric({
              datasource_id: dsId,
              name: m.name || `metric_${Date.now()}`,
              display_name: m.display_name || m.name,
              description: m.description || "",
              sql_expression: m.sql_expression || "",
              filters: typeof m.filters === "string" ? m.filters : JSON.stringify(m.filters || []),
              dimensions: typeof m.dimensions === "string" ? m.dimensions : JSON.stringify(m.dimensions || []),
              default_granularity: m.default_granularity || null,
              unit: m.unit || null,
              category: m.category || null,
              aliases: JSON.stringify([]),
              status: "draft",
              version: 1,
            });
            created.metrics.push(metric);
          } catch (e) { /* skip duplicates */ }
        }
      }

      // Create suggested dimensions
      if (suggestions.dimensions && Array.isArray(suggestions.dimensions)) {
        for (const d of suggestions.dimensions) {
          try {
            const dim = createDimension({
              datasource_id: dsId,
              name: d.name || `dim_${Date.now()}`,
              display_name: d.display_name || d.name,
              sql_expression: d.sql_expression || "",
              data_type: d.data_type || "string",
              hierarchy: null,
              values: null,
            });
            created.dimensions.push(dim);
          } catch (e) { /* skip duplicates */ }
        }
      }

      // Create suggested models
      if (suggestions.models && Array.isArray(suggestions.models)) {
        for (const mdl of suggestions.models) {
          try {
            const model = createModel({
              datasource_id: dsId,
              name: mdl.name || `model_${Date.now()}`,
              description: mdl.description || null,
              base_table: mdl.base_table || "",
              joins: typeof mdl.joins === "string" ? mdl.joins : JSON.stringify(mdl.joins || []),
              metrics: typeof mdl.metrics === "string" ? mdl.metrics : JSON.stringify(mdl.metrics || []),
              dimensions: typeof mdl.dimensions === "string" ? mdl.dimensions : JSON.stringify(mdl.dimensions || []),
            });
            created.models.push(model);
          } catch (e) { /* skip duplicates */ }
        }
      }

      return c.json({
        created,
        raw: jsonStr,
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  return app;
}