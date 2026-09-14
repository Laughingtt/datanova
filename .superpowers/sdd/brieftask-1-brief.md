# Task 1: 后端类型定义 + 数据模型扩展

## Context
This is the foundational task for P2-2 semantic layer extension. All subsequent tasks depend on the types and data model changes made here. The project is a monorepo with `packages/server` (Hono + Node.js, ESM) and `packages/web` (React + Vite). Server uses better-sqlite3 for metadata, mysql2 for user queries.

## Files to Modify
- `packages/server/src/types.ts:130-174` — TypeScript interface definitions
- `packages/server/src/store.ts:138-196, 917-1042` — SQLite table schemas + CRUD functions

## Requirements

### 1. Update SemanticMetric interface in types.ts
- DELETE field: `sql_expression: string`
- DELETE field: `filters: string`
- ADD field: `sql: string`
- ADD field: `metric_type: "atomic" | "derived" | "compound"`
- ADD field: `business_context: string`
- ADD field: `calculation_logic: string`
- ADD field: `applicable_scenarios: string`
- ADD field: `data_quality_notes: string`
- ADD field: `default_sort: string | null`

### 2. Update SemanticDimension interface in types.ts
- ADD field: `status: "draft" | "published" | "deprecated"`
- ADD field: `grain: "day" | "week" | "month" | "quarter" | "year" | null`
- ADD field: `date_column: string | null`
- ADD field: `description: string`

### 3. Update initTables() CREATE TABLE statements in store.ts

**semantic_metrics** table:
- Replace `sql_expression TEXT NOT NULL` with `sql TEXT NOT NULL`
- Remove `filters TEXT NOT NULL DEFAULT '[]'`
- After `aliases TEXT NOT NULL DEFAULT '[]'` line, add:
  ```sql
  metric_type TEXT NOT NULL DEFAULT 'atomic' CHECK(metric_type IN ('atomic', 'derived', 'compound')),
  business_context TEXT NOT NULL DEFAULT '',
  calculation_logic TEXT NOT NULL DEFAULT '',
  applicable_scenarios TEXT NOT NULL DEFAULT '',
  data_quality_notes TEXT NOT NULL DEFAULT '',
  default_sort TEXT,
  ```

**semantic_dimensions** table:
- After `"values" TEXT` line, add:
  ```sql
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'deprecated')),
  grain TEXT CHECK(grain IN ('day', 'week', 'month', 'quarter', 'year')),
  date_column TEXT,
  description TEXT NOT NULL DEFAULT '',
  ```

### 4. Add migration code in initTables() after CREATE TABLE statements
Use `PRAGMA table_info()` pattern (already used for semantic_models.status migration at line 267-269) to add new columns if they don't exist. Then clear all semantic layer data:

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

// Clear old test data
database.exec(`DELETE FROM semantic_metrics`);
database.exec(`DELETE FROM semantic_dimensions`);
database.exec(`DELETE FROM semantic_models`);
```

### 5. Update createMetric function in store.ts
Change INSERT field list from:
```
id, datasource_id, name, display_name, description, sql_expression, filters, dimensions, default_granularity, unit, category, aliases, status, version
```
to:
```
id, datasource_id, name, display_name, description, sql, dimensions, default_granularity, unit, category, aliases, metric_type, business_context, calculation_logic, applicable_scenarios, data_quality_notes, default_sort, status, version
```
Update values array accordingly.

### 6. Update updateMetric function in store.ts
Change updatable fields array from:
```typescript
["name", "display_name", "description", "sql_expression", "filters", "dimensions", "default_granularity", "unit", "category", "aliases", "status"]
```
to:
```typescript
["name", "display_name", "description", "sql", "dimensions", "default_granularity", "unit", "category", "aliases", "metric_type", "business_context", "calculation_logic", "applicable_scenarios", "data_quality_notes", "default_sort", "status"]
```

### 7. Update createDimension function in store.ts
Change INSERT field list from:
```
id, datasource_id, name, display_name, sql_expression, data_type, hierarchy, "values"
```
to:
```
id, datasource_id, name, display_name, description, sql_expression, data_type, hierarchy, "values", status, grain, date_column
```
Update values array accordingly.

### 8. Update updateDimension function in store.ts
Change updatable fields array from:
```typescript
["name", "display_name", "sql_expression", "data_type", "hierarchy", "values"]
```
to:
```typescript
["name", "display_name", "description", "sql_expression", "data_type", "hierarchy", "values", "status", "grain", "date_column"]
```
NOTE: Remember that `"values"` column name must be double-quoted in SQL SET clause (existing pattern at line 988).

## Global Constraints
- All server imports use `.js` extension (ESM requirement)
- SQLite columns can only be ADDed, not DROPped — `sql_expression` column stays but is no longer read
- `"values"` column name is a SQL reserved word, must be double-quoted in all SQL statements
- Test data — old data can be cleared directly, no migration needed
- All UI text in Simplified Chinese

## Verification
- Run `npx tsc --noEmit --project packages/server/tsconfig.json` — must compile cleanly
- Run `npm run dev:server` — must start successfully
