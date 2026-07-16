# P2-2 语义层扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展语义层指标系统，支持三种指标类型（atomic/derived/compound），指标存完整可执行 SQL，增加元数据字段，维度增加时间粒度和状态，保存时强制 EXPLAIN 验证。

**Architecture:** 后端数据模型扩展（SQLite 新增列 + TypeScript 类型更新），`buildSemanticSql()` 拼装器替换为 `resolveSemanticSql()` 返回器，新增 EXPLAIN 验证函数，前端表单扩展新字段，AI 建议提示词扩展。

**Tech Stack:** Hono (backend routes), better-sqlite3 (metadata), mysql2 (EXPLAIN validation + test execution), React 19 (frontend forms), @sinclair/typebox (tool parameter schemas)

## Global Constraints

- 所有 UI 文本使用简体中文
- 服务端 ESM 导入使用 `.js` 扩展名
- SQLite 列只能 ADD，不能 DROP（`sql_expression` 列保留但不再使用）
- JSON 字段存储模式不变（string in DB，`JSON.parse()`/`JSON.stringify()` at boundaries）
- 维度 `"values"` 列名是 SQL 保留字，所有 SQL 语句中必须双引号
- 测试数据，旧数据直接清空无需迁移

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `packages/server/src/types.ts` | Modify | SemanticMetric 新增 sql/metric_type/business_context/calculation_logic/applicable_scenarios/data_quality_notes/default_sort，SemanticDimension 新增 status/grain/date_column/description |
| `packages/server/src/store.ts` | Modify | initTables 新增列 + 清空旧数据，CRUD 函数适配新字段 |
| `packages/server/src/agent/semantic-sql-builder.ts` | Rewrite | 删除 buildSemanticSql，新增 resolveSemanticSql |
| `packages/server/src/mysql/executor.ts` | Modify | 新增 validateSqlViaExplain 函数 |
| `packages/server/src/routes/semantic.ts` | Modify | EXPLAIN 验证中间件、test 端点改造、AI 提示词扩展、字段名 sql_expression→sql |
| `packages/server/src/agent/tools/lookup-semantic-layer.ts` | Modify | 使用 resolveSemanticSql，返回更丰富信息，过滤 published 维度 |
| `packages/server/src/agent/tools/ai-suggest-semantic.ts` | Modify | 更新返回提示词，指导 LLM 生成完整 SQL 和新元数据字段 |
| `packages/server/src/agent/prompt-builder.ts` | Modify | 系统提示词增加语义层使用指引 |
| `packages/web/src/api/client.ts` | Modify | 类型定义 sql_expression→sql，新增字段 |
| `packages/web/src/components/Metrics/MetricForm.tsx` | Modify | 新增 metric_type/sql/business_context/calculation_logic/applicable_scenarios/data_quality_notes/default_sort 字段，保存验证反馈 |
| `packages/web/src/components/Metrics/DimensionForm.tsx` | Modify | 新增 status/description/grain/date_column 字段 |
| `packages/web/src/components/Metrics/MetricsPage.tsx` | Modify | metric_type 标签、维度 status 过滤、维度 grain 显示 |

---

### Task 1: 后端类型定义 + 数据模型扩展

**Files:**
- Modify: `packages/server/src/types.ts:130-174`
- Modify: `packages/server/src/store.ts:138-196, 917-1042`

**Interfaces:**
- Consumes: 无（基础任务）
- Produces: `SemanticMetric` (含 sql, metric_type, business_context, calculation_logic, applicable_scenarios, data_quality_notes, default_sort), `SemanticDimension` (含 status, grain, date_column, description), 更新后的 CRUD 函数签名

- [ ] **Step 1: 更新 TypeScript 类型定义**

在 `packages/server/src/types.ts` 中：

`SemanticMetric` 接口（约 line 130）变更：
- 删除 `sql_expression` 字段
- 删除 `filters` 字段
- 新增 `sql: string`
- 新增 `metric_type: "atomic" | "derived" | "compound"`
- 新增 `business_context: string`
- 新增 `calculation_logic: string`
- 新增 `applicable_scenarios: string`
- 新增 `data_quality_notes: string`
- 新增 `default_sort: string | null`

`SemanticDimension` 接口（约 line 149）变更：
- 新增 `status: "draft" | "published" | "deprecated"`
- 新增 `grain: "day" | "week" | "month" | "quarter" | "year" | null`
- 新增 `date_column: string | null`
- 新增 `description: string`

- [ ] **Step 2: 更新 initTables 中的建表 SQL**

在 `packages/server/src/store.ts` 的 `initTables()` 中：

`semantic_metrics` 表（约 line 140）：
- 将 `sql_expression TEXT NOT NULL` 改为 `sql TEXT NOT NULL`
- 删除 `filters TEXT NOT NULL DEFAULT '[]'`
- 在 `aliases` 行之后新增列：
  ```sql
  metric_type TEXT NOT NULL DEFAULT 'atomic' CHECK(metric_type IN ('atomic', 'derived', 'compound')),
  business_context TEXT NOT NULL DEFAULT '',
  calculation_logic TEXT NOT NULL DEFAULT '',
  applicable_scenarios TEXT NOT NULL DEFAULT '',
  data_quality_notes TEXT NOT NULL DEFAULT '',
  default_sort TEXT,
  ```

