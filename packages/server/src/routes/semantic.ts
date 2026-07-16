import { Hono } from "hono";
import { normalizeSql } from "../agent/tools/sql-normalize.js";
import {
  listMetrics, getMetric, createMetric, updateMetric, deleteMetric,
  listDimensions, createDimension, updateDimension, deleteDimension,
  listModels, createModel, updateModel, deleteModel,
  getAnnotations, upsertAnnotation,
} from "../store.js";
import { executeSql, validateSqlViaExplain } from "../mysql/executor.js";
import { discoverSchema } from "../mysql/discovery.js";
import mysql from "mysql2";

export function createSemanticRoutes(): Hono {
  const app = new Hono();

  // Helper to validate dimension sql_expression
  async function validateDimensionSql(dsId: string, sqlExpression: string): Promise<{ valid: true } | { valid: false; error: string }> {
    const models = (() => { try { return listModels(dsId); } catch { return []; } })();
    if (models.length === 0) {
      // No models available, skip validation
      return { valid: true };
    }
    const baseTable = models[0].base_table;
    const wrappedSql = `SELECT ${sqlExpression} AS dim_test FROM ${baseTable} LIMIT 1`;
    return validateSqlViaExplain(dsId, wrappedSql);
  }

  // === Metrics ===
  app.get("/api/datasources/:dsId/metrics", (c) => {
    return c.json(listMetrics(c.req.param("dsId")));
  });

  app.post("/api/datasources/:dsId/metrics", async (c) => {
    const dsId = c.req.param("dsId");
    const body = await c.req.json();

    // Normalize SQL — fix keyword粘连 before validation
    if (body.sql && typeof body.sql === "string") {
      body.sql = normalizeSql(body.sql);
    }

    // EXPLAIN validation for metric SQL
    if (body.sql) {
      const validation = await validateSqlViaExplain(dsId, body.sql);
      if (!validation.valid) {
        // Allow saving as draft even if datasource is unavailable
        const isConnectionError = validation.error.includes("连接池不可用") ||
          validation.error.includes("ECONNREFUSED") ||
          validation.error.includes("ETIMEDOUT");
        if (!isConnectionError || body.status !== 'draft') {
          return c.json({ error: `SQL 验证失败: ${validation.error}` }, 400);
        }
      }
    }

    const metric = createMetric({
      datasource_id: dsId,
      aliases: "[]",
      created_by: "manual",
      agent_session_id: null,
      validation_status: "unvalidated",
      validation_result: null,
      ...body,
    });
    return c.json(metric, 201);
  });

  app.put("/api/datasources/:dsId/metrics/:id", async (c) => {
    const dsId = c.req.param("dsId");
    const id = c.req.param("id");
    const body = await c.req.json();

    // Normalize SQL — fix keyword粘连 before validation
    if (body.sql && typeof body.sql === "string") {
      body.sql = normalizeSql(body.sql);
    }

    // EXPLAIN validation only when sql is being updated
    if (body.sql) {
      const validation = await validateSqlViaExplain(dsId, body.sql);
      if (!validation.valid) {
        const isConnectionError = validation.error.includes("连接池不可用") ||
          validation.error.includes("ECONNREFUSED") ||
          validation.error.includes("ETIMEDOUT");
        const currentMetric = getMetric(id);
        if (!isConnectionError || (currentMetric?.status !== 'draft' && body.status !== 'draft')) {
          return c.json({ error: `SQL 验证失败: ${validation.error}` }, 400);
        }
      }
    }

    const updated = updateMetric(id, body);
    return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
  });

  app.delete("/api/datasources/:dsId/metrics/:id", (c) => {
    return deleteMetric(c.req.param("id")) ? c.json({ success: true }) : c.json({ error: "Not found" }, 404);
  });

  app.post("/api/datasources/:dsId/metrics/:id/test", async (c) => {
    const dsId = c.req.param("dsId");
    const metricId = c.req.param("id");
    const metric = getMetric(metricId);
    if (!metric || metric.datasource_id !== dsId) {
      return c.json({ error: "Metric not found" }, 404);
    }

    try {
      // Directly execute the metric's full SQL with LIMIT
      const testSql = metric.sql.trim().replace(/;?\s*$/, "") + " LIMIT 10";
      const result = await executeSql(dsId, testSql, { timeout: 5000, rowLimit: 10 });
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
    const dsId = c.req.param("dsId");
    const body = await c.req.json();

    // EXPLAIN validation for dimension sql_expression
    if (body.sql_expression) {
      const validation = await validateDimensionSql(dsId, body.sql_expression);
      if (!validation.valid) {
        const isConnectionError = validation.error.includes("连接池不可用") ||
          validation.error.includes("ECONNREFUSED") ||
          validation.error.includes("ETIMEDOUT");
        if (!isConnectionError || body.status !== 'draft') {
          return c.json({ error: `维度 SQL 验证失败: ${validation.error}` }, 400);
        }
      }
    }

    const dim = createDimension({
      datasource_id: dsId,
      created_by: "manual",
      agent_session_id: null,
      ...body,
    });
    return c.json(dim, 201);
  });

  app.put("/api/datasources/:dsId/dimensions/:id", async (c) => {
    const dsId = c.req.param("dsId");
    const id = c.req.param("id");
    const body = await c.req.json();

    // EXPLAIN validation only when sql_expression is being updated
    if (body.sql_expression) {
      const validation = await validateDimensionSql(dsId, body.sql_expression);
      if (!validation.valid) {
        const isConnectionError = validation.error.includes("连接池不可用") ||
          validation.error.includes("ECONNREFUSED") ||
          validation.error.includes("ETIMEDOUT");
        if (!isConnectionError || body.status !== 'draft') {
          return c.json({ error: `维度 SQL 验证失败: ${validation.error}` }, 400);
        }
      }
    }

    const updated = updateDimension(id, body);
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
  app.post('/api/datasources/:dsId/ai-suggest-semantic', async (c) => {
    const dsId = c.req.param('dsId');
    try {
      const body = await c.req.json().catch(() => ({}));
      const tableNames: string[] = body.tableNames || [];
      const schemaInfo = await discoverSchema(dsId);

      let tables = schemaInfo.tables;
      if (tableNames.length > 0) {
        tables = tables.filter((t: any) => tableNames.includes(t.table.name));
      }

      const tablesWithSamples = [];
      for (const t of tables) {
        let sampleRows: any[] = [];
        try {
          const sampleResult = await executeSql(dsId, 'SELECT * FROM ' + t.table.name + ' LIMIT 5', { timeout: 5000, rowLimit: 5 });
          sampleRows = sampleResult.rows || [];
        } catch { /* skip if table not queryable */ }
        tablesWithSamples.push({
          name: t.table.name,
          comment: t.table.comment || '',
          columns: t.columns.map((col: any) => ({
            name: col.name,
            type: col.type,
            comment: col.comment || '',
            isPrimaryKey: col.isPrimaryKey,
          })),
          foreignKeys: t.foreignKeys.map((fk: any) => fk.columnName + ' -> ' + fk.referencedTable + '.' + fk.referencedColumn),
          sampleData: sampleRows,
        });
      }

      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      if (!deepseekKey) {
        return c.json({ error: 'DeepSeek API key not configured. Set DEEPSEEK_API_KEY environment variable.' }, 500);
      }

      const prompt = 'You are a data analyst. Based on the following database schema and sample data, suggest semantic layer definitions.\n\nSchema with sample data:\n' + JSON.stringify(tablesWithSamples, null, 2) + '\n\nPlease analyze the schema and return a JSON object with three arrays: metrics, dimensions, and models.\n\nFor metrics, include:\n- name (snake_case), display_name (Chinese), description (Chinese)\n- sql: a COMPLETE executable SQL statement (e.g. "SELECT SUM(amount) AS revenue FROM orders")\n- metric_type: "atomic" (single aggregation like SUM/COUNT), "derived" (ratio/difference like AVG, percentage), or "compound" (window functions, CTE)\n- business_context: business description of what this metric measures\n- calculation_logic: how the metric is calculated\n- applicable_scenarios: when to use this metric\n- data_quality_notes: any data quality caveats\n- default_sort: default sort expression (e.g. "revenue DESC") or null\n- dimensions (JSON array of dimension names), unit (e.g. yuan, ge, %), category (e.g. yingshou, yonghu)\n\nFor dimensions, include:\n- name (snake_case), display_name (Chinese), sql_expression (column name or expression), data_type (string|number|date)\n- description (Chinese, brief)\n- grain: time granularity if date dimension (day|week|month|quarter|year) or null\n- date_column: source date column (e.g. "orders.created_at") or null\n\nFor models, include: name (snake_case), description (Chinese), base_table, joins (JSON array like [{table:t2,on:t1.id=t2.id,type:left}]), metrics (array of metric names), dimensions (array of dimension names)\n\nReturn ONLY valid JSON, no markdown formatting, no extra text.';

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + deepseekKey,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a data analyst expert. Always respond with valid JSON only, no markdown. All display_name and description fields must be in Simplified Chinese.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4096,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return c.json({ error: 'DeepSeek API error: ' + response.status + ' - ' + errText }, 500);
      }

      const data = await response.json() as any;
      const rawContent = data.choices?.[0]?.message?.content || '';

      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }

      let suggestions: { metrics?: any[]; dimensions?: any[]; models?: any[] };
      try {
        suggestions = JSON.parse(jsonStr);
      } catch {
        return c.json({ error: 'Failed to parse AI response', raw: rawContent }, 500);
      }

      const created: { metrics: any[]; dimensions: any[]; models: any[] } = {
        metrics: [],
        dimensions: [],
        models: [],
      };

      if (suggestions.metrics && Array.isArray(suggestions.metrics)) {
        for (const m of suggestions.metrics) {
          try {
            const metric = createMetric({
              datasource_id: dsId,
              name: m.name || 'metric_' + Date.now(),
              display_name: m.display_name || m.name,
              description: m.description || '',
              sql: m.sql || '',
              dimensions: typeof m.dimensions === 'string' ? m.dimensions : JSON.stringify(m.dimensions || []),
              default_granularity: m.default_granularity || null,
              unit: m.unit || null,
              category: m.category || null,
              aliases: JSON.stringify(m.aliases || []),
              metric_type: m.metric_type || 'atomic',
              business_context: m.business_context || '',
              calculation_logic: m.calculation_logic || '',
              applicable_scenarios: m.applicable_scenarios || '',
              data_quality_notes: m.data_quality_notes || '',
              default_sort: m.default_sort || null,
              status: 'draft',
              version: 1,
              created_by: 'ai_suggest',
              agent_session_id: null,
              validation_status: 'unvalidated',
              validation_result: null,
            });
            created.metrics.push(metric);
          } catch (e) { /* skip duplicates */ }
        }
      }

      if (suggestions.dimensions && Array.isArray(suggestions.dimensions)) {
        for (const d of suggestions.dimensions) {
          try {
            const dim = createDimension({
              datasource_id: dsId,
              name: d.name || 'dim_' + Date.now(),
              display_name: d.display_name || d.name,
              sql_expression: d.sql_expression || '',
              data_type: d.data_type || 'string',
              hierarchy: null,
              values: null,
              description: d.description || '',
              grain: d.grain || null,
              date_column: d.date_column || null,
              status: 'draft',
              is_enum_dict: false,
              created_by: 'ai_suggest',
              agent_session_id: null,
            });
            created.dimensions.push(dim);
          } catch (e) { /* skip duplicates */ }
        }
      }

      if (suggestions.models && Array.isArray(suggestions.models)) {
        for (const mdl of suggestions.models) {
          try {
            const model = createModel({
              datasource_id: dsId,
              name: mdl.name || 'model_' + Date.now(),
              description: mdl.description || null,
              base_table: mdl.base_table || '',
              joins: typeof mdl.joins === 'string' ? mdl.joins : JSON.stringify(mdl.joins || []),
              metrics: typeof mdl.metrics === 'string' ? mdl.metrics : JSON.stringify(mdl.metrics || []),
              dimensions: typeof mdl.dimensions === 'string' ? mdl.dimensions : JSON.stringify(mdl.dimensions || []),
              status: 'draft',
            });
            created.models.push(model);
          } catch (e) { /* skip duplicates */ }
        }
      }

      return c.json({ created, raw: jsonStr });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // === AI Suggest Dimensions ===
  app.post('/api/datasources/:dsId/ai-suggest-dimensions', async (c) => {
    const dsId = c.req.param('dsId');
    try {
      const body = await c.req.json().catch(() => ({}));
      const tableNames: string[] = body.tableNames || [];
      const schemaInfo = await discoverSchema(dsId);

      let tables = schemaInfo.tables;
      if (tableNames.length > 0) {
        tables = tables.filter((t: any) => tableNames.includes(t.table.name));
      }

      const tablesWithSamples = [];
      for (const t of tables) {
        let sampleRows: any[] = [];
        try {
          const sampleResult = await executeSql(dsId, 'SELECT * FROM ' + t.table.name + ' LIMIT 5', { timeout: 5000, rowLimit: 5 });
          sampleRows = sampleResult.rows || [];
        } catch { /* skip */ }
        tablesWithSamples.push({
          name: t.table.name,
          comment: t.table.comment || '',
          columns: t.columns.map((col: any) => ({
            name: col.name,
            type: col.type,
            comment: col.comment || '',
            isPrimaryKey: col.isPrimaryKey,
          })),
          sampleData: sampleRows,
        });
      }

      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      if (!deepseekKey) {
        return c.json({ error: 'DeepSeek API key not configured.' }, 500);
      }

      const prompt = 'You are a data analyst. Based on the following database schema and sample data, suggest dimension definitions for data analytics.\n\nSchema with sample data:\n' + JSON.stringify(tablesWithSamples, null, 2) + '\n\nAnalyze each table and identify columns that can serve as useful dimensions for filtering, grouping, or drill-down in reports. Return a JSON object with a dimensions array.\n\nFor each dimension include:\n- name (snake_case), display_name (Chinese), sql_expression (column name or expression), data_type (string|number|date)\n- description (Chinese, brief)\n- grain: time granularity if date dimension (day|week|month|quarter|year) or null\n- date_column: source date column (e.g. "orders.created_at") or null\n\nReturn ONLY valid JSON, no markdown formatting, no extra text.';

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + deepseekKey,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a data analyst expert. Always respond with valid JSON only, no markdown. All display_name and description fields must be in Simplified Chinese.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4096,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return c.json({ error: 'DeepSeek API error: ' + response.status + ' - ' + errText }, 500);
      }

      const data = await response.json() as any;
      const rawContent = data.choices?.[0]?.message?.content || '';

      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }

      let suggestions: { dimensions?: any[] };
      try {
        suggestions = JSON.parse(jsonStr);
      } catch {
        return c.json({ error: 'Failed to parse AI response', raw: rawContent }, 500);
      }

      const created: { dimensions: any[] } = { dimensions: [] };

      if (suggestions.dimensions && Array.isArray(suggestions.dimensions)) {
        for (const d of suggestions.dimensions) {
          try {
            const dim = createDimension({
              datasource_id: dsId,
              name: d.name || 'dim_' + Date.now(),
              display_name: d.display_name || d.name,
              sql_expression: d.sql_expression || '',
              data_type: d.data_type || 'string',
              hierarchy: null,
              values: null,
              description: d.description || '',
              grain: d.grain || null,
              date_column: d.date_column || null,
              status: 'draft',
              is_enum_dict: false,
              created_by: 'ai_suggest',
              agent_session_id: null,
            });
            created.dimensions.push(dim);
          } catch (e) { /* skip duplicates */ }
        }
      }

      return c.json({ created, raw: jsonStr });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // === AI Preview (returns suggestions without creating) ===
  app.post('/api/datasources/:dsId/ai-preview-semantic', async (c) => {
    const dsId = c.req.param('dsId');
    try {
      const body = await c.req.json().catch(() => ({}));
      const tableNames: string[] = body.tableNames || [];
      const schemaInfo = await discoverSchema(dsId);
      let tables = schemaInfo.tables;
      if (tableNames.length > 0) tables = tables.filter((t: any) => tableNames.includes(t.table.name));
      const tablesWithSamples = [];
      for (const t of tables) {
        let sampleRows: any[] = [];
        try { const r = await executeSql(dsId, 'SELECT * FROM ' + t.table.name + ' LIMIT 5', { timeout: 5000, rowLimit: 5 }); sampleRows = r.rows || []; } catch {}
        tablesWithSamples.push({ name: t.table.name, comment: t.table.comment || '', columns: t.columns.map((col: any) => ({ name: col.name, type: col.type, comment: col.comment || '', isPrimaryKey: col.isPrimaryKey })), foreignKeys: t.foreignKeys.map((fk: any) => fk.columnName + ' -> ' + fk.referencedTable + '.' + fk.referencedColumn), sampleData: sampleRows });
      }
      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      if (!deepseekKey) return c.json({ error: 'DeepSeek API key not configured.' }, 500);
      const prompt = 'You are a data analyst. Based on the following database schema and sample data, suggest semantic layer definitions.\n\nSchema with sample data:\n' + JSON.stringify(tablesWithSamples, null, 2) + '\n\nPlease analyze the schema and return a JSON object with three arrays: metrics, dimensions, and models.\n\nFor metrics, include:\n- name (snake_case), display_name (Chinese), description (Chinese)\n- sql: a COMPLETE executable SQL statement (e.g. "SELECT SUM(amount) AS revenue FROM orders")\n- metric_type: "atomic" (single aggregation), "derived" (ratio/difference), or "compound" (window functions/CTE)\n- business_context, calculation_logic, applicable_scenarios, data_quality_notes\n- default_sort: default sort expression or null\n- dimensions (JSON array of dimension names), unit, category\n\nFor dimensions, include:\n- name (snake_case), display_name (Chinese), sql_expression (column name or expression), data_type (string|number|date)\n- description (Chinese, brief)\n- grain: time granularity if date dimension (day|week|month|quarter|year) or null\n- date_column: source date column or null\n\nFor models, include: name (snake_case), description (Chinese), base_table, joins (JSON array), metrics (array of metric names), dimensions (array of dimension names)\n\nReturn ONLY valid JSON, no markdown formatting, no extra text.';
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + deepseekKey }, body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: 'You are a data analyst expert. Always respond with valid JSON only, no markdown. All display_name and description fields must be in Simplified Chinese.' }, { role: 'user', content: prompt }], max_tokens: 4096, temperature: 0.3 }) });
      if (!response.ok) { const errText = await response.text(); return c.json({ error: 'DeepSeek API error: ' + response.status + ' - ' + errText }, 500); }
      const data = await response.json() as any;
      const rawContent = data.choices?.[0]?.message?.content || '';
      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith('```')) { jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, ''); }
      let suggestions: { metrics?: any[]; dimensions?: any[]; models?: any[] };
      try { suggestions = JSON.parse(jsonStr); } catch { return c.json({ error: 'Failed to parse AI response', raw: rawContent }, 500); }
      return c.json({ suggestions });
    } catch (err) { return c.json({ error: (err as Error).message }, 500); }
  });

  app.post('/api/datasources/:dsId/ai-preview-dimensions', async (c) => {
    const dsId = c.req.param('dsId');
    try {
      const body = await c.req.json().catch(() => ({}));
      const tableNames: string[] = body.tableNames || [];
      const schemaInfo = await discoverSchema(dsId);
      let tables = schemaInfo.tables;
      if (tableNames.length > 0) tables = tables.filter((t: any) => tableNames.includes(t.table.name));
      const tablesWithSamples = [];
      for (const t of tables) {
        let sampleRows: any[] = [];
        try { const r = await executeSql(dsId, 'SELECT * FROM ' + t.table.name + ' LIMIT 5', { timeout: 5000, rowLimit: 5 }); sampleRows = r.rows || []; } catch {}
        tablesWithSamples.push({ name: t.table.name, comment: t.table.comment || '', columns: t.columns.map((col: any) => ({ name: col.name, type: col.type, comment: col.comment || '', isPrimaryKey: col.isPrimaryKey })), sampleData: sampleRows });
      }
      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      if (!deepseekKey) return c.json({ error: 'DeepSeek API key not configured.' }, 500);
      const prompt = 'You are a data analyst. Based on the following database schema and sample data, suggest dimension definitions for data analytics.\n\nSchema with sample data:\n' + JSON.stringify(tablesWithSamples, null, 2) + '\n\nAnalyze each table and identify columns that can serve as useful dimensions for filtering, grouping, or drill-down in reports. Return a JSON object with a dimensions array.\n\nFor each dimension include:\n- name (snake_case), display_name (Chinese), sql_expression (column name or expression), data_type (string|number|date)\n- description (Chinese, brief)\n- grain: time granularity if date dimension (day|week|month|quarter|year) or null\n- date_column: source date column or null\n\nReturn ONLY valid JSON, no markdown formatting, no extra text.';
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + deepseekKey }, body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: 'You are a data analyst expert. Always respond with valid JSON only, no markdown. All display_name and description fields must be in Simplified Chinese.' }, { role: 'user', content: prompt }], max_tokens: 4096, temperature: 0.3 }) });
      if (!response.ok) { const errText = await response.text(); return c.json({ error: 'DeepSeek API error: ' + response.status + ' - ' + errText }, 500); }
      const data = await response.json() as any;
      const rawContent = data.choices?.[0]?.message?.content || '';
      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith('```')) { jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, ''); }
      let suggestions: { dimensions?: any[] };
      try { suggestions = JSON.parse(jsonStr); } catch { return c.json({ error: 'Failed to parse AI response', raw: rawContent }, 500); }
      return c.json({ suggestions });
    } catch (err) { return c.json({ error: (err as Error).message }, 500); }
  });

  // === Bulk Import Metrics ===
  app.post('/api/datasources/:dsId/bulk-import-metrics', async (c) => {
    const dsId = c.req.param('dsId');
    try {
      const body = await c.req.json();
      const content: string = body.content || '';
      const contentType: string = body.contentType || 'description';

      if (!content.trim()) {
        return c.json({ error: '请提供内容' }, 400);
      }

      const schemaInfo = await discoverSchema(dsId);
      const tablesSummary = schemaInfo.tables.map((t: any) => ({
        name: t.table.name,
        comment: t.table.comment || '',
        columns: t.columns.map((col: any) => ({
          name: col.name,
          type: col.type,
          comment: col.comment || '',
          isPrimaryKey: col.isPrimaryKey,
        })),
        foreignKeys: t.foreignKeys.map((fk: any) => fk.columnName + ' -> ' + fk.referencedTable + '.' + fk.referencedColumn),
      }));

      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      if (!deepseekKey) {
        return c.json({ error: 'DeepSeek API key not configured.' }, 500);
      }

      const contentTypeLabel = contentType === 'sql' ? 'SQL' : contentType === 'document' ? '文档' : '业务描述';

      const prompt = 'You are a data analyst. A user wants to import metrics and dimensions into a data analytics system.\n\nUser provided ' + contentTypeLabel + ':\n---\n' + content + '\n---\n\nAvailable database schema:\n' + JSON.stringify(tablesSummary, null, 2) + '\n\nBased on the user input and the available schema, generate suitable metrics and dimensions.\n\nFor metrics: name (snake_case), display_name (Chinese), description (Chinese), sql (COMPLETE executable SQL), metric_type (atomic|derived|compound), business_context, calculation_logic, applicable_scenarios, data_quality_notes, default_sort, dimensions (JSON array of dimension names), unit, category\nFor dimensions: name (snake_case), display_name (Chinese), sql_expression, data_type (string|number|date), description (Chinese), grain (day|week|month|quarter|year or null), date_column (source date column or null)\n\nReturn ONLY valid JSON, no markdown formatting.';

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + deepseekKey,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a data analyst expert. Always respond with valid JSON only, no markdown. All display_name and description fields must be in Simplified Chinese.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4096,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return c.json({ error: 'DeepSeek API error: ' + response.status + ' - ' + errText }, 500);
      }

      const respData = await response.json() as any;
      const rawContent = respData.choices?.[0]?.message?.content || '';

      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }

      let suggestions: { metrics?: any[]; dimensions?: any[] };
      try {
        suggestions = JSON.parse(jsonStr);
      } catch {
        return c.json({ error: 'Failed to parse AI response', raw: rawContent }, 500);
      }

      const created: { metrics: any[]; dimensions: any[] } = { metrics: [], dimensions: [] };

      if (suggestions.metrics && Array.isArray(suggestions.metrics)) {
        for (const m of suggestions.metrics) {
          try {
            const metric = createMetric({
              datasource_id: dsId,
              name: m.name || 'metric_' + Date.now(),
              display_name: m.display_name || m.name,
              description: m.description || '',
              sql: m.sql || '',
              dimensions: typeof m.dimensions === 'string' ? m.dimensions : JSON.stringify(m.dimensions || []),
              default_granularity: m.default_granularity || null,
              unit: m.unit || null,
              category: m.category || null,
              aliases: JSON.stringify(m.aliases || []),
              metric_type: m.metric_type || 'atomic',
              business_context: m.business_context || '',
              calculation_logic: m.calculation_logic || '',
              applicable_scenarios: m.applicable_scenarios || '',
              data_quality_notes: m.data_quality_notes || '',
              default_sort: m.default_sort || null,
              status: 'draft',
              version: 1,
              created_by: 'ai_suggest',
              agent_session_id: null,
              validation_status: 'unvalidated',
              validation_result: null,
            });
            created.metrics.push(metric);
          } catch (e) { /* skip */ }
        }
      }

      if (suggestions.dimensions && Array.isArray(suggestions.dimensions)) {
        for (const d of suggestions.dimensions) {
          try {
            const dim = createDimension({
              datasource_id: dsId,
              name: d.name || 'dim_' + Date.now(),
              display_name: d.display_name || d.name,
              sql_expression: d.sql_expression || '',
              data_type: d.data_type || 'string',
              hierarchy: null,
              values: null,
              description: d.description || '',
              grain: d.grain || null,
              date_column: d.date_column || null,
              status: 'draft',
              is_enum_dict: false,
              created_by: 'ai_suggest',
              agent_session_id: null,
            });
            created.dimensions.push(dim);
          } catch (e) { /* skip */ }
        }
      }

      return c.json({ created, raw: jsonStr });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // === Batch Create from AI Suggestions ===
  app.post('/api/datasources/:dsId/batch-create-suggestions', async (c) => {
    const dsId = c.req.param('dsId');
    try {
      const body = await c.req.json();
      const created: { metrics: any[]; dimensions: any[]; models: any[] } = { metrics: [], dimensions: [], models: [] };

      if (body.metrics && Array.isArray(body.metrics)) {
        for (const m of body.metrics) {
          try {
            const metric = createMetric({
              datasource_id: dsId,
              name: m.name || 'metric_' + Date.now(),
              display_name: m.display_name || m.name,
              description: m.description || '',
              sql: m.sql || m.sql_expression || '',
              dimensions: typeof m.dimensions === 'string' ? m.dimensions : JSON.stringify(m.dimensions || []),
              default_granularity: m.default_granularity || null,
              unit: m.unit || null,
              category: m.category || null,
              aliases: JSON.stringify(m.aliases || []),
              metric_type: m.metric_type || 'atomic',
              business_context: m.business_context || '',
              calculation_logic: m.calculation_logic || '',
              applicable_scenarios: m.applicable_scenarios || '',
              data_quality_notes: m.data_quality_notes || '',
              default_sort: m.default_sort || null,
              status: 'draft',
              version: 1,
              created_by: 'ai_suggest',
              agent_session_id: null,
              validation_status: 'unvalidated',
              validation_result: null,
            });
            created.metrics.push(metric);
          } catch (e) { /* skip duplicates */ }
        }
      }

      if (body.dimensions && Array.isArray(body.dimensions)) {
        for (const d of body.dimensions) {
          try {
            const dim = createDimension({
              datasource_id: dsId,
              name: d.name || 'dim_' + Date.now(),
              display_name: d.display_name || d.name,
              sql_expression: d.sql_expression || '',
              data_type: d.data_type || 'string',
              hierarchy: null,
              values: null,
              description: d.description || '',
              grain: d.grain || null,
              date_column: d.date_column || null,
              status: 'draft',
              is_enum_dict: false,
              created_by: 'ai_suggest',
              agent_session_id: null,
            });
            created.dimensions.push(dim);
          } catch (e) { /* skip duplicates */ }
        }
      }

      if (body.models && Array.isArray(body.models)) {
        for (const mdl of body.models) {
          try {
            const model = createModel({
              datasource_id: dsId,
              name: mdl.name || 'model_' + Date.now(),
              description: mdl.description || null,
              base_table: mdl.base_table || '',
              joins: typeof mdl.joins === 'string' ? mdl.joins : JSON.stringify(mdl.joins || []),
              metrics: typeof mdl.metrics === 'string' ? mdl.metrics : JSON.stringify(mdl.metrics || []),
              dimensions: typeof mdl.dimensions === 'string' ? mdl.dimensions : JSON.stringify(mdl.dimensions || []),
              status: 'draft',
            });
            created.models.push(model);
          } catch (e) { /* skip duplicates */ }
        }
      }

      return c.json({ created });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // === Validate and Test Metric SQL ===
  app.post("/api/datasources/:dsId/metrics/validate-and-test", async (c) => {
    const dsId = c.req.param("dsId");
    try {
      const body = await c.req.json();
      const sql: string = body.sql;

      if (!sql) {
        return c.json({ error: "SQL is required" }, 400);
      }

      // Step 1: EXPLAIN validation
      const explainResult = await validateSqlViaExplain(dsId, sql);
      if (!explainResult.valid) {
        return c.json({
          valid: false,
          errors: [{ step: "语法验证", message: explainResult.error }],
        });
      }

      // Step 2: Execute with LIMIT
      let testRows: any[] = [];
      let rowCount = 0;
      try {
        const testSql = sql.trim().replace(/;?\s*$/, "") + " LIMIT 10";
        const result = await executeSql(dsId, testSql, { timeout: 10000, rowLimit: 10 });
        testRows = result.rows || [];
        rowCount = testRows.length;
      } catch (err) {
        return c.json({
          valid: false,
          errors: [{ step: "执行测试", message: (err as Error).message }],
        });
      }

      return c.json({
        valid: true,
        test_result: {
          row_count: rowCount,
          sample_rows: testRows.slice(0, 3),
        },
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // === Enum Dictionary ===

  // List all enum dictionary entries (from dimensions + schema annotations)
  app.get("/api/datasources/:dsId/dictionary/enums", (c) => {
    const dsId = c.req.param("dsId");
    const entries: Array<{
      source: "dimension" | "annotation";
      id: string;
      name: string;
      display_name: string;
      table_name?: string;
      field_name?: string;
      data_type?: string;
      values: Array<{ key: string; value: string }>;
    }> = [];

    // From dimensions with is_enum_dict=true and values
    const dims = listDimensions(dsId).filter(d => d.is_enum_dict && d.values);
    for (const d of dims) {
      let parsed: Array<{ key: string; value: string }> = [];
      try {
        const raw = JSON.parse(d.values!);
        if (Array.isArray(raw)) {
          if (raw.length > 0 && typeof raw[0] === "object" && raw[0].key !== undefined) {
            // New format: [{key, value}, ...]
            parsed = raw.map((item: any) => ({ key: String(item.key), value: String(item.value ?? item.key) }));
          } else {
            // Old format: ["north", "south", ...] → key=value
            parsed = raw.map((v: any) => ({ key: String(v), value: String(v) }));
          }
        }
      } catch { /* skip invalid JSON */ }
      entries.push({
        source: "dimension",
        id: d.id,
        name: d.name,
        display_name: d.display_name || d.name,
        data_type: d.data_type,
        values: parsed,
      });
    }

    // From schema annotations with domain_type === "enum"
    const annotations = getAnnotations(dsId).filter(a => a.domain_type === "enum" && a.domain_values);
    for (const a of annotations) {
      let parsed: Array<{ key: string; value: string }> = [];
      try {
        const raw = JSON.parse(a.domain_values!);
        if (Array.isArray(raw)) {
          if (raw.length > 0 && typeof raw[0] === "object" && raw[0].key !== undefined) {
            parsed = raw.map((item: any) => ({ key: String(item.key), value: String(item.value ?? item.key) }));
          } else {
            parsed = raw.map((v: any) => ({ key: String(v), value: String(v) }));
          }
        } else if (typeof raw === "object") {
          // Object format: {"1": "男", "0": "女"}
          parsed = Object.entries(raw).map(([k, v]) => ({ key: k, value: String(v) }));
        }
      } catch { /* skip invalid JSON */ }
      entries.push({
        source: "annotation",
        id: a.id,
        name: a.field_name || a.table_name,
        display_name: a.annotation || a.field_name || a.table_name,
        table_name: a.table_name,
        field_name: a.field_name || undefined,
        values: parsed,
      });
    }

    return c.json(entries);
  });

  // Update enum dictionary entry values
  app.put("/api/datasources/:dsId/dictionary/enums/:source/:id", async (c) => {
    const dsId = c.req.param("dsId");
    const source = c.req.param("source");
    const id = c.req.param("id");
    const body = await c.req.json();

    if (!body.values || !Array.isArray(body.values)) {
      return c.json({ error: "values must be an array of {key, value} objects" }, 400);
    }

    // Normalize to [{key, value}] format
    const normalized = body.values.map((v: any) => ({ key: String(v.key), value: String(v.value ?? v.key) }));

    if (source === "dimension") {
      const dim = listDimensions(dsId).find(d => d.id === id);
      if (!dim) return c.json({ error: "Dimension not found" }, 404);
      const updated = updateDimension(id, { values: JSON.stringify(normalized) });
      return updated ? c.json(updated) : c.json({ error: "Update failed" }, 500);
    }

    if (source === "annotation") {
      const ann = getAnnotations(dsId).find(a => a.id === id);
      if (!ann) return c.json({ error: "Annotation not found" }, 404);
      const updated = upsertAnnotation({
        datasource_id: dsId,
        table_name: ann.table_name,
        field_name: ann.field_name,
        column_type: (ann as any).column_type ?? null,
        sample_data: (ann as any).sample_data ?? null,
        annotation: ann.annotation,
        status: ann.status,
        domain_type: "enum",
        domain_values: JSON.stringify(normalized),
      });
      return c.json(updated);
    }

    return c.json({ error: "Invalid source, must be 'dimension' or 'annotation'" }, 400);
  });

  return app;
}
