import { Hono } from "hono";
import { discoverSchema, formatSchemaForPrompt } from "../mysql/discovery.js";
import { getAnnotations, upsertAnnotation, deleteAnnotation, confirmAnnotation, listQueryExamples, createQueryExample, updateQueryExample, deleteQueryExample, getDatasource, listModels } from "../store.js";
import { executeSql } from "../mysql/executor.js";
import { refreshHarnessesForDatasource } from "../agent/harness-factory.js";

const app = new Hono();

// Get schema and annotations for a datasource
app.get("/:datasourceId", async (c) => {
  const datasourceId = c.req.param("datasourceId");

  const ds = getDatasource(datasourceId);
  if (!ds) return c.json({ error: "Datasource not found" }, 404);

  try {
    const [schema, annotations] = await Promise.all([
      discoverSchema(datasourceId),
      Promise.resolve(getAnnotations(datasourceId)),
    ]);

    return c.json({ schema, annotations });
  } catch (err) {
    const error = err as Error;
    return c.json({ error: `Failed to discover schema: ${error.message}` }, 500);
  }
});

// Upsert an annotation (table or field level)
app.put("/:datasourceId/annotations", async (c) => {
  const datasourceId = c.req.param("datasourceId");
  const body = await c.req.json();

  if (!body.table_name || !body.annotation) {
    return c.json({ error: "Missing required fields: table_name, annotation" }, 400);
  }

  const ds = getDatasource(datasourceId);
  if (!ds) return c.json({ error: "Datasource not found" }, 404);

  const annotation = upsertAnnotation({
    datasource_id: datasourceId,
    table_name: body.table_name,
    field_name: body.field_name ?? null,
    column_type: body.column_type ?? null,
    annotation: body.annotation,
    status: body.status ?? "confirmed",
    domain_type: body.domain_type ?? null,
    domain_values: body.domain_values ?? null,
    sample_data: body.sample_data ?? null,
  });

  // Auto-generate annotation skill and refresh harnesses
  refreshHarnessesForDatasource(datasourceId);

  return c.json(annotation);
});

// Confirm a draft annotation
app.put("/:datasourceId/annotations/:annotationId/confirm", async (c) => {
  const datasourceId = c.req.param("datasourceId");
  const annotationId = c.req.param("annotationId");

  const annotation = confirmAnnotation(annotationId);
  if (!annotation) return c.json({ error: "Annotation not found" }, 404);

  // Regenerate skill and refresh harnesses
  const ds = getDatasource(datasourceId);
  // Refresh harnesses so discover_schema tool picks up annotation changes
  refreshHarnessesForDatasource(datasourceId);

  return c.json(annotation);
});

// Delete an annotation
app.delete("/:datasourceId/annotations/:annotationId", async (c) => {
  const datasourceId = c.req.param("datasourceId");
  const annotationId = c.req.param("annotationId");

  const deleted = deleteAnnotation(annotationId);
  if (!deleted) return c.json({ error: "Annotation not found" }, 404);

  // Regenerate annotation skill and refresh harnesses
  const ds = getDatasource(datasourceId);
  // Refresh harnesses so discover_schema tool picks up annotation changes
  refreshHarnessesForDatasource(datasourceId);

  return c.json({ success: true });
});

// ==================== AI Annotate ====================