`semantic_dimensions` 表（约 line 163）：
- 在 `"values" TEXT` 行之后新增列：
  ```sql
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'deprecated')),
  grain TEXT CHECK(grain IN ('day', 'week', 'month', 'quarter', 'year')),
  date_column TEXT,
  description TEXT NOT NULL DEFAULT '',
  ```

- [ ] **Step 3: 新增迁移逻辑——添加新列 + 清空旧数据**

在 `initTables()` 中，建表语句之后添加迁移代码（与现有 `semantic_models.status` 迁移模式一致）：

```typescript
// P2-2: Add new columns to semantic_metrics
const metricColumns = database.prepare("PRAGMA table_info(semantic_metrics)").all() as Array<{name: string}>;
const metricColNames = new Set(metricColumns.map(c => c.name));

if (!metricColNames.has('sql')) {
  try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN sql TEXT`); } catch {}
}
if (!metricColNames.has('metric_type')) {
  try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN metric_type TEXT NOT NULL DEFAULT 'atomic' CHECK(metric_type IN ('atomic', 'derived', 'compound'))`); } catch {}
}
if (!metricColNames.has('business_context')) {
  try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN business_context TEXT NOT NULL DEFAULT ''`); } catch {}
}
if (!metricColNames.has('calculation_logic')) {
  try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN calculation_logic TEXT NOT NULL DEFAULT ''`); } catch {}
}
if (!metricColNames.has('applicable_scenarios')) {
  try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN applicable_scenarios TEXT NOT NULL DEFAULT ''`); } catch {}
}
if (!metricColNames.has('data_quality_notes')) {
  try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN data_quality_notes TEXT NOT NULL DEFAULT ''`); } catch {}
}
if (!metricColNames.has('default_sort')) {
  try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN default_sort TEXT`); } catch {}
}

// P2-2: Add new columns to semantic_dimensions
const dimColumns = database.prepare("PRAGMA table_info(semantic_dimensions)").all() as Array<{name: string}>;
const dimColNames = new Set(dimColumns.map(c => c.name));

if (!dimColNames.has('status')) {
  try { database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'deprecated'))`); } catch {}
}
if (!dimColNames.has('grain')) {
  try { database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN grain TEXT CHECK(grain IN ('day', 'week', 'month', 'quarter', 'year'))`); } catch {}
}
if (!dimColNames.has('date_column')) {
  try { database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN date_column TEXT`); } catch {}
}
if (!dimColNames.has('description')) {
  try { database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN description TEXT NOT NULL DEFAULT ''`); } catch {}
}

// P2-2: Clear old test data (sql_expression-based metrics are incompatible with new sql field)
database.exec(`DELETE FROM semantic_metrics`);
database.exec(`DELETE FROM semantic_dimensions`);
database.exec(`DELETE FROM semantic_models`);
```

- [ ] **Step 4: 更新 createMetric 函数**

在 `packages/server/src/store.ts` 的 `createMetric` 函数（约 line 929）中：

将 INSERT 语句的字段列表从：
```sql
id, datasource_id, name, display_name, description, sql_expression, filters, dimensions, default_granularity, unit, category, aliases, status, version
```
改为：
```sql
id, datasource_id, name, display_name, description, sql, dimensions, default_granularity, unit, category, aliases, metric_type, business_context, calculation_logic, applicable_scenarios, data_quality_notes, default_sort, status, version
```

对应的 `input` 参数需包含新字段。函数签名中 `input` 的字段需添加：`sql`, `metric_type`, `business_context`, `calculation_logic`, `applicable_scenarios`, `data_quality_notes`, `default_sort`，删除 `sql_expression`, `filters`。

- [ ] **Step 5: 更新 updateMetric 函数**

在 `updateMetric` 函数（约 line 938）中：

将可更新字段数组从：
```typescript
["name", "display_name", "description", "sql_expression", "filters", "dimensions", "default_granularity", "unit", "category", "aliases", "status"]
```
改为：
```typescript
["name", "display_name", "description", "sql", "dimensions", "default_granularity", "unit", "category", "aliases", "metric_type", "business_context", "calculation_logic", "applicable_scenarios", "data_quality_notes", "default_sort", "status"]
```

- [ ] **Step 6: 更新 createDimension 函数**

在 `createDimension` 函数（约 line 972）中：

将 INSERT 字段从：
```sql
id, datasource_id, name, display_name, sql_expression, data_type, hierarchy, "values"
```
改为：
```sql
id, datasource_id, name, display_name, description, sql_expression, data_type, hierarchy, "values", status, grain, date_column
```

- [ ] **Step 7: 更新 updateDimension 函数**

在 `updateDimension` 函数（约 line 981）中：

将可更新字段数组从：
```typescript
["name", "display_name", "sql_expression", "data_type", "hierarchy", "values"]
```
改为：
```typescript
["name", "display_name", "description", "sql_expression", "data_type", "hierarchy", "values", "status", "grain", "date_column"]
```

- [ ] **Step 8: 运行 vitest 验证编译通过**

Run: `npx vitest run packages/server/src/routes/__tests__/semantic.test.ts`
Expected: 可能因类型变更失败（后续任务修复），但 store.ts 自身应编译无误

- [ ] **Step 9: 启动 dev server 验证建表迁移**

Run: `npm run dev:server`
Expected: 服务启动成功，数据库中 semantic_metrics 有 sql 列（无 sql_expression 列的新建实例）或新列已添加（已有数据库）

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/types.ts packages/server/src/store.ts
git commit -m "feat(P2-2): extend semantic layer data model — add metric_type, sql, dimension grain/status"
```

