import { Hono } from "hono";
import { discoverSchema, formatSchemaForPrompt } from "../mysql/discovery.js";
import { getAnnotations, upsertAnnotation, deleteAnnotation, confirmAnnotation, listQueryExamples, createQueryExample, updateQueryExample, deleteQueryExample, getDatasource, listModels } from "../store.js";
import { generateAnnotationSkill } from "../agent/skill-manager.js";
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
    annotation: body.annotation,
    status: body.status ?? "confirmed",
    domain_type: body.domain_type ?? null,
    domain_values: body.domain_values ?? null,
  });

  // Auto-generate annotation skill and refresh harnesses
  await generateAnnotationSkill(datasourceId, ds.name);
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
  if (ds) {
    await generateAnnotationSkill(datasourceId, ds.name);
    refreshHarnessesForDatasource(datasourceId);
  }

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
  if (ds) {
    await generateAnnotationSkill(datasourceId, ds.name);
    refreshHarnessesForDatasource(datasourceId);
  }

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
    // Return schema info for frontend to process via Agent or direct LLM call
    return c.json({
      tables: schemaInfo.tables.map(t => ({
        name: t.table.name,
        comment: t.table.comment,
        columns: t.columns.map(c => ({
          name: c.name,
          type: c.type,
          comment: c.comment,
          nullable: c.nullable,
        })),
        foreignKeys: t.foreignKeys.map(fk => ({
          column: fk.columnName,
          references: `${fk.referencedTable}.${fk.referencedColumn}`,
        })),
      })),
    });
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