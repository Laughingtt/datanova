import { Hono } from "hono";
import { discoverSchema } from "../mysql/discovery.js";
import { getAnnotations, upsertAnnotation, deleteAnnotation } from "../store.js";
import { getDatasource } from "../store.js";
import { generateAnnotationSkill } from "../agent/skill-manager.js";

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
  });

  // Auto-generate annotation skill
  await generateAnnotationSkill(datasourceId, ds.name);

  return c.json(annotation);
});

// Delete an annotation
app.delete("/:datasourceId/annotations/:annotationId", async (c) => {
  const datasourceId = c.req.param("datasourceId");
  const annotationId = c.req.param("annotationId");

  const deleted = deleteAnnotation(annotationId);
  if (!deleted) return c.json({ error: "Annotation not found" }, 404);

  // Regenerate annotation skill
  const ds = getDatasource(datasourceId);
  if (ds) {
    await generateAnnotationSkill(datasourceId, ds.name);
  }

  return c.json({ success: true });
});

export default app;