---

### Task 2: resolveSemanticSql 替代 buildSemanticSql

**Files:**
- Rewrite: `packages/server/src/agent/semantic-sql-builder.ts`
- Modify: `packages/server/src/agent/tools/lookup-semantic-layer.ts:1-149`

**Interfaces:**
- Consumes: Task 1 的 `SemanticMetric` 新类型（`sql`, `metric_type`, `default_sort`, `business_context` 等）
- Produces: `resolveSemanticSql()` 函数，供 `lookup-semantic-layer.ts` 调用

- [ ] **Step 1: 重写 semantic-sql-builder.ts**

完全替换 `packages/server/src/agent/semantic-sql-builder.ts` 内容：

```typescript
interface ResolveOptions {
  metric: {
    sql: string;
    name: string;
    metric_type: string;
    default_sort: string | null;
    business_context: string;
    calculation_logic: string;
    applicable_scenarios: string;
    data_quality_notes: string;
  };
  dimensions: Array<{
    name: string;
    sql_expression: string;
    data_type: string;
    grain: string | null;
    date_column: string | null;
  }>;
  model: {
    base_table: string;
    joins: string;
  } | null;
}

interface ResolveResult {
  sql: string;
  metric_type: string;
  available_dimensions: Array<{
    name: string;
    grain: string | null;
  }>;
  notes: string;
}

function getMetricTypeNotes(metricType: string): string {
  switch (metricType) {
    case 'atomic':
      return '基础聚合指标，可直接修改 WHERE 条件和 GROUP BY 维度';
    case 'derived':
      return '衍生指标，含比率/差值计算，修改时注意分子分母的同步';
    case 'compound':
      return '复合指标，含窗口函数/CTE，修改时注意 PARTITION BY 和 ORDER BY 子句';
    default:
      return '基础聚合指标，可直接修改 WHERE 条件和 GROUP BY 维度';
  }
}

export function resolveSemanticSql(options: ResolveOptions): ResolveResult {
  const { metric, dimensions } = options;

  const notesParts: string[] = [getMetricTypeNotes(metric.metric_type)];

  // Collect available dimensions with grain info
  const availableDimensions = dimensions.map(d => ({
    name: d.name,
    grain: d.grain,
  }));

  // Check if any dimension has grain info
  const timeDimensions = dimensions.filter(d => d.grain);
  if (timeDimensions.length > 0) {
    const grainOptions = ['day', 'week', 'month', 'quarter', 'year'];
    notesParts.push(`可调整时间粒度: ${grainOptions.join('/')}`);
  }

  return {
    sql: metric.sql,
    metric_type: metric.metric_type,
    available_dimensions: availableDimensions,
    notes: notesParts.join('。'),
  };
}
```

- [ ] **Step 2: 重写 lookup-semantic-layer.ts**

替换 `packages/server/src/agent/tools/lookup-semantic-layer.ts`，核心变更：

1. 导入 `resolveSemanticSql` 替代 `buildSemanticSql`
2. 维度匹配增加 `status === "published"` 过滤
3. 匹配到指标后，使用 `resolveSemanticSql` 构建返回
4. 返回文本格式包含新增的元数据字段
5. 未匹配行为不变

```typescript
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listMetrics, listDimensions, listModels, listDatasources } from "../../store.js";
import { resolveSemanticSql } from "../semantic-sql-builder.js";

const LookupSemanticLayerParams = Type.Object({
  datasource_id: Type.String({ description: "The datasource ID" }),
  query: Type.String({ description: "The search query (e.g. '销售额', 'GMV', '城市')" }),
});

type LookupSemanticLayerParams = Static<typeof LookupSemanticLayerParams>;

export function createLookupSemanticLayerTool(): AgentTool<typeof LookupSemanticLayerParams, { matched: boolean }> {
  return {
    name: "lookup_semantic_layer",
    description: `Search for pre-defined metrics and dimensions matching the user's question. Returns matching metrics with full SQL and metadata.

When a metric is found:
- atomic: simple aggregation, can modify WHERE/GROUP BY freely
- derived: contains arithmetic (ratios, differences), be careful to keep numerator/denominator in sync when modifying
- compound: contains window functions/CTE, be careful with PARTITION BY and ORDER BY clauses

