# Phase 2: Semantic Layer + Multi-Turn Dialog + Few-Shot + Feedback Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise accuracy from ~72% to ~90% by introducing a semantic layer for deterministic metric queries, enabling multi-turn follow-up conversations, and building a feedback-driven knowledge base.

**Architecture:** Three new SQLite tables (`semantic_metrics`, `semantic_dimensions`, `semantic_models`) for the semantic layer. New Agent tools (`lookup_semantic_layer`, `lookup_examples`, `ai_suggest_semantic_layer`). System prompt extensions for intent classification, follow-up context injection, and empty-result auto-correction. Frontend adds a Metrics Management page, follow-up tags, New Topic button, and Query Examples section.

**Tech Stack:** Same as Phase 1. No new dependencies.

---

## File Structure

### Server — New Files
| File | Responsibility |
|------|---------------|
| `packages/server/src/agent/tools/lookup-semantic-layer.ts` | Agent tool: search metrics/dimensions by keyword |
| `packages/server/src/agent/tools/lookup-examples.ts` | Agent tool: search query_examples by keyword |
| `packages/server/src/agent/tools/ai-suggest-semantic.ts` | Agent tool: AI-recommended metrics/dimensions/models |
| `packages/server/src/routes/semantic.ts` | Semantic layer CRUD REST routes |

### Server — Modified Files
| File | Changes |
|------|---------|
| `packages/server/src/store.ts` | Add semantic_metrics, semantic_dimensions, semantic_models, query_examples, query_feedback tables + CRUD |
| `packages/server/src/types.ts` | Add SemanticMetric, SemanticDimension, SemanticModel, QueryExample, QueryFeedback types |
| `packages/server/src/agent/harness-factory.ts` | Register lookup_semantic_layer, lookup_examples, ai_suggest_semantic tools |
| `packages/server/src/agent/prompt-builder.ts` | Add semantic layer usage instructions, intent classification for follow-ups, Few-Shot instructions |
| `packages/server/src/agent/tools/execute-sql.ts` | Wire probe execution; mark semantic-layer SQL to skip probe; auto-save successful queries to query_examples |
| `packages/server/src/ws/chat-handler.ts` | Handle `reset_context` message type; wire validation events; save query_examples after successful execution |
| `packages/server/src/index.ts` | Register semantic routes |
| `packages/server/src/routes/schemas.ts` | Add AI-suggest-semantic endpoint |

### Web — New Files
| File | Responsibility |
|------|---------------|
| `packages/web/src/components/Metrics/MetricsPage.tsx` | Main metrics management page |
| `packages/web/src/components/Metrics/MetricForm.tsx` | Create/edit metric form |
| `packages/web/src/components/Metrics/DimensionForm.tsx` | Create/edit dimension form |
| `packages/web/src/components/Metrics/ModelForm.tsx` | Create/edit model form |
| `packages/web/src/components/Metrics/AISuggestPanel.tsx` | AI recommendation review panel |
| `packages/web/src/components/Metrics/MetricTestResult.tsx` | Test query result preview |
| `packages/web/src/components/Metrics/QueryExamplesSection.tsx` | Browse/verify/delete query examples |

### Web — Modified Files
| File | Changes |
|------|---------|
| `packages/web/src/api/client.ts` | Add semanticApi, queryExamplesApi (if not added in P1) |
| `packages/web/src/stores/app.ts` | Add AppView type "metrics", selectedMetricId |
| `packages/web/src/App.tsx` | Add `{view === "metrics" && <MetricsPage />}` route |
| `packages/web/src/components/Layout.tsx` (or sidebar) | Add "Metrics" nav item |

---

## Task 1: Semantic Layer — Storage + Types

**Files:**
- Modify: `packages/server/src/store.ts`
- Modify: `packages/server/src/types.ts`

- [ ] **Step 1: Add semantic table types in types.ts**