app.post("/:datasourceId/ai-annotate", async (c) => {
  const dsId = c.req.param("datasourceId");
  const body = await c.req.json();
  const tableNames = body.table_names as string[];

  const ds = getDatasource(dsId);
  if (!ds) return c.json({ error: "Datasource not found" }, 404);

  try {
    const schemaInfo = await discoverSchema(dsId, tableNames);

    // Get sample data for each table (5 rows) to help AI understand field values
    const tablesWithSamples = [];
    for (const table of schemaInfo.tables) {
      try {
        const result = await executeSql(dsId, `SELECT * FROM ${table.table.name} LIMIT 5`, { timeout: 5000, rowLimit: 5 });
        tablesWithSamples.push({ table, sampleData: result });
      } catch {
        tablesWithSamples.push({ table, sampleData: null });
      }
    }

    // Build schema context for AI
    const schemaContext = tablesWithSamples.map(({ table, sampleData }) => {
      let section = `Table: ${table.table.name}`;
      if (table.table.comment) section += `\nComment: ${table.table.comment}`;
      section += `\nColumns: ${table.columns.map(c => `${c.name} (${c.type})${c.comment ? ` - ${c.comment}` : ""}`).join(", ")}`;
      section += `\nForeign Keys: ${table.foreignKeys.map(fk => `${fk.columnName} -> ${fk.referencedTable}.${fk.referencedColumn}`).join(", ") || "None"}`;
      if (sampleData && sampleData.rows && sampleData.rows.length > 0) {
        section += `\nSample Data (5 rows):\n${JSON.stringify(sampleData.rows, null, 2)}`;
      }
      return section;
    }).join("\n\n---\n\n");

    // Build lookup maps for column_type and sample_data
    const columnTypeMap = new Map<string, string>();
    const sampleDataMap = new Map<string, string>();
    for (const { table, sampleData } of tablesWithSamples) {
      // Column type map: "tableName.fieldName" -> type
      for (const col of table.columns) {
        columnTypeMap.set(`${table.table.name}.${col.name}`, col.type);
      }
      // Sample data map: "tableName.fieldName" -> JSON array of values
      if (sampleData && sampleData.rows && sampleData.rows.length > 0) {
        for (const col of table.columns) {
          const values = sampleData.rows.map((r: any) => r[col.name]).filter(v => v !== null && v !== undefined);
          if (values.length > 0) {
            sampleDataMap.set(`${table.table.name}.${col.name}`, JSON.stringify(values));
          }
        }
      }
    }

    // Call DeepSeek API to generate annotations with domain_type and domain_values
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekKey) {
      return c.json({ error: "DeepSeek API key not configured. Set DEEPSEEK_API_KEY environment variable." }, 500);
    }

    const prompt = `You are a data analyst. Analyze the following database schema and sample data, then generate business annotations for each table and column.

Schema:
${schemaContext}

For each table and column, provide:
1. annotation: A business description in Chinese
2. domain_type: "enum" if the column has a small fixed set of values, "range" if it has a numeric range, or null
3. domain_values: For enum type, list the possible values as JSON array string. For range type, describe the range. Otherwise null.

Return a JSON object with an "annotations" array. Each item should have:
- table_name: string
- field_name: string or null (null for table-level annotation)
- annotation: string (Chinese business description)
- domain_type: "enum" | "range" | null
- domain_values: string | null (JSON array for enum, range description for range)

Return ONLY valid JSON, no markdown formatting.`;

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

    // Extract JSON from response
    let jsonStr = rawContent.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    let parsed: { annotations?: any[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return c.json({ error: "Failed to parse AI response", raw: rawContent }, 500);
    }

    // Create draft annotations in the database
    const created: any[] = [];
    if (parsed.annotations && Array.isArray(parsed.annotations)) {
      for (const a of parsed.annotations) {
        try {
          const key = a.field_name ? `${a.table_name}.${a.field_name}` : null;
          const annotation = upsertAnnotation({
            datasource_id: dsId,
            table_name: a.table_name,
            field_name: a.field_name ?? null,
            column_type: key ? (columnTypeMap.get(key) ?? null) : null,
            annotation: a.annotation || "",
            status: "draft",
            domain_type: a.domain_type ?? null,
            domain_values: a.domain_values ?? null,
            sample_data: key ? (sampleDataMap.get(key) ?? null) : null,
          });
          created.push(annotation);
        } catch (e) { /* skip errors */ }
      }
    }

    // Regenerate skill and refresh harnesses
    refreshHarnessesForDatasource(dsId);

    return c.json({ tables: schemaInfo.tables.map(t => t.table.name), created });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ==================== Schema Prompt Preview ====================

app.get("/:datasourceId/schema-prompt-preview", async (c) => {
  const dsId = c.req.param("datasourceId");

  const ds = getDatasource(dsId);
  if (!ds) return c.json({ error: "Datasource not found" }, 404);

  try {
    const schemaInfo = await discoverSchema(dsId);
    const annotations = getAnnotations(dsId);
    const examples = listQueryExamples(dsId);
    const preview = formatSchemaForPrompt(schemaInfo, annotations, examples);
    return c.json({ preview });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ==================== Schema Browse (for pickers) ====================

app.get("/:datasourceId/browse", async (c) => {
  const dsId = c.req.param("datasourceId");
  try {
    const schema = await discoverSchema(dsId);
    const models = listModels(dsId);

    const tables = schema.tables.map(t => ({
      name: t.table.name,
      comment: t.table.comment,
      columns: t.columns.map(col => ({
        name: col.name,
        type: col.type,
        comment: col.comment,
        isPrimaryKey: col.isPrimaryKey,
      })),
      foreignKeys: t.foreignKeys,
    }));

    const relationships = schema.tables.flatMap(t =>
      t.foreignKeys.map(fk => ({
        fromTable: t.table.name,
        fromColumn: fk.columnName,
        toTable: fk.referencedTable,
        toColumn: fk.referencedColumn,
      }))
    );

    return c.json({ tables, relationships, modelNames: models.map(m => m.name) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ==================== Query Examples CRUD ====================

app.get("/:datasourceId/table-query-examples", (c) => {
  const dsId = c.req.param("datasourceId");
  const tableName = c.req.query("tableName");
  return c.json(listQueryExamples(dsId, tableName));
});

app.post("/:datasourceId/table-query-examples", async (c) => {
  const dsId = c.req.param("datasourceId");
  const body = await c.req.json();
  const example = createQueryExample({ datasource_id: dsId, table_name: body.table_name, question: body.question, sql: body.sql });
  return c.json(example, 201);
});

app.put("/:datasourceId/table-query-examples/:id", async (c) => {
  const body = await c.req.json();
  const updated = updateQueryExample(c.req.param("id"), body);
  return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
});

app.delete("/:datasourceId/table-query-examples/:id", (c) => {
  return deleteQueryExample(c.req.param("id")) ? c.json({ success: true }) : c.json({ error: "Not found" }, 404);
});

export default app;