If available dimensions have grain info, you can adjust time granularity (day/week/month/quarter/year).
Execute the returned SQL directly, or modify it based on the user's needs. Use skip_probe=true for semantic layer queries.
If no match, fall back to discover_schema + execute_sql.`,
    label: "Lookup Semantic Layer",
    parameters: LookupSemanticLayerParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as LookupSemanticLayerParams;
      try {
        const allDatasources = listDatasources();
        const enabledDatasources = allDatasources.filter(ds => ds.enabled);
        const validDs = enabledDatasources.find(ds => ds.id === typedParams.datasource_id);

        if (!validDs) {
          const dsList = enabledDatasources.map(ds =>
            `  - Name: "${ds.name}" | ID: ${ds.id}`
          ).join("\n");
          return {
            content: [{ type: "text" as const, text: `Invalid datasource_id. Available:\n\n${dsList}` }],
            details: { matched: false },
          };
        }

        const queryLower = typedParams.query.toLowerCase();
        const keywords = queryLower.split(/\s+|(?=[一-鿿])/).filter(w => w.length > 1);

        const metrics = listMetrics(typedParams.datasource_id).filter(m => m.status === "published");
        const dimensions = listDimensions(typedParams.datasource_id).filter(d => d.status === "published");
        const models = listModels(typedParams.datasource_id);

        // Search metrics
        const matchedMetrics = metrics.filter(m => {
          const nameMatch = m.name.toLowerCase().includes(queryLower) ||
            m.display_name.toLowerCase().includes(queryLower);
          const aliasMatch = (() => {
            try { return JSON.parse(m.aliases).some((a: string) => a.toLowerCase().includes(queryLower)); }
            catch { return false; }
          })();
          const keywordMatch = keywords.some(kw =>
            m.name.toLowerCase().includes(kw) ||
            m.display_name.toLowerCase().includes(kw) ||
            (() => { try { return JSON.parse(m.aliases).some((a: string) => a.toLowerCase().includes(kw)); } catch { return false; } })()
          );
          return nameMatch || aliasMatch || keywordMatch;
        });

        // Search dimensions
        const matchedDimensions = dimensions.filter(d => {
          const nameMatch = d.name.toLowerCase().includes(queryLower) ||
            d.display_name.toLowerCase().includes(queryLower);
          const valueMatch = (() => {
            try { return d.values ? JSON.parse(d.values!).some((v: string) => v.toLowerCase().includes(queryLower)) : false; }
            catch { return false; }
          })();
          const keywordMatch = keywords.some(kw =>
            d.name.toLowerCase().includes(kw) ||
            d.display_name.toLowerCase().includes(kw)
          );
          return nameMatch || valueMatch || keywordMatch;
        });

        if (matchedMetrics.length === 0 && matchedDimensions.length === 0) {
          return {
            content: [{ type: "text" as const, text: "未找到匹配的语义层指标。请使用 discover_schema 工具发现数据库结构，然后用 execute_sql 执行查询。" }],
            details: { matched: false },
          };
        }

        // Build results using resolveSemanticSql
        const resultParts: string[] = [];

        for (const m of matchedMetrics) {
          const mDims = (() => { try { return JSON.parse(m.dimensions) as string[]; } catch { return []; } })();
          const relevantDims = matchedDimensions.filter(d => mDims.includes(d.name));

          const matchingModel = models.find(mod => {
            try { return JSON.parse(mod.metrics).includes(m.name); } catch { return false; }
          });

          const resolved = resolveSemanticSql({
            metric: {
              sql: m.sql,
              name: m.name,
              metric_type: m.metric_type,
              default_sort: m.default_sort,
              business_context: m.business_context,
              calculation_logic: m.calculation_logic,
              applicable_scenarios: m.applicable_scenarios,
              data_quality_notes: m.data_quality_notes,
            },
            dimensions: relevantDims.map(d => ({
              name: d.name,
              sql_expression: d.sql_expression,
              data_type: d.data_type,
              grain: d.grain,
              date_column: d.date_column,
            })),
            model: matchingModel ? { base_table: matchingModel.base_table, joins: matchingModel.joins } : null,
          });

          let metricText = `匹配到指标: ${m.display_name} (${m.name}, ${resolved.metric_type})\n`;
          metricText += `SQL: ${resolved.sql}\n`;
          if (m.business_context) metricText += `业务描述: ${m.business_context}\n`;
          if (m.calculation_logic) metricText += `计算逻辑: ${m.calculation_logic}\n`;
          if (m.applicable_scenarios) metricText += `适用场景: ${m.applicable_scenarios}\n`;
          if (m.data_quality_notes) metricText += `数据质量: ${m.data_quality_notes}\n`;
          if (resolved.available_dimensions.length > 0) {
            const dimStr = resolved.available_dimensions.map(d =>
              d.grain ? `${d.name}(粒度:${d.grain})` : d.name
            ).join(', ');
            metricText += `可用维度: [${dimStr}]\n`;
          }
          metricText += `提示: ${resolved.notes}`;

          resultParts.push(metricText);
        }

        // Also list unmatched dimensions that were found
        for (const d of matchedDimensions) {
          const dimText = `匹配到维度: ${d.display_name} (${d.name}, ${d.data_type}${d.grain ? ', 粒度:' + d.grain : ''})`;
          resultParts.push(dimText);
        }

        const outputText = resultParts.join('\n\n') +
          '\n\n请根据用户需求决定：直接执行该 SQL，或修改维度/时间/筛选后执行。使用 skip_probe=true 标记语义层查询。';

        return {
          content: [{ type: "text" as const, text: outputText }],
          details: { matched: true },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error looking up semantic layer: ${(err as Error).message}` }],
          details: { matched: false },
          isError: true,
        };
      }
    },
  };
}
```

- [ ] **Step 3: 验证编译通过**

Run: `npx tsc --noEmit --project packages/server/tsconfig.json`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/agent/semantic-sql-builder.ts packages/server/src/agent/tools/lookup-semantic-layer.ts
git commit -m "feat(P2-2): replace buildSemanticSql with resolveSemanticSql, enrich lookup output"
```

---

### Task 3: EXPLAIN 验证函数 + 测试端点改造

**Files:**
- Modify: `packages/server/src/mysql/executor.ts`
- Modify: `packages/server/src/routes/semantic.ts:35-71, 19-33, 78-92`

**Interfaces:**
- Consumes: `getPool()` from `mysql/pool.ts`，`SemanticMetric.sql` 新字段
- Produces: `validateSqlViaExplain()` 函数，供 semantic.ts 路由调用