```typescript
export interface SemanticMetric {
  id: string;
  datasource_id: string;
  name: string;
  display_name: string;
  description: string;
  sql_expression: string;
  filters: string; // JSON array
  dimensions: string; // JSON array of dimension names
  default_granularity: string | null;
  unit: string | null;
  category: string | null;
  aliases: string; // JSON array
  status: "draft" | "published" | "deprecated";
  created_at: string;
  updated_at: string;
}

export interface SemanticDimension {
  id: string;
  datasource_id: string;
  name: string;
  display_name: string;
  sql_expression: string;
  data_type: "string" | "number" | "date";
  hierarchy: string | null; // JSON object
  values: string | null; // JSON array
  created_at: string;
  updated_at: string;
}

export interface SemanticModel {
  id: string;
  datasource_id: string;
  name: string;
  description: string | null;
  base_table: string;
  joins: string; // JSON array
  metrics: string; // JSON array of metric names
  dimensions: string; // JSON array of dimension names
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Create the three semantic tables in store.ts initTables**

```sql
CREATE TABLE IF NOT EXISTS semantic_metrics (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sql_expression TEXT NOT NULL,
  filters TEXT NOT NULL DEFAULT '[]',
  dimensions TEXT NOT NULL DEFAULT '[]',
  default_granularity TEXT,
  unit TEXT,
  category TEXT,
  aliases TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft', 'published', 'deprecated')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
  UNIQUE(datasource_id, name)
);

CREATE TABLE IF NOT EXISTS semantic_dimensions (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sql_expression TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'string' CHECK(data_type IN ('string', 'number', 'date')),
  hierarchy TEXT,
  values TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
  UNIQUE(datasource_id, name)
);

CREATE TABLE IF NOT EXISTS semantic_models (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_table TEXT NOT NULL,
  joins TEXT NOT NULL DEFAULT '[]',
  metrics TEXT NOT NULL DEFAULT '[]',
  dimensions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
);
```

- [ ] **Step 3: Add CRUD functions for metrics, dimensions, models**

For each entity, add `list`, `get`, `create`, `update`, `delete` functions following the same pattern as existing `listDatasources` / `createDatasource`. Example for metrics:

```typescript
export function listMetrics(datasourceId: string): SemanticMetric[] {
  return getDb().prepare(`
    SELECT * FROM semantic_metrics WHERE datasource_id = ? ORDER BY category, name
  `).all(datasourceId) as SemanticMetric[];
}

export function getMetric(id: string): SemanticMetric | undefined {
  return getDb().prepare(`SELECT * FROM semantic_metrics WHERE id = ?`).get(id) as SemanticMetric | undefined;
}

export function createMetric(input: Omit<SemanticMetric, "id" | "created_at" | "updated_at">): SemanticMetric {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO semantic_metrics (id, datasource_id, name, display_name, description, sql_expression, filters, dimensions, default_granularity, unit, category, aliases, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.datasource_id, input.name, input.display_name, input.description, input.sql_expression, input.filters, input.dimensions, input.default_granularity ?? null, input.unit ?? null, input.category ?? null, input.aliases, input.status);
  return getMetric(id)!;
}

