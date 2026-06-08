import { Hono } from "hono";
import {
  listScheduledQueries, getScheduledQuery, createScheduledQuery,
  updateScheduledQuery, deleteScheduledQuery, listAlerts, listExecutionHistory,
} from "../store.js";
import { registerScheduledQuery, unregisterScheduledQuery, executeScheduledQuery } from "../scheduler.js";
import { discoverSchema, formatSchemaForPrompt } from "../mysql/discovery.js";
import { getAnnotations, listQueryExamples } from "../store.js";

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

  // AI-assisted SQL generation endpoint
  app.post("/api/datasources/:dsId/scheduled-queries/generate-sql", async (c) => {
    try {
      const body = await c.req.json();
      const { prompt } = body;
      const dsId = c.req.param("dsId");

      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return c.json({ error: "A prompt describing the query is required" }, 400);
      }

      // Discover schema for context
      const schema = await discoverSchema(dsId);
      const annotations = getAnnotations(dsId);
      const queryExamples = listQueryExamples(dsId);
      const schemaContext = formatSchemaForPrompt(schema, annotations, queryExamples);

      // Build the LLM prompt
      const llmPrompt = `You are a SQL expert. Generate a valid MySQL SELECT query based on the user's request.

${schemaContext}

User request: ${prompt.trim()}

Return ONLY the SQL query, no explanation, no markdown formatting. End with a semicolon.`;

      // Call LLM API using fetch
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const baseUrl = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
      const modelId = process.env.DATANOVA_MODEL || "claude-sonnet-4-6";

      if (!apiKey) {
        return c.json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);
      }

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 4096,
          messages: [{ role: "user", content: llmPrompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return c.json({ error: `LLM API error: ${response.status} - ${errText}` }, 500);
      }

      const result = await response.json() as any;
      let sql = "";
      if (result.content) {
        sql = result.content
          .filter((block: any) => block.type === "text")
          .map((block: any) => block.text)
          .join("\n")
          .trim();
      }

      // Clean up: remove markdown code blocks if present
      sql = sql.replace(/^```sql\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      // Remove trailing semicolons for style, the executor handles both
      sql = sql.replace(/;\s*$/, "");

      return c.json({ sql });
    } catch (err) {
      return c.json({ error: `Failed to generate SQL: ${(err as Error).message}` }, 500);
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