- [ ] **Step 1: 在 executor.ts 新增 validateSqlViaExplain 函数**

在 `packages/server/src/mysql/executor.ts` 末尾添加：

```typescript
/**
 * Validate a SQL statement by running EXPLAIN.
 * Returns { valid: true } if EXPLAIN succeeds, or { valid: false, error: string } if it fails.
 * Throws only on connection errors (not SQL errors).
 */
export async function validateSqlViaExplain(
  datasourceId: string,
  sql: string
): Promise<{ valid: true } | { valid: false; error: string }> {
  const pool = getPool(datasourceId);
  if (!pool) {
    return { valid: false, error: "数据源连接池不可用" };
  }

  const conn = await pool.getConnection();
  try {
    await conn.query(`EXPLAIN ${sql}`);
    return { valid: true };
  } catch (err) {
    const error = err as Error & { code?: string };
    return { valid: false, error: error.message || "SQL 验证失败" };
  } finally {
    conn.release();
  }
}
```

- [ ] **Step 2: 改造 POST /:dsId/metrics/:id/test 端点**

在 `packages/server/src/routes/semantic.ts` 中，将 test 端点（约 line 35-71）从自行拼装 SQL 改为直接执行 `metric.sql`：

```typescript
app.post("/api/datasources/:dsId/metrics/:id/test", async (c) => {
  const dsId = c.req.param("dsId");
  const id = c.req.param("id");

  const metric = getMetric(id);
  if (!metric || metric.datasource_id !== dsId) {
    return c.json({ error: "Metric not found" }, 404);
  }

  try {
    // Directly execute the metric's full SQL with LIMIT
    const testSql = metric.sql.trim().replace(/;?\s*$/, "") + " LIMIT 10";
    const result = await executeSql(dsId, testSql, { timeout: 5000, rowLimit: 10 });
    return c.json(result);
  } catch (err) {
    const error = err as Error;
    return c.json({ error: error.message }, 400);
  }
});
```

- [ ] **Step 3: 在 createMetric 和 updateMetric 路由中添加 EXPLAIN 验证**

在 `packages/server/src/routes/semantic.ts` 中：

1. 添加导入：`import { validateSqlViaExplain } from "../mysql/executor.js";`
2. 在 `POST /api/datasources/:dsId/metrics` 路由（约 line 19-23）中，在 `createMetric` 之前添加 EXPLAIN 验证：

```typescript
app.post("/api/datasources/:dsId/metrics", async (c) => {
  const dsId = c.req.param("dsId");
  const body = await c.req.json();

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

  const metric = createMetric({ ...body, datasource_id: dsId });
  return c.json(metric, 201);
});
```

3. 在 `PUT /api/datasources/:dsId/metrics/:id` 路由中，仅当 `sql` 字段被修改时验证：

```typescript
app.put("/api/datasources/:dsId/metrics/:id", async (c) => {
  const dsId = c.req.param("dsId");
  const id = c.req.param("id");
  const body = await c.req.json();

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

  const metric = updateMetric(id, body);
  return c.json(metric);
});
```

4. 在 `POST /api/datasources/:dsId/dimensions` 和 `PUT` 路由中添加维度验证（维度 sql_expression 需包装为 SELECT ... FROM 验证）：

```typescript
// Helper to validate dimension sql_expression
async function validateDimensionSql(dsId: string, sqlExpression: string): Promise<{ valid: true } | { valid: false; error: string }> {
  // Find a model to get base_table for wrapping
  const models = listModels ? (() => { try { return listModels(dsId); } catch { return []; } })() : [];
  if (models.length === 0) {
    // No models available, skip validation
    return { valid: true };
  }
  const baseTable = models[0].base_table;
  const wrappedSql = `SELECT ${sqlExpression} AS dim_test FROM ${baseTable} LIMIT 1`;
  return validateSqlViaExplain(dsId, wrappedSql);
}
```

在维度 create/update 路由中添加类似验证逻辑。

- [ ] **Step 4: 更新 AI suggest 路由中的字段名 sql_expression → sql**

在 `packages/server/src/routes/semantic.ts` 中，AI suggest 相关端点（约 line 117-613）：

1. 所有创建 metric 的地方，将 `sql_expression` 改为 `sql`
2. 删除 `filters` 字段的生成和传递
3. 添加新字段 `metric_type`, `business_context`, `calculation_logic`, `applicable_scenarios`, `data_quality_notes`, `default_sort`

此步骤需同时更新 DeepSeek API 调用的提示词（见 Task 5 详细内容），先做字段名重命名确保编译通过。

- [ ] **Step 5: 更新 batch-create-suggestions 端点**

在 `batch-create-suggestions` 路由（约 line 545-613）中：

1. metric 创建时将 `sql_expression` 映射为 `sql`
2. 删除 `filters` 字段
3. 添加新字段默认值（`metric_type: 'atomic'`, `business_context: ''` 等）
4. dimension 创建时添加 `status: 'draft'`, `description: ''`, `grain: null`, `date_column: null` 默认值

- [ ] **Step 6: 验证编译通过**