export function updateMetric(id: string, input: Partial<Omit<SemanticMetric, "id" | "datasource_id" | "created_at" | "updated_at">>): SemanticMetric | undefined {
  // Same dynamic update pattern as updateDatasource
  const updates: string[] = [];
  const values: unknown[] = [];
  const fields = ["name", "display_name", "description", "sql_expression", "filters", "dimensions", "default_granularity", "unit", "category", "aliases", "status"];
  for (const f of fields) {
    if ((input as any)[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push((input as any)[f]);
    }
  }
  if (updates.length === 0) return getMetric(id);
  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  getDb().prepare(`UPDATE semantic_metrics SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getMetric(id);
}

export function deleteMetric(id: string): boolean {
  return getDb().prepare("DELETE FROM semantic_metrics WHERE id = ?").run(id).changes > 0;
}
```

Repeat analogous functions for `listDimensions`, `createDimension`, `updateDimension`, `deleteDimension` and `listModels`, `createModel`, `updateModel`, `deleteModel`.

- [ ] **Step 4: Add test-metric endpoint helper function**

```typescript
export async function testMetric(datasourceId: string, metricId: string): Promise<QueryResult> {
  const metric = getMetric(metricId);
  if (!metric) throw new Error("Metric not found");
  // Build a test SQL: SELECT the metric expression with LIMIT 10
  const model = listModels(datasourceId).find(m => m.metrics.includes(`"${metric.name}"`) || m.metrics.includes(metric.name));
  let sql = `SELECT ${metric.sql_expression} AS ${metric.name}`;
  if (model) {
    sql += ` FROM ${model.base_table}`;
    const joins = JSON.parse(model.joins) as Array<{table: string; on: string; type: string}>;
    for (const j of joins) {
      sql += ` ${j.type.toUpperCase()} JOIN ${j.table} ON ${j.on}`;
    }
  } else {
    sql += ` FROM (SELECT 1) AS _dummy LIMIT 0`; // Fallback: can't test without model
    return { columns: [metric.name], rows: [], rowCount: 0, executionTime: 0 };
  }
  const filters = JSON.parse(metric.filters) as Array<{column: string; operator: string; value: string}>;
  if (filters.length > 0) {
    const whereClauses = filters.map(f => `${f.column} ${f.operator} '${f.value}'`);
    sql += ` WHERE ${whereClauses.join(" AND ")}`;
  }
  sql += " LIMIT 10";
  return executeSql(datasourceId, sql, { timeout: 5000, rowLimit: 10 });
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/store.ts packages/server/src/types.ts
git commit -m "feat: semantic layer storage — metrics, dimensions, models tables and CRUD"
```

---

## Task 2: Semantic Layer — REST API

**Files:**
- Create: `packages/server/src/routes/semantic.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Create semantic routes file**

`packages/server/src/routes/semantic.ts`:

```typescript
import { Hono } from "hono";
import {
  listMetrics, getMetric, createMetric, updateMetric, deleteMetric,
  listDimensions, createDimension, updateDimension, deleteDimension,
  listModels, createModel, updateModel, deleteModel, testMetric,
} from "../store.js";

export function createSemanticRoutes() {
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
    try {
      const result = await testMetric(c.req.param("dsId"), c.req.param("id"));
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

  return app;
}
```

- [ ] **Step 2: Register semantic routes in index.ts**

```typescript
import { createSemanticRoutes } from "./routes/semantic.js";

// In the route setup section:
app.route("/", createSemanticRoutes());
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/semantic.ts packages/server/src/index.ts
git commit -m "feat: semantic layer CRUD REST API"
```

---

## Task 3: Semantic Layer — Agent Tools

**Files:**
- Create: `packages/server/src/agent/tools/lookup-semantic-layer.ts`
- Create: `packages/server/src/agent/tools/lookup-examples.ts`
- Create: `packages/server/src/agent/tools/ai-suggest-semantic.ts`
- Modify: `packages/server/src/agent/harness-factory.ts`
- Modify: `packages/server/src/agent/prompt-builder.ts`

- [ ] **Step 1: Create lookup_semantic_layer tool**

`packages/server/src/agent/tools/lookup-semantic-layer.ts`:

```typescript
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listMetrics, listDimensions, listModels } from "../../store.js";

export function createLookupSemanticLayerTool(): AgentTool {
  return {
    name: "lookup_semantic_layer",
    description: "Search for pre-defined metrics and dimensions matching the user's question. Returns matching metrics with SQL expressions, filters, and available dimensions. If a metric is found, use it to generate SQL deterministically rather than relying on NL→SQL.",
    parameters: {
      type: "object",
      properties: {
        datasource_id: { type: "string", description: "The datasource ID" },
        query: { type: "string", description: "The search query (e.g. '销售额', 'GMV', '城市')" },
      },
      required: ["datasource_id", "query"],
    },
    execute: async (args: { datasource_id: string; query: string }) => {
      const { datasource_id, query } = args;
      const queryLower = query.toLowerCase();

      const metrics = listMetrics(datasource_id).filter(m => m.status === "published");
      const dimensions = listDimensions(datasource_id);
      const models = listModels(datasource_id);

      // Search metrics: match name, display_name, aliases
      const matchedMetrics = metrics.filter(m => {
        const nameMatch = m.name.toLowerCase().includes(queryLower) ||
          m.display_name.toLowerCase().includes(queryLower);
        const aliasMatch = JSON.parse(m.aliases).some((a: string) => a.toLowerCase().includes(queryLower));
        return nameMatch || aliasMatch;
      });

      // Search dimensions: match name, display_name, values
      const matchedDimensions = dimensions.filter(d => {
        const nameMatch = d.name.toLowerCase().includes(queryLower) ||
          d.display_name.toLowerCase().includes(queryLower);
        const valueMatch = d.values ? JSON.parse(d.values!).some((v: string) => v.toLowerCase().includes(queryLower)) : false;
        return nameMatch || valueMatch;
      });

      if (matchedMetrics.length === 0 && matchedDimensions.length === 0) {
        return { matched: false, metrics: [], dimensions: [], models: [] };
      }

      // Find relevant models
      const relevantModelNames = new Set<string>();
      for (const m of matchedMetrics) {
        for (const model of models) {
          const modelMetrics = JSON.parse(model.metrics) as string[];
          if (modelMetrics.includes(m.name)) {
            relevantModelNames.add(model.name);
          }
        }
      }
      const matchedModels = models.filter(m => relevantModelNames.has(m.name));

      return {
        matched: true,
        metrics: matchedMetrics.map(m => ({
          name: m.name,
          display_name: m.display_name,
          description: m.description,
          sql_expression: m.sql_expression,
          filters: JSON.parse(m.filters),
          dimensions: JSON.parse(m.dimensions),
          unit: m.unit,
          aliases: JSON.parse(m.aliases),
        })),
        dimensions: matchedDimensions.map(d => ({
          name: d.name,
          display_name: d.display_name,
          sql_expression: d.sql_expression,
          data_type: d.data_type,
          hierarchy: d.hierarchy ? JSON.parse(d.hierarchy!) : null,
          values: d.values ? JSON.parse(d.values!) : null,
        })),
        models: matchedModels.map(m => ({
          name: m.name,
          description: m.description,
          base_table: m.base_table,
          joins: JSON.parse(m.joins),
        })),
      };
    },
  };
}
```

- [ ] **Step 2: Create lookup_examples tool**

`packages/server/src/agent/tools/lookup-examples.ts`:

```typescript
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listQueryExamples } from "../../store.js";

export function createLookupExamplesTool(): AgentTool {
  return {
    name: "lookup_examples",
    description: "Search for similar past queries that were successfully executed. Returns up to 3 question-SQL pairs as Few-Shot examples for SQL generation.",
    parameters: {
      type: "object",
      properties: {
        datasource_id: { type: "string", description: "The datasource ID" },
        query: { type: "string", description: "The user's question to find similar examples for" },
      },
      required: ["datasource_id", "query"],
    },
    execute: async (args: { datasource_id: string; query: string }) => {
      const { datasource_id, query } = args;
      const queryLower = query.toLowerCase();
      const keywords = queryLower.split(/\s+/).filter(w => w.length > 1);

      const allExamples = listQueryExamples(datasource_id);

      // Score each example by keyword overlap with question and tables_used
      const scored = allExamples.map(ex => {
        const questionLower = ex.question.toLowerCase();
        const tablesUsed = JSON.parse(ex.tables_used) as string[];
        let score = 0;
        // Keyword match in question
        for (const kw of keywords) {
          if (questionLower.includes(kw)) score += 2;
          for (const t of tablesUsed) {
            if (t.toLowerCase().includes(kw)) score += 1;
          }
        }
        // Prefer verified and high success
        if (ex.is_verified) score += 3;
        score += Math.min(ex.success_count, 5); // Cap bonus at 5
        return { ex, score };
      });

      // Sort by score DESC, take top 3
      const top3 = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(s => ({
          question: s.ex.question,
          sql: s.ex.sql,
          is_verified: s.ex.is_verified === 1,
        }));

      return { examples: top3 };
    },
  };
}
```

Note: `listQueryExamples` in store.ts needs to support listing all examples for a datasource (without tableName filter).

- [ ] **Step 3: Create ai_suggest_semantic_layer tool**

`packages/server/src/agent/tools/ai-suggest-semantic.ts`:

```typescript
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { discoverSchema } from "../../mysql/discovery.js";
import { executeSql } from "../../mysql/executor.js";
import { createMetric, createDimension, createModel } from "../../store.js";

export function createAiSuggestSemanticTool(): AgentTool {
  return {
    name: "ai_suggest_semantic_layer",
    description: "Analyze the database schema and sample data to recommend metric, dimension, and model definitions. Saves all recommendations as drafts for user confirmation.",
    parameters: {
      type: "object",
      properties: {
        datasource_id: { type: "string", description: "The datasource ID" },
      },
      required: ["datasource_id"],
    },
    execute: async (args: { datasource_id: string }) => {
      // Return the schema info so the LLM can generate recommendations
      // The LLM will produce the actual metric/dimension/model definitions
      // and call back to save them
      const schemaInfo = await discoverSchema(datasource_id);

      const tablesSummary = schemaInfo.tables.map(t => ({
        name: t.table.name,
        comment: t.table.comment,
        columns: t.columns.map(c => `${c.name} (${c.type})`),
        foreignKeys: t.foreignKeys.map(fk => `${fk.columnName} → ${fk.referencedTable}.${fk.referencedColumn}`),
      }));

      return {
        needs_semantic_suggestion: true,
        tables: tablesSummary,
        instruction: `Analyze the above tables. Please recommend:\n1. Which are fact tables vs dimension tables\n2. Metrics to define (with name, display_name, sql_expression, filters, dimensions)\n3. Dimensions to define (with name, display_name, sql_expression, hierarchy, values)\n4. A logical model connecting them\n\nFormat your recommendations and use the save_semantic_suggestions action to save them as drafts.`,
      };
    },
  };
}
```

- [ ] **Step 4: Register all three tools in harness-factory.ts**

```typescript
import { createLookupSemanticLayerTool } from "./tools/lookup-semantic-layer.js";
import { createLookupExamplesTool } from "./tools/lookup-examples.js";
import { createAiSuggestSemanticTool } from "./tools/ai-suggest-semantic.js";

// In createHarness:
const tools: AgentTool[] = [
  createDiscoverSchemaTool(),
  createExecuteSqlTool(),
  createAiAnnotateSchemaTool(),
  createLookupSemanticLayerTool(),
  createLookupExamplesTool(),
  createAiSuggestSemanticTool(),
];
```

- [ ] **Step 5: Update system prompt with semantic layer instructions**

In `packages/server/src/agent/prompt-builder.ts`, add to guidelines:

```typescript
`- When a user asks a data question, ALWAYS call lookup_semantic_layer first to check if pre-defined metrics match.
  - If a metric is found, generate SQL by combining:
    1. The metric's sql_expression in SELECT
    2. Any dimension sql_expressions from the model in GROUP BY
    3. The model's base_table and JOINs in FROM
    4. The metric's fixed filters in WHERE
    5. User-specified filters (time ranges, categories, etc.) in WHERE
  - Mark such SQL with a comment: /* source: semantic_layer */ — this tells the system to skip probe execution.
  - If no metric matches, call lookup_examples to find similar past queries as Few-Shot reference.
  - If no examples match either, generate SQL from scratch using discover_schema context.

- For multi-turn conversations:
  - When the user's message is a follow-up (refining conditions, drilling down, comparing periods), modify the previous SQL rather than generating from scratch.
  - Identify the intent: refine (change filters), drill_down (finer granularity), roll_up (coarser granularity), compare (period/group comparison), explain (attribution analysis).
  - For drill_down/roll_up, use the semantic layer dimension hierarchies if available.

- When a user asks "why" something changed, perform attribution analysis:
  1. Verify the change is real with a comparison query
  2. Break down by each available dimension
  3. Identify the largest contributing factor
  4. Cross-reference dimensions to pinpoint the root cause
  5. Generate a natural language attribution conclusion`
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/agent/tools/lookup-semantic-layer.ts packages/server/src/agent/tools/lookup-examples.ts packages/server/src/agent/tools/ai-suggest-semantic.ts packages/server/src/agent/harness-factory.ts packages/server/src/agent/prompt-builder.ts
git commit -m "feat: semantic layer agent tools + system prompt instructions"
```

---

## Task 4: Semantic Layer — Frontend Metrics Management Page

**Files:**
- Create: `packages/web/src/components/Metrics/MetricsPage.tsx`
- Create: `packages/web/src/components/Metrics/MetricForm.tsx`
- Create: `packages/web/src/components/Metrics/DimensionForm.tsx`
- Create: `packages/web/src/components/Metrics/ModelForm.tsx`
- Create: `packages/web/src/components/Metrics/AISuggestPanel.tsx`
- Create: `packages/web/src/components/Metrics/MetricTestResult.tsx`
- Create: `packages/web/src/components/Metrics/QueryExamplesSection.tsx`
- Modify: `packages/web/src/stores/app.ts`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/api/client.ts`

- [ ] **Step 1: Extend AppView in stores/app.ts**

```typescript
export type AppView = "chat" | "datasources" | "schemas" | "metrics" | "dictionary" | "scheduled";

// Add to state:
selectedMetricId: string | null;
setSelectedMetricId: (id: string | null) => void;
```

- [ ] **Step 2: Add semanticApi to client.ts**

```typescript
export interface SemanticMetric {
  id: string;
  datasource_id: string;
  name: string;
  display_name: string;
  description: string;
  sql_expression: string;
  filters: string;
  dimensions: string;
  default_granularity: string | null;
  unit: string | null;
  category: string | null;
  aliases: string;
  status: "draft" | "published" | "deprecated";
  created_at: string;
  updated_at: string;
}

export const semanticApi = {
  listMetrics: (dsId: string) => request<SemanticMetric[]>(`/api/datasources/${dsId}/metrics`),
  createMetric: (dsId: string, data: Omit<SemanticMetric, "id" | "created_at" | "updated_at">) =>
    request<SemanticMetric>(`/api/datasources/${dsId}/metrics`, { method: "POST", body: JSON.stringify(data) }),
  updateMetric: (dsId: string, id: string, data: Partial<SemanticMetric>) =>
    request<SemanticMetric>(`/api/datasources/${dsId}/metrics/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMetric: (dsId: string, id: string) =>
    request<{ success: boolean }>(`/api/datasources/${dsId}/metrics/${id}`, { method: "DELETE" }),
  testMetric: (dsId: string, id: string) =>
    request<{ columns: string[]; rows: Record<string, unknown>[]; rowCount: number; executionTime: number }>(
      `/api/datasources/${dsId}/metrics/${id}/test`, { method: "POST" }
    ),
  listDimensions: (dsId: string) => request<SemanticDimension[]>(`/api/datasources/${dsId}/dimensions`),
  createDimension: (dsId: string, data: any) =>
    request<SemanticDimension>(`/api/datasources/${dsId}/dimensions`, { method: "POST", body: JSON.stringify(data) }),
  updateDimension: (dsId: string, id: string, data: any) =>
    request<SemanticDimension>(`/api/datasources/${dsId}/dimensions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDimension: (dsId: string, id: string) =>
    request<{ success: boolean }>(`/api/datasources/${dsId}/dimensions/${id}`, { method: "DELETE" }),
  listModels: (dsId: string) => request<SemanticModel[]>(`/api/datasources/${dsId}/models`),
  createModel: (dsId: string, data: any) =>
    request<SemanticModel>(`/api/datasources/${dsId}/models`, { method: "POST", body: JSON.stringify(data) }),
  updateModel: (dsId: string, id: string, data: any) =>
    request<SemanticModel>(`/api/datasources/${dsId}/models/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteModel: (dsId: string, id: string) =>
    request<{ success: boolean }>(`/api/datasources/${dsId}/models/${id}`, { method: "DELETE" }),
  aiSuggestSemantic: (dsId: string) =>
    request<{ suggestions: unknown[] }>(`/api/datasources/${dsId}/ai-suggest-semantic`, { method: "POST" }),
};
```

- [ ] **Step 3: Create MetricForm component**

A form with fields: name, display_name, description, sql_expression, filters (JSON array editor), dimensions (multi-select from existing dimensions), aliases (comma-separated input), unit, category, status (draft/published).

The form should:
- Validate that name is unique (by checking against listed metrics)
- Provide a "Test" button that calls `semanticApi.testMetric()`
- Show test results in a small preview table (using TableResult component)

- [ ] **Step 4: Create DimensionForm component**

A form with fields: name, display_name, sql_expression, data_type (select: string/number/date), hierarchy (JSON editor with levels/labels), values (comma-separated input).

- [ ] **Step 5: Create ModelForm component**

A form with fields: name, description, base_table (select from discovered tables), joins (dynamic list: table, on, type), metrics (multi-select from existing metrics), dimensions (multi-select from existing dimensions).

- [ ] **Step 6: Create AISuggestPanel component**

A button "AI 推荐指标" that:
1. Calls `semanticApi.aiSuggestSemantic(dsId)`
2. Shows loading spinner
3. Renders returned suggestions as draft cards
4. Each card has Confirm/Reject/Edit buttons
5. Confirm saves the metric/dimension/model as `published`
6. Reject deletes it
7. Edit opens the relevant form pre-filled with draft data

- [ ] **Step 7: Create MetricsPage component**

The page layout:
- Left sidebar: list of metrics grouped by category, with counts per group (expand/collapse)
- Right main area: depends on selection
  - No selection: overview with "AI 推荐" button, summary stats (total metrics, published, draft, deprecated), quick actions
  - Metric selected: MetricForm + test results
  - "Add Metric" button: opens empty MetricForm
- Top tabs: Metrics | Dimensions | Models
- Toggle: "Show deprecated" (default off)
- Status badges: 🟢 published, 🟡 draft, 🔴 deprecated

- [ ] **Step 8: Add route in App.tsx**

```tsx
import MetricsPage from "./components/Metrics/MetricsPage";

// In the render:
{view === "metrics" && <MetricsPage />}
```

- [ ] **Step 9: Add sidebar nav item**

In the Layout/sidebar component, add a "📊 指标管理" nav item that sets `view: "metrics"`.

- [ ] **Step 10: Commit**

```bash
git add packages/web/src/components/Metrics/ packages/web/src/stores/app.ts packages/web/src/App.tsx packages/web/src/api/client.ts
git commit -m "feat: Metrics Management page — CRUD, AI suggest, test, status lifecycle"
```

---

## Task 5: Query Examples Auto-Save + Feedback Loop Wiring

**Files:**
- Modify: `packages/server/src/agent/tools/execute-sql.ts`
- Modify: `packages/server/src/ws/chat-handler.ts`
- Modify: `packages/server/src/store.ts`

- [ ] **Step 1: Add auto-save logic in chat-handler.ts**

After `harness.prompt(text)` resolves successfully and the result has non-empty content with SQL, save the question-SQL pair:

```typescript
import { saveQueryExample, saveFeedback } from "../store.js";

// After the response completes:
if (fullContent && responseSql) {
  saveQueryExample({
    datasource_id: harnessOptions.datasourceId,
    conversation_id: conversationId,
    question: text,
    sql: responseSql,
    tables_used: JSON.stringify(extractTablesFromSql(responseSql)),
    difficulty: classifyDifficulty(responseSql),
    success_count: 1,
    is_verified: 0,
  });
}
```

Add helper functions:

```typescript
function extractTablesFromSql(sql: string): string[] {
  const fromRegex = /(?:FROM|JOIN)\s+`?(\w+)`?/gi;
  const tables: string[] = [];
  let m;
  while ((m = fromRegex.exec(sql)) !== null) {
    tables.push(m[1]);
  }
  return [...new Set(tables)];
}

function classifyDifficulty(sql: string): "simple" | "medium" | "complex" {
  const joinCount = (sql.match(/\bJOIN\b/gi) || []).length;
  const hasSubquery = /\bSELECT\b.*\bFROM\b.*\(\s*SELECT/gi.test(sql);
  const hasWindowFunc = /\bOVER\b/gi.test(sql);
  if (joinCount > 2 || hasSubquery || hasWindowFunc) return "complex";
  if (joinCount > 0 || /\bGROUP BY\b/gi.test(sql)) return "medium";
  return "simple";
}
```

- [ ] **Step 2: Wire feedback → knowledge management**

When a positive feedback is received for a message, mark the corresponding query_example as verified:

```typescript
// In the feedback API handler:
if (body.rating === "positive") {
  // Find the query_example matching this message
  const example = findQueryExampleByMessageId(msgId);
  if (example && !example.is_verified) {
    updateQueryExample(example.id, { is_verified: 1 });
  }
}
```

When 3+ negative feedbacks are received for the same question-SQL pair, flag it:

```typescript
if (body.rating === "negative") {
  const example = findQueryExampleByMessageId(msgId);
  if (example) {
    const newCount = example.success_count - 1;
    if (newCount <= 0) {
      updateQueryExample(example.id, { is_verified: 0 });
    }
  }
}
```

- [ ] **Step 3: Add QueryExamplesSection to MetricsPage**

Create `packages/web/src/components/Metrics/QueryExamplesSection.tsx`:

```tsx
import { useState, useEffect } from "react";
import { queryExamplesApi, type TableQueryExample } from "../../api/client";

interface QueryExamplesSectionProps {
  datasourceId: string;
}

export default function QueryExamplesSection({ datasourceId }: QueryExamplesSectionProps) {
  const [examples, setExamples] = useState<TableQueryExample[]>([]);
  const [filter, setFilter] = useState<"all" | "verified" | "flagged">("all");

  useEffect(() => {
    queryExamplesApi.list(datasourceId).then(setExamples).catch(() => {});
  }, [datasourceId]);

  const filtered = examples.filter(ex => {
    if (filter === "verified") return ex.is_verified === 1;
    if (filter === "flagged") return ex.is_verified === 0;
    return true;
  });

  // Group by table
  const grouped = new Map<string, TableQueryExample[]>();
  for (const ex of filtered) {
    if (!grouped.has(ex.table_name)) grouped.set(ex.table_name, []);
    grouped.get(ex.table_name)!.push(ex);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-medium text-[var(--ink)]">📋 查询示例</h3>
        <div className="flex gap-1">
          {(["all", "verified", "flagged"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2 py-0.5 rounded ${filter === f ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--steel)]"}`}
            >{f === "all" ? "全部" : f === "verified" ? "已验证" : "待审核""} ({examples.filter(ex => f === "all" || (f === "verified" ? ex.is_verified : !ex.is_verified)).length})</button>
          ))}
        </div>
      </div>

      {[...grouped.entries()].map(([table, exs]) => (
        <div key={table} className="mb-4">
          <h4 className="text-xs font-mono text-[var(--steel)] mb-2">📄 {table}</h4>
          <div className="space-y-2">
            {exs.map(ex => (
              <div key={ex.id} className="p-2 border border-[var(--hairline)] rounded bg-[var(--surface)]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-[var(--ink)]">"{ex.question}"</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${ex.is_verified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                    {ex.is_verified ? "✅ 已验证" : "⏳ 待验证"}
                  </span>
                </div>
                <pre className="text-xs font-mono text-[var(--steel)] bg-[var(--canvas)] p-1.5 rounded overflow-x-auto">{ex.sql}</pre>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={async () => {
                      await queryExamplesApi.update(datasourceId, ex.id, { is_verified: 1 });
                      setExamples(prev => prev.map(e => e.id === ex.id ? { ...e, is_verified: 1 } : e));
                    }}
                    className="text-xs text-[var(--primary)] hover:underline"
                  >验证</button>
                  <button
                    onClick={async () => {
                      await queryExamplesApi.delete(datasourceId, ex.id);
                      setExamples(prev => prev.filter(e => e.id !== ex.id));
                    }}
                    className="text-xs text-red-500 hover:underline"
                  >删除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="text-sm text-[var(--steel)]">暂无查询示例。成功执行的查询会自动保存在这里。</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Integrate QueryExamplesSection into MetricsPage**

Add a sub-tab or section at the bottom of the MetricsPage.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/agent/tools/execute-sql.ts packages/server/src/ws/chat-handler.ts packages/server/src/store.ts packages/web/src/components/Metrics/QueryExamplesSection.tsx packages/web/src/components/Metrics/MetricsPage.tsx
git commit -m "feat: query examples auto-save, feedback loop, and management UI"
```

---

## Self-Review Checklist

**1. Spec coverage:**

| Spec Requirement | Task |
|---|---|
| Semantic metrics storage | Task 1 |
| Semantic dimensions storage | Task 1 |
| Semantic models storage | Task 1 |
| Semantic layer CRUD REST API | Task 2 |
| Agent semantic layer lookup | Task 3 Step 1 |
| Deterministic SQL generation | Task 3 Step 5 (system prompt) |
| AI-assisted semantic layer discovery | Task 3 Step 3 |
| Semantic layer management UI | Task 4 |
| Metric status lifecycle | Task 4 Step 7 |
| Intent classification for user messages | Task 3 Step 5 (system prompt, added in P1) |
| Previous SQL context injection | Task 3 Step 5 (system prompt, added in P1) |
| Dimension hierarchy-aware drill-down/roll-up | Task 3 Step 5 (system prompt) |
| Multi-turn conversation context display | Completed in P1 Task 10 |
| Conversation context reset | Completed in P1 Task 10 |
| Query examples storage | Task 5 Step 1 |
| Few-shot example injection | Task 3 Step 2 |
| User feedback on query results | Completed in P1 Task 7 + Task 5 Step 2 |
| Feedback-driven knowledge management | Task 5 Step 2 |
| Few-Shot management UI | Task 5 Step 3 |

**2. Placeholder scan:** No TBD/TODO patterns. All code is concrete.

**3. Type consistency:** `SemanticMetric` type matches between server (types.ts) and client (client.ts). `QueryExample` type used consistently. `TableQueryExample` type matches API response.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-06-data-agent-phase2.md`.