Run: `npx tsc --noEmit --project packages/server/tsconfig.json`
Expected: 无类型错误

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/mysql/executor.ts packages/server/src/routes/semantic.ts
git commit -m "feat(P2-2): add EXPLAIN validation on metric save, simplify test endpoint"
```

---

### Task 4: Agent 提示词更新

**Files:**
- Modify: `packages/server/src/agent/prompt-builder.ts:71-74`
- Modify: `packages/server/src/agent/tools/ai-suggest-semantic.ts:42-46`

**Interfaces:**
- Consumes: Task 2 的 `resolveSemanticSql` 输出格式
- Produces: 更新后的系统提示词和 AI 建议工具提示

- [ ] **Step 1: 更新 prompt-builder.ts 中的语义层指引**

在 `packages/server/src/agent/prompt-builder.ts` 中，找到语义层相关指令（约 line 71-74），替换为：

```
- When a user asks a data question, ALWAYS call lookup_semantic_layer first to check if pre-defined metrics match.
  - If a metric is found, you can execute its SQL directly, or modify it based on the user's needs.
  - atomic 类型指标：可直接追加 WHERE/GROUP BY，简单修改
  - derived 类型指标：修改时注意分子分母同步，避免计算错误
  - compound 类型指标：修改时注意窗口函数的 PARTITION BY 和 ORDER BY，避免破坏计算逻辑
  - 如需调整时间粒度：替换日期格式化函数（如 DATE_FORMAT 的格式参数）
  - 添加筛选条件：在 WHERE 子句中追加条件
  - 切换维度：修改 GROUP BY 和 SELECT 中的维度列
  - Mark semantic layer SQL with comment: /* source: semantic_layer */ — use skip_probe=true for these queries.
  - If no metric matches, call lookup_examples to find similar past queries as Few-Shot reference.
  - If no examples match either, generate SQL from scratch using discover_schema context.
```

- [ ] **Step 2: 更新 ai-suggest-semantic.ts 的工具输出提示**

在 `packages/server/src/agent/tools/ai-suggest-semantic.ts` 中，更新返回给 LLM 的提示文本（约 line 42-46），添加新字段指导：

将返回文本中的指标创建指导更新为包含：
- 使用 `sql` 字段（而非 `sql_expression`）存储完整可执行 SQL
- 包含 `metric_type` 判断规则
- 包含 `business_context`, `calculation_logic` 等新字段
- 维度创建指导包含 `description`, `grain`, `date_column`

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/agent/prompt-builder.ts packages/server/src/agent/tools/ai-suggest-semantic.ts
git commit -m "feat(P2-2): update agent prompts for enriched semantic layer output"
```

---

### Task 5: AI 建议提示词扩展

**Files:**
- Modify: `packages/server/src/routes/semantic.ts:117-613`（AI suggest 端点的 DeepSeek 提示词）

**Interfaces:**
- Consumes: Task 1 的新数据模型字段
- Produces: AI 返回的指标/维度包含新字段

- [ ] **Step 1: 更新 ai-preview-semantic 和 ai-suggest-semantic 的 DeepSeek 提示词**

在 `packages/server/src/routes/semantic.ts` 的 AI suggest 端点中，找到构建 DeepSeek API 请求的 system prompt（约 line 140-190），更新指标生成指导：

关键变更点：
1. 要求返回 `sql` 字段（完整可执行 SQL），不再返回 `sql_expression`（聚合表达式）
2. 删除 `filters` 字段
3. 新增 `metric_type` 判断规则和示例
4. 新增 `business_context`, `calculation_logic`, `applicable_scenarios`, `data_quality_notes`, `default_sort`
5. 维度新增 `description`, `grain`, `date_column`

提示词中的 JSON schema 示例更新为：
```json
{
  "metrics": [
    {
      "name": "revenue",
      "display_name": "销售额",
      "description": "订单总金额",
      "sql": "SELECT SUM(amount) AS revenue FROM orders",
      "metric_type": "atomic",
      "business_context": "订单总金额，包含已支付和待支付订单",
      "calculation_logic": "对 orders.amount 列求和",
      "applicable_scenarios": "月度经营分析、销售报表",
      "data_quality_notes": "",
      "default_sort": "revenue DESC",
      "dimensions": ["order_month", "region"],
      "unit": "元",
      "category": "销售",
      "aliases": ["营收", "收入"]
    }
  ],
  "dimensions": [
    {
      "name": "order_month",
      "display_name": "订单月份",
      "description": "订单创建时间的月份维度",
      "sql_expression": "DATE_FORMAT(created_at, '%Y-%m')",
      "data_type": "date",
      "grain": "month",
      "date_column": "orders.created_at",
      "hierarchy": null,
      "values": null
    }
  ]
}
```

- [ ] **Step 2: 更新 AI 响应解析逻辑**

在 AI 响应解析部分，将字段映射更新：
- `sql_expression` → `sql`（AI 返回 `sql`，直接传给 `createMetric`）
- 删除 `filters` 字段映射
- 添加 `metric_type` 默认值 `'atomic'`（如果 AI 未返回）
- 添加维度新字段映射

- [ ] **Step 3: 同样更新 ai-preview-dimensions 和 ai-suggest-dimensions 端点**

维度建议端点中添加 `description`, `grain`, `date_column` 字段的生成和映射。

- [ ] **Step 4: 同样更新 bulk-import-metrics 端点**

批量导入端点的提示词和解析逻辑同步更新。

- [ ] **Step 5: 验证编译通过**

Run: `npx tsc --noEmit --project packages/server/tsconfig.json`
Expected: 无类型错误

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/semantic.ts
git commit -m "feat(P2-2): extend AI suggest prompts with metric_type, full SQL, and enriched metadata"
```

---

### Task 6: 前端 API 类型 + client 更新

**Files:**
- Modify: `packages/web/src/api/client.ts:254-344`

**Interfaces:**
- Consumes: Task 1 的后端类型定义
- Produces: 前端 `SemanticMetric` 和 `SemanticDimension` 类型，供 MetricForm/DimensionForm/MetricsPage 使用

- [ ] **Step 1: 更新前端 SemanticMetric 接口**

在 `packages/web/src/api/client.ts` 中，`SemanticMetric` 接口（约 line 254）：

- 删除 `sql_expression` 字段
- 删除 `filters` 字段
- 新增 `sql: string`
- 新增 `metric_type: "atomic" | "derived" | "compound"`
- 新增 `business_context: string`
- 新增 `calculation_logic: string`
- 新增 `applicable_scenarios: string`
- 新增 `data_quality_notes: string`
- 新增 `default_sort: string | null`

- [ ] **Step 2: 更新前端 SemanticDimension 接口**

在 `packages/web/src/api/client.ts` 中，`SemanticDimension` 接口（约 line 273）：

- 新增 `status: "draft" | "published" | "deprecated"`
- 新增 `grain: "day" | "week" | "month" | "quarter" | "year" | null`
- 新增 `date_column: string | null`
- 新增 `description: string`

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/api/client.ts
git commit -m "feat(P2-2): update frontend API types for extended semantic layer"
```

---

### Task 7: MetricForm 前端扩展

**Files:**
- Modify: `packages/web/src/components/Metrics/MetricForm.tsx`

**Interfaces:**
- Consumes: Task 6 的前端 `SemanticMetric` 类型
- Produces: 更新后的 MetricForm 组件

- [ ] **Step 1: 更新表单 state 和初始化**

在 `MetricForm.tsx` 中：

1. 删除 `sqlExpression` 和 `filters` state
2. 新增 state：
   - `sql: string`（默认空）
   - `metricType: "atomic" | "derived" | "compound"`（默认 "atomic"）
   - `businessContext: string`（默认空）
   - `calculationLogic: string`（默认空）
   - `applicableScenarios: string`（默认空）
   - `dataQualityNotes: string`（默认空）
   - `defaultSort: string`（默认空）

3. 更新 `useEffect` 初始化逻辑：从 `metric.sql_expression` 改为 `metric.sql`，删除 `filters` 初始化，添加新字段初始化

- [ ] **Step 2: 更新 handleSubmit 提交逻辑**

在 `handleSubmit` 函数中：

1. 构建 payload 时使用 `sql` 替代 `sql_expression`
2. 删除 `filters` 字段
3. 添加新字段：`metric_type`, `business_context`, `calculation_logic`, `applicable_scenarios`, `data_quality_notes`, `default_sort`

- [ ] **Step 3: 更新表单 JSX**

1. 将 SQL 表达式区域从 `TableColumnPicker` 改为更适合完整 SQL 的编辑模式：
   - 保留 `TableColumnPicker` 作为辅助（可切换"可视化"和"SQL编辑"模式）
   - 将 `sqlExpression` 绑定改为 `sql`
   - 提示语改为"完整 SQL 语句"

2. 在 name/display_name 之后添加 metric_type 选择：
   ```jsx
   <div>
     <label className="block text-sm font-medium text-[--ink] mb-1">指标类型</label>
     <div className="flex gap-2">
       {[
         { value: 'atomic', label: '原子指标', desc: '单表聚合' },
         { value: 'derived', label: '衍生指标', desc: '比率/差值' },
         { value: 'compound', label: '复合指标', desc: '窗口函数/CTE' },
       ].map(t => (
         <button key={t.value} type="button"
           className={`px-3 py-1.5 rounded text-sm ${metricType === t.value ? 'bg-[--primary] text-white' : 'bg-[--surface] text-[--ink]'}`}
           onClick={() => setMetricType(t.value as any)}
         >
           {t.label}
           <span className="text-xs opacity-70 ml-1">{t.desc}</span>
         </button>
       ))}
     </div>
   </div>
   ```

3. 添加新 textarea 字段（在 SQL 编辑器之后）：
   - `business_context`：业务描述
   - `calculation_logic`：计算逻辑说明（derived/compound 时高亮提示）
   - `applicable_scenarios`：适用场景
   - `data_quality_notes`：数据质量提示

4. 添加 `default_sort` 文本输入（在 unit/category 附近）

5. 删除 `VisualFilterBuilder` 组件（`filters` 字段已废弃）

6. 保存按钮的错误展示更新：解析 EXPLAIN 验证错误信息并展示

- [ ] **Step 4: 验证页面可渲染**

Run: `npm run dev:web`
Expected: MetricForm 可正常渲染，新字段可见

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/Metrics/MetricForm.tsx
git commit -m "feat(P2-2): extend MetricForm with metric_type, full SQL, and metadata fields"
```

---

### Task 8: DimensionForm + MetricsPage 前端扩展

**Files:**
- Modify: `packages/web/src/components/Metrics/DimensionForm.tsx`
- Modify: `packages/web/src/components/Metrics/MetricsPage.tsx`

**Interfaces:**
- Consumes: Task 6 的前端 `SemanticDimension` 类型
- Produces: 更新后的 DimensionForm 和 MetricsPage 组件

- [ ] **Step 1: 更新 DimensionForm state 和初始化**

在 `DimensionForm.tsx` 中：

1. 新增 state：
   - `status: "draft" | "published" | "deprecated"`（默认 "draft"）
   - `description: string`（默认空）
   - `grain: "day" | "week" | "month" | "quarter" | "year" | ""`（默认 ""）
   - `dateColumn: string`（默认空）

2. 更新 `useEffect` 初始化：添加新字段初始化

- [ ] **Step 2: 更新 DimensionForm handleSubmit**

在提交 payload 中添加：`status`, `description`, `grain`（空字符串传 null）, `date_column`（空字符串传 null）

- [ ] **Step 3: 更新 DimensionForm JSX**

1. 在 data_type 选择器之后，添加 grain 下拉（仅 data_type === 'date' 时显示）：
   ```jsx
   {dataType === 'date' && (
     <>
       <div>
         <label className="block text-sm font-medium text-[--ink] mb-1">时间粒度</label>
         <select value={grain} onChange={e => setGrain(e.target.value as any)}
           className="w-full px-3 py-2 rounded border border-[--hairline] bg-[--surface]">
           <option value="">无</option>
           <option value="day">日</option>
           <option value="week">周</option>
           <option value="month">月</option>
           <option value="quarter">季</option>
           <option value="year">年</option>
         </select>
       </div>
       <div>
         <label className="block text-sm font-medium text-[--ink] mb-1">时间列</label>
         <input type="text" value={dateColumn} onChange={e => setDateColumn(e.target.value)}
           placeholder="如 orders.created_at"
           className="w-full px-3 py-2 rounded border border-[--hairline] bg-[--surface]" />
       </div>
     </>
   )}
   ```

2. 在 data_type 之前添加 description textarea
3. 在 hierarchy/values 之后添加 status 选择（与 MetricForm 一致的 radio buttons）

- [ ] **Step 4: 更新 MetricsPage — metric_type 标签**

在 `MetricsPage.tsx` 的指标列表中，为每个 metric 添加 metric_type 标签：

```jsx
<span className={`text-xs px-1.5 py-0.5 rounded ${
  metric.metric_type === 'atomic' ? 'bg-blue-100 text-blue-700' :
  metric.metric_type === 'derived' ? 'bg-green-100 text-green-700' :
  'bg-purple-100 text-purple-700'
}`}>
  {metric.metric_type === 'atomic' ? '原子' :
   metric.metric_type === 'derived' ? '衍生' : '复合'}
</span>
```

- [ ] **Step 5: 更新 MetricsPage — 维度 status 过滤**

在维度列表区域：
1. 添加 "显示废弃" toggle checkbox（与指标列表的 "Show deprecated" 一致）
2. 默认隐藏 `status === 'deprecated'` 的维度
3. 维度列表项显示 status badge

- [ ] **Step 6: 更新 MetricsPage — 维度 grain 显示**

在维度列表项中，如果维度有 grain，显示粒度信息：

```jsx
{dim.grain && (
  <span className="text-xs text-[--steel] ml-1">({dim.grain})</span>
)}
```

- [ ] **Step 7: 更新 AI 建议弹窗中的预览**

在 AI preview modal 中，为每个建议的 metric 显示 metric_type 和 business_context。

- [ ] **Step 8: 验证页面可交互**

Run: `npm run dev:web`
Expected: MetricForm 和 DimensionForm 新字段可编辑，MetricsPage 显示 metric_type 标签和维度 grain

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/components/Metrics/DimensionForm.tsx packages/web/src/components/Metrics/MetricsPage.tsx
git commit -m "feat(P2-2): extend DimensionForm with status/grain, update MetricsPage display"
```

---

### Task 9: 集成验证

**Files:**
- 无新增修改，仅端到端验证

- [ ] **Step 1: 启动后端验证**

Run: `npm run dev:server`
验证：
1. 服务启动成功
2. 数据库中 semantic_metrics 表有 `sql`, `metric_type`, `business_context` 等新列
3. 数据库中 semantic_dimensions 表有 `status`, `grain`, `date_column`, `description` 新列
4. 旧数据已清空

- [ ] **Step 2: 启动前端验证**

Run: `npm run dev:web`
验证：
1. 指标页面可加载，无 JS 报错
2. 创建指标时可选 metric_type
3. SQL 字段输入完整 SQL
4. 新增元数据字段可填写
5. 保存时触发 EXPLAIN 验证（有效 SQL 保存成功，无效 SQL 返回错误）
6. 维度表单可选 status、grain、date_column

- [ ] **Step 3: 验证 lookup_semantic_layer 工具行为**

通过 chat 界面：
1. 创建一个 published 状态的指标（完整 SQL）
2. 创建一个 published 状态的维度（含 grain）
3. 在聊天中输入匹配指标的问题
4. 验证 agent 调用 `lookup_semantic_layer` 后返回完整 SQL 和元数据
5. 验证 agent 直接执行或修改后执行该 SQL

- [ ] **Step 4: 验证 AI 建议功能**

1. 点击 "AI 建议指标" 按钮
2. 验证 AI 返回的建议包含 `sql`（完整 SQL）、`metric_type`、`business_context` 等新字段
3. 选择并批量创建建议
4. 验证创建的指标在列表中正确显示 metric_type 标签

- [ ] **Step 5: 验证维度过滤**

1. 创建 draft 和 published 状态的维度
2. 在聊天中验证 agent 只能看到 published 维度
3. 验证 MetricsPage 维度列表的 status 过滤功能

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(P2-2): semantic layer extension — complete integration"
```
