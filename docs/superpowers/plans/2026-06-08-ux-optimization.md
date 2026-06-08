# DataNova UX Optimization Plan — Semantic Layer, Schema, Dictionary

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the user onboarding flow, simplify semantic layer forms, improve AI annotation UX, and add browse mode to the data dictionary — enabling non-technical business users to efficiently input their database schema and business information into DataNova.

**Architecture:** Each enhancement is a self-contained UI feature. The onboarding wizard is a new React component that orchestrates existing pages. Schema annotation UX improvements are localized to SchemaEnhancement. Semantic layer form simplifications add helper components (table/column pickers, visual filter builder) consumed by MetricForm/DimensionForm/ModelForm. Data dictionary browse mode adds a new view mode to the existing DictionaryPage component.

**Tech Stack:** React 19 + TypeScript + TailwindCSS 3 + Zustand 5, Hono REST API, better-sqlite3

---

## File Structure Map

| File | Responsibility | Status |
|------|---------------|--------|
| `packages/web/src/components/Onboarding/OnboardingWizard.tsx` | Step-by-step wizard orchestrating 4 setup phases | **Create** |
| `packages/web/src/components/Onboarding/WizardStep.tsx` | Reusable wizard step layout component | **Create** |
| `packages/web/src/components/Schema/SchemaEnhancement.tsx` | AI annotation tab — add progress display, batch operations, inline reasoning | **Modify** |
| `packages/web/src/components/Schema/AIAnnotationProgress.tsx` | Animated progress indicator for AI annotation | **Create** |
| `packages/web/src/components/Metrics/TableColumnPicker.tsx` | Reusable table/column selector from discovered schema | **Create** |
| `packages/web/src/components/Metrics/VisualFilterBuilder.tsx` | Visual filter condition builder (column + operator + value) | **Create** |
| `packages/web/src/components/Metrics/MetricForm.tsx` | Metric create/edit — integrate pickers, simplify fields | **Modify** |
| `packages/web/src/components/Metrics/DimensionForm.tsx` | Dimension create/edit — integrate column picker | **Modify** |
| `packages/web/src/components/Metrics/ModelForm.tsx` | Model create/edit — integrate visual join builder | **Modify** |
| `packages/web/src/components/Dictionary/DictionaryPage.tsx` | Add browse-by-category mode, table relationship diagram | **Modify** |
| `packages/web/src/components/Dictionary/BrowseTree.tsx` | Hierarchical browse tree for tables/metrics/dimensions | **Create** |
| `packages/web/src/components/Dictionary/RelationshipDiagram.tsx` | SVG-based table relationship visualization | **Create** |
| `packages/web/src/stores/app.ts` | Add onboarding state (completed steps) | **Modify** |
| `packages/web/src/api/client.ts` | Add schema browse API client method | **Modify** |
| `packages/server/src/routes/schemas.ts` | Add schema browse endpoint for table relationships | **Modify** |

---

### Task 1: Add Schema Browse API

> Provides `/api/schemas/:dsId/browse` endpoint returning table relationships needed by the Table/Column Picker and Relationship Diagram components.

**Files:**
- Modify: `packages/server/src/routes/schemas.ts:1-10` (add route)
- Modify: `packages/web/src/api/client.ts:390-420` (add client method)

- [ ] **Step 1: Add browse endpoint to schemas route**

In `packages/server/src/routes/schemas.ts`, add the browse route after the existing schema-prompt-preview route (line ~96). Read the file first to find the exact insertion point, then add:

```typescript
  // Browse: return table structure with FK relationships for pickers
  app.get("/api/schemas/:dsId/browse", async (c) => {
    try {
      const dsId = c.req.param("dsId");
      const schema = await discoverSchema(dsId);
      const models = listModels(dsId);

      // Build table relationship graph from foreign keys
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

      // Build relationships: which tables reference which
      const relationships = schema.tables.flatMap(t =>
        t.foreignKeys.map(fk => ({
          fromTable: t.table.name,
          fromColumn: fk.columnName,
          toTable: fk.referencedTable,
          toColumn: fk.referencedColumn,
        }))
      );

      return c.json({
        tables,
        relationships,
        modelNames: models.map(m => m.name),
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });
```

You need to import `discoverSchema` and `listModels` at the top of schemas.ts. Check existing imports and add if missing:
```typescript
import { discoverSchema } from "../mysql/discovery.js";
import { listModels } from "../store.js";
```

- [ ] **Step 2: Verify route compiles**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json
```

Expected: Clean output, no errors.

- [ ] **Step 3: Add API client method**

In `packages/web/src/api/client.ts`, add at the end of the file before the closing:

```typescript
// ==================== Schema Browse ====================

export interface BrowseTable {
  name: string;
  comment?: string;
  columns: Array<{ name: string; type: string; comment?: string; isPrimaryKey: boolean }>;
  foreignKeys: Array<{ name: string; columnName: string; referencedTable: string; referencedColumn: string }>;
}

export interface SchemaBrowseResponse {
  tables: BrowseTable[];
  relationships: Array<{ fromTable: string; fromColumn: string; toTable: string; toColumn: string }>;
  modelNames: string[];
}

export const schemaBrowseApi = {
  tables: (dsId: string) =>
    request<SchemaBrowseResponse>(`/api/schemas/${dsId}/browse`),
};
```

- [ ] **Step 4: Build and test**

```bash
npm run build --workspace=packages/server
# Start server
DATANOVA_DIR="/tmp/test-browse" node packages/server/dist/index.js &
sleep 3
# Test endpoint
curl -s http://localhost:3000/api/schemas/test-ds/browse
# Expected: JSON with tables/relationships/modelNames (may error if no ds, that's OK)
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/schemas.ts packages/web/src/api/client.ts
git commit -m "feat: add schema browse API with relationship graph"
```

---

### Task 2: Build Reusable Table/Column Picker Component

> Creates `TableColumnPicker` — a dropdown component that lets users select tables and columns from discovered schema, replacing manual text entry in semantic layer forms.

**Files:**
- Create: `packages/web/src/components/Metrics/TableColumnPicker.tsx`

- [ ] **Step 1: Create the TableColumnPicker component**

Create `packages/web/src/components/Metrics/TableColumnPicker.tsx`:

```tsx
import { useState, useEffect } from "react";
import { schemaBrowseApi, type BrowseTable } from "../../api/client";

interface TableColumnPickerProps {
  datasourceId: string;
  /** Current SQL expression value (e.g. "orders.amount" or "SUM(orders.amount)") */
  value: string;
  onChange: (sqlExpr: string) => void;
  /** Mode: "column" for single column, "aggregate" adds SUM/AVG/COUNT wrappers */
  mode?: "column" | "aggregate";
  placeholder?: string;
}

export default function TableColumnPicker({
  datasourceId,
  value,
  onChange,
  mode = "column",
  placeholder = "Select a table column...",
}: TableColumnPickerProps) {
  const [tables, setTables] = useState<BrowseTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Aggregation function if in aggregate mode
  const [aggFunc, setAggFunc] = useState<string>("SUM");

  useEffect(() => {
    if (!datasourceId) return;
    setLoading(true);
    schemaBrowseApi.tables(datasourceId)
      .then(res => { setTables(res.tables); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [datasourceId]);

  const handleSelectColumn = (tableName: string, columnName: string) => {
    const expr = mode === "aggregate"
      ? `${aggFunc}(${tableName}.${columnName})`
      : `${tableName}.${columnName}`;
    onChange(expr);
    setShowPicker(false);
  };

  return (
    <div className="relative">
      {/* Input + toggle */}
      <div className="flex gap-2">
        <input
          className="input-field flex-1 font-mono text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="btn-ghost text-xs whitespace-nowrap px-3 py-1.5 border border-[var(--hairline)] rounded-md"
        >
          {showPicker ? "✕ Close" : "📋 Browse"}
        </button>
      </div>

      {/* Picker dropdown */}
      {showPicker && (
        <div className="absolute z-50 mt-2 w-full max-h-[320px] overflow-y-auto bg-[var(--surface)] border border-[var(--hairline-strong)] rounded-lg shadow-lg p-3">
          {loading && <p className="text-xs text-[var(--steel)] py-2">Loading schema...</p>}
          {error && <p className="text-xs text-[var(--error)] py-2">{error}</p>}

          {mode === "aggregate" && (
            <div className="mb-3 flex items-center gap-2">
              <label className="text-xs text-[var(--steel)]">Aggregation:</label>
              {["SUM", "AVG", "COUNT", "MAX", "MIN"].map(fn => (
                <button
                  key={fn}
                  type="button"
                  onClick={() => setAggFunc(fn)}
                  className={`text-xs px-2 py-0.5 rounded ${
                    aggFunc === fn
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--canvas)] text-[var(--steel)] hover:bg-[var(--hairline-soft)]"
                  }`}
                >
                  {fn}
                </button>
              ))}
            </div>
          )}

          {tables.map(table => (
            <div key={table.name} className="mb-2">
              <p className="text-xs font-medium text-[var(--ink)] mb-1 flex items-center gap-1">
                <span className="text-[var(--stone)]">📄</span>
                {table.name}
                {table.comment && (
                  <span className="text-[var(--stone)] font-normal">— {table.comment}</span>
                )}
              </p>
              <div className="ml-4 space-y-0.5">
                {table.columns.map(col => (
                  <button
                    key={`${table.name}.${col.name}`}
                    type="button"
                    onClick={() => handleSelectColumn(table.name, col.name)}
                    className="w-full text-left flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-[var(--primary-soft)] transition-colors"
                  >
                    <span className="font-mono text-[var(--ink)]">{col.name}</span>
                    <span className="font-mono text-[var(--stone)]">{col.type}</span>
                    {col.isPrimaryKey && (
                      <span className="text-[var(--primary-text)] font-mono text-[10px]">PK</span>
                    )}
                    {col.comment && (
                      <span className="text-[var(--steel)] truncate">— {col.comment}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit -p packages/web/tsconfig.json
```

Expected: Clean output.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Metrics/TableColumnPicker.tsx
git commit -m "feat: add reusable table/column picker component"
```

---

### Task 3: Build Visual Filter Builder Component

> Creates `VisualFilterBuilder` — replaces the JSON filter textarea with a visual form for building WHERE conditions.

**Files:**
- Create: `packages/web/src/components/Metrics/VisualFilterBuilder.tsx`

- [ ] **Step 1: Create VisualFilterBuilder component**

Create `packages/web/src/components/Metrics/VisualFilterBuilder.tsx`:

```tsx
import { useState, useEffect } from "react";
import { schemaBrowseApi, type BrowseTable } from "../../api/client";

export interface FilterCondition {
  column: string;  // "table.column" format
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "IN" | "LIKE" | "IS NULL";
  value: string;
}

interface VisualFilterBuilderProps {
  datasourceId: string;
  filters: string; // JSON string from metric.filters
  onChange: (filtersJson: string) => void;
}

const OPERATORS: { value: FilterCondition["operator"]; label: string }[] = [
  { value: "=", label: "=" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
  { value: "IN", label: "IN" },
  { value: "LIKE", label: "LIKE" },
  { value: "IS NULL", label: "IS NULL" },
];

export default function VisualFilterBuilder({
  datasourceId,
  filters,
  onChange,
}: VisualFilterBuilderProps) {
  const [conditions, setConditions] = useState<FilterCondition[]>(() => {
    try { return JSON.parse(filters); } catch { return []; }
  });
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!datasourceId) return;
    schemaBrowseApi.tables(datasourceId)
      .then(res => {
        const cols = res.tables.flatMap(t =>
          t.columns.map(c => `${t.name}.${c.name}`)
        );
        setColumns(cols);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [datasourceId]);

  const emit = (updated: FilterCondition[]) => {
    setConditions(updated);
    onChange(JSON.stringify(updated.filter(c => c.column)));
  };

  const addCondition = () => {
    emit([...conditions, { column: "", operator: "=", value: "" }]);
  };

  const removeCondition = (index: number) => {
    emit(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: keyof FilterCondition, val: string) => {
    const updated = conditions.map((c, i) =>
      i === index ? { ...c, [field]: val } : c
    );
    emit(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="label-mono mb-0">Filters</label>
        <button type="button" onClick={addCondition} className="btn-ghost text-xs">
          + Add Filter
        </button>
      </div>

      <div className="p-3 rounded-md border border-[var(--hairline-strong)] bg-[var(--canvas)] min-h-[44px]">
        {conditions.length === 0 ? (
          <p className="text-xs text-[var(--stone)]">No filters. Click "+ Add Filter" to add one.</p>
        ) : (
          <div className="space-y-2">
            {conditions.map((cond, index) => (
              <div key={index} className="flex items-center gap-2">
                {/* Column selector */}
                <select
                  className="input-field py-1.5 text-xs font-mono flex-1 min-w-0"
                  value={cond.column}
                  onChange={(e) => updateCondition(index, "column", e.target.value)}
                >
                  <option value="">Select column...</option>
                  {columns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>

                {/* Operator selector */}
                <select
                  className="input-field py-1.5 text-xs w-24"
                  value={cond.operator}
                  onChange={(e) => updateCondition(index, "operator", e.target.value)}
                >
                  {OPERATORS.map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>

                {/* Value input (hidden for IS NULL) */}
                {cond.operator !== "IS NULL" && (
                  <input
                    type="text"
                    className="input-field py-1.5 text-xs font-mono flex-1 min-w-0"
                    value={cond.value}
                    onChange={(e) => updateCondition(index, "value", e.target.value)}
                    placeholder="value"
                  />
                )}

                <button
                  type="button"
                  onClick={() => removeCondition(index)}
                  className="text-[var(--error)] hover:opacity-80 text-xs px-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit -p packages/web/tsconfig.json
```

Expected: Clean output.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Metrics/VisualFilterBuilder.tsx
git commit -m "feat: add visual filter builder component"
```

---

### Task 4: Simplify MetricForm with Pickers

> Integrate TableColumnPicker and VisualFilterBuilder into MetricForm, replacing raw text areas.

**Files:**
- Modify: `packages/web/src/components/Metrics/MetricForm.tsx:1-382`

- [ ] **Step 1: Replace SQL Expression textarea with TableColumnPicker**

In `packages/web/src/components/Metrics/MetricForm.tsx`, add imports at top:
```typescript
import TableColumnPicker from "./TableColumnPicker";
import VisualFilterBuilder from "./VisualFilterBuilder";
```

Then find the SQL Expression section (around line 170-180) — the `<textarea>` with `sqlExpression` binding — and replace it with:

```tsx
        {/* SQL Expression */}
        <div>
          <label className="label-mono">SQL Expression</label>
          <TableColumnPicker
            datasourceId={datasourceId}
            value={sqlExpression}
            onChange={setSqlExpression}
            mode="aggregate"
            placeholder="SUM(table.column)"
          />
        </div>
```

- [ ] **Step 2: Replace Filters JSON textarea with VisualFilterBuilder**

Find the Filters section (around line 183-192) and replace with:

```tsx
        {/* Filters */}
        <VisualFilterBuilder
          datasourceId={datasourceId}
          filters={filters}
          onChange={setFilters}
        />
```

- [ ] **Step 3: Remove unused imports and verify**

Remove any unused imports. Run:
```bash
npx tsc --noEmit -p packages/web/tsconfig.json
```

Expected: Clean output. Fix any unused variable warnings.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/Metrics/MetricForm.tsx
git commit -m "refactor: simplify MetricForm with table/column picker and visual filter builder"
```

---

### Task 5: Simplify DimensionForm with Column Picker

> Integrate TableColumnPicker into DimensionForm for the SQL Expression field.

**Files:**
- Modify: `packages/web/src/components/Metrics/DimensionForm.tsx:113-122`

- [ ] **Step 1: Replace SQL Expression textarea**

Add import at top of `DimensionForm.tsx`:
```typescript
import TableColumnPicker from "./TableColumnPicker";
```

Replace the SQL Expression `<textarea>` (around line 116-122) with:

```tsx
        {/* SQL Expression */}
        <div>
          <label className="label-mono">SQL Expression</label>
          <TableColumnPicker
            datasourceId={datasourceId}
            value={sqlExpression}
            onChange={setSqlExpression}
            mode="column"
            placeholder="orders.region_code"
          />
        </div>
```

- [ ] **Step 2: Verify compilation and commit**

```bash
npx tsc --noEmit -p packages/web/tsconfig.json
```

```bash
git add packages/web/src/components/Metrics/DimensionForm.tsx
git commit -m "refactor: simplify DimensionForm with table column picker"
```

---

### Task 6: Add Visual Join Builder to ModelForm

> Replace the manual JOIN input fields in ModelForm with a visual builder that suggests tables and columns from discovered schema.

**Files:**
- Modify: `packages/web/src/components/Metrics/ModelForm.tsx:190-245`

- [ ] **Step 1: Add schema loading and column suggestions to ModelForm**

Add imports at top:
```typescript
import { useState, useEffect } from "react"; // already imported
import { schemaBrowseApi } from "../../api/client";
```

Add schema state inside the component (after existing state declarations, around line 63):
```typescript
  const [schemaTables, setSchemaTables] = useState<string[]>([]);
  const [schemaColumns, setSchemaColumns] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!datasourceId) return;
    schemaBrowseApi.tables(datasourceId).then(res => {
      setSchemaTables(res.tables.map(t => t.name));
      const colMap: Record<string, string[]> = {};
      res.tables.forEach(t => { colMap[t.name] = t.columns.map(c => c.name); });
      setSchemaColumns(colMap);
    }).catch(() => {});
  }, [datasourceId]);
```

- [ ] **Step 2: Replace base_table input with dropdown selector**

Find the base_table input (around line 167-176) and replace:
```tsx
          <div>
            <label className="label-mono">Base Table</label>
            {schemaTables.length > 0 ? (
              <select
                className="input-field font-mono text-xs"
                value={baseTable}
                onChange={(e) => setBaseTable(e.target.value)}
                required
              >
                <option value="">Select table...</option>
                {schemaTables.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            ) : (
              <input
                className="input-field font-mono text-xs"
                value={baseTable}
                onChange={(e) => setBaseTable(e.target.value)}
                required
                placeholder="orders"
              />
            )}
          </div>
```

- [ ] **Step 3: Add column suggestions to join inputs**

Replace the join table/on inputs (around line 222-234) with dropdowns. Replace the `updateJoin(i, "table", ...)` input:
```tsx
                  {schemaTables.length > 0 ? (
                    <select
                      className="input-field flex-1 py-1.5 text-xs font-mono"
                      value={join.table}
                      onChange={(e) => updateJoin(i, "table", e.target.value)}
                    >
                      <option value="">table</option>
                      {schemaTables.filter(t => t !== baseTable).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input-field flex-1 py-1.5 text-xs font-mono"
                      value={join.table}
                      onChange={(e) => updateJoin(i, "table", e.target.value)}
                      placeholder="table_name"
                    />
                  )}
```

And replace the ON input:
```tsx
                  <input
                    className="input-field flex-1 py-1.5 text-xs font-mono"
                    value={join.on}
                    onChange={(e) => updateJoin(i, "on", e.target.value)}
                    placeholder={baseTable ? `${baseTable}.id = table.${baseTable.slice(0, -1)}_id` : "a.id = b.a_id"}
                  />
```

- [ ] **Step 4: Verify compilation and commit**

```bash
npx tsc --noEmit -p packages/web/tsconfig.json
```

```bash
git add packages/web/src/components/Metrics/ModelForm.tsx
git commit -m "refactor: add table selector and column suggestions to ModelForm"
```

---

### Task 7: Improve AI Annotation UX with Progress and Batch Operations

> Add animated progress display during AI annotation, show AI reasoning inline, and enable bulk confirm/reject for draft annotations.

**Files:**
- Create: `packages/web/src/components/Schema/AIAnnotationProgress.tsx`
- Modify: `packages/web/src/components/Schema/SchemaEnhancement.tsx:15-330`

- [ ] **Step 1: Create AIAnnotationProgress component**

Create `packages/web/src/components/Schema/AIAnnotationProgress.tsx`:

```tsx
interface AIAnnotationProgressProps {
  status: "discovering" | "analyzing" | "generating" | "done" | "error";
  message: string;
  tableCount: number;
  completedCount: number;
}

const STATUS_ICONS: Record<string, string> = {
  discovering: "🔍",
  analyzing: "🧠",
  generating: "✍️",
  done: "✅",
  error: "❌",
};

export default function AIAnnotationProgress({
  status,
  message,
  tableCount,
  completedCount,
}: AIAnnotationProgressProps) {
  const progress = tableCount > 0 ? Math.round((completedCount / tableCount) * 100) : 0;
  const isRunning = status !== "done" && status !== "error";

  return (
    <div className="p-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary-soft)]/30">
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-lg ${isRunning ? "animate-pulse" : ""}`}>
          {STATUS_ICONS[status] ?? "🔄"}
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--ink)]">{message}</p>
          {tableCount > 0 && (
            <p className="text-xs text-[var(--steel)] mt-0.5">
              {completedCount}/{tableCount} tables processed
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isRunning && tableCount > 0 && (
        <div className="w-full h-1.5 bg-[var(--hairline-soft)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--primary)] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {status === "error" && (
        <p className="text-xs text-[var(--error)] mt-2">{message}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add import and state to SchemaEnhancement**

Add import at top of `SchemaEnhancement.tsx`:
```typescript
import AIAnnotationProgress from "./AIAnnotationProgress";
```

Add new state for progress tracking (in the AI Annotate state section, around line 18-22):
```typescript
  const [annotateProgress, setAnnotateProgress] = useState<{
    status: "discovering" | "analyzing" | "generating" | "done" | "error";
    message: string;
    tableCount: number;
    completedCount: number;
  } | null>(null);
```

- [ ] **Step 3: Update handleAiAnnotate with progress steps**

Replace `handleAiAnnotate` (around line 42-57) with:

```typescript
  const handleAiAnnotate = async () => {
    if (selectedTables.size === 0) return;
    setAnnotating(true);
    setAnnotateError(null);
    setDraftAnnotations([]);

    const tableList = Array.from(selectedTables);

    try {
      // Step 1: Discovering schema
      setAnnotateProgress({
        status: "discovering",
        message: "Discovering schema and sample data for selected tables...",
        tableCount: tableList.length,
        completedCount: 0,
      });

      // Step 2: AI analyzing and generating
      setAnnotateProgress({
        status: "generating",
        message: "AI is analyzing table structures and generating business annotations...",
        tableCount: tableList.length,
        completedCount: 0,
      });

      await schemasApi.aiAnnotate(datasourceId, tableList);

      // Step 3: Reload to get drafts
      setAnnotateProgress({
        status: "done",
        message: `Annotation complete. Review ${tableList.length} table(s) below.`,
        tableCount: tableList.length,
        completedCount: tableList.length,
      });

      const schemaResp = await schemasApi.get(datasourceId);
      const drafts = schemaResp.annotations.filter((a) => a.status === "draft");
      setDraftAnnotations(drafts);
    } catch (err) {
      setAnnotateError((err as Error).message);
      setAnnotateProgress({
        status: "error",
        message: (err as Error).message,
        tableCount: tableList.length,
        completedCount: 0,
      });
    } finally {
      setAnnotating(false);
    }
  };
```

- [ ] **Step 4: Add bulk accept/reject buttons for draft annotations**

Find the draft annotations section (around line 202-215) and add bulk actions:

Replace:
```tsx
          {draftAnnotations.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--ink)] mb-3">
                Draft Annotations ({draftAnnotations.length})
              </h3>
              <AIAnnotationReview ... />
            </div>
          )}
```

With:
```tsx
          {draftAnnotations.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-[var(--ink)]">
                  Draft Annotations ({draftAnnotations.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      for (const a of draftAnnotations) {
                        await schemasApi.confirmAnnotation(datasourceId, a.id);
                      }
                      setDraftAnnotations([]);
                    }}
                    className="btn-primary text-xs"
                  >
                    ✓ Accept All
                  </button>
                  <button
                    onClick={() => setDraftAnnotations([])}
                    className="btn-ghost text-xs"
                  >
                    ✗ Reject All
                  </button>
                </div>
              </div>
              <AIAnnotationReview
                annotations={draftAnnotations}
                datasourceId={datasourceId}
                onConfirm={handleConfirmAnnotation}
                onReject={handleRejectAnnotation}
                onEdit={handleEditAnnotation}
              />
            </div>
          )}
```

- [ ] **Step 5: Render AIAnnotationProgress in the AI Annotate tab**

Add progress display before the annotate button, after the table selection section. Insert after the table chips (around line 187) and before the button (around line 188):

```tsx
          {annotateProgress && (
            <AIAnnotationProgress
              status={annotateProgress.status}
              message={annotateProgress.message}
              tableCount={annotateProgress.tableCount}
              completedCount={annotateProgress.completedCount}
            />
          )}
```

- [ ] **Step 6: Add table search/filter in the table list**

Add a search input above the table chips in the AI Annotate tab (after the "Select tables to annotate" heading, line 160-161):

```tsx
  const [tableSearch, setTableSearch] = useState("");

  // In the render, add before the table chips:
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search tables..."
              className="w-full px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] placeholder-[var(--steel)] focus:outline-none focus:border-[var(--primary)] mb-3"
            />
```

Then filter the table list:
```tsx
            <div className="flex flex-wrap gap-2">
              {tables
                .filter(t => !tableSearch || t.toLowerCase().includes(tableSearch.toLowerCase()))
                .map((name) => (
```

Add the `tableSearch` state to the component's state declarations (near line 15-16, after tab state):
```typescript
  const [tableSearch, setTableSearch] = useState("");
```

- [ ] **Step 7: Verify compilation and commit**

```bash
npx tsc --noEmit -p packages/web/tsconfig.json
```

```bash
git add packages/web/src/components/Schema/AIAnnotationProgress.tsx \
        packages/web/src/components/Schema/SchemaEnhancement.tsx
git commit -m "feat: add AI annotation progress display, bulk actions, and table search"
```

---

### Task 8: Add Browse Mode to Data Dictionary

> Add a tree-based browse mode showing tables grouped by category, with a collapsible relationship diagram.

**Files:**
- Create: `packages/web/src/components/Dictionary/BrowseTree.tsx`
- Create: `packages/web/src/components/Dictionary/RelationshipDiagram.tsx`
- Modify: `packages/web/src/components/Dictionary/DictionaryPage.tsx:117-320`

- [ ] **Step 1: Create BrowseTree component**

Create `packages/web/src/components/Dictionary/BrowseTree.tsx`:

```tsx
import { useState, useEffect } from "react";
import { schemaBrowseApi, type BrowseTable } from "../../api/client";
import { semanticApi, type SemanticMetric, type SemanticDimension } from "../../api/client";

interface BrowseTreeProps {
  datasourceId: string;
  onSelectTable: (tableName: string) => void;
  onSelectMetric: (metric: SemanticMetric) => void;
  onSelectDimension: (dimension: SemanticDimension) => void;
}

export default function BrowseTree({
  datasourceId,
  onSelectTable,
  onSelectMetric,
  onSelectDimension,
}: BrowseTreeProps) {
  const [tables, setTables] = useState<BrowseTable[]>([]);
  const [metrics, setMetrics] = useState<SemanticMetric[]>([]);
  const [dimensions, setDimensions] = useState<SemanticDimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["tables", "metrics", "dimensions"])
  );
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!datasourceId) return;
    setLoading(true);
    Promise.all([
      schemaBrowseApi.tables(datasourceId),
      semanticApi.listMetrics(datasourceId).catch(() => [] as SemanticMetric[]),
      semanticApi.listDimensions(datasourceId).catch(() => [] as SemanticDimension[]),
    ]).then(([schema, m, d]) => {
      setTables(schema.tables);
      setMetrics(m);
      setDimensions(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [datasourceId]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleTable = (name: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  if (loading) return <p className="text-xs text-[var(--steel)] py-4">Loading...</p>;

  return (
    <div className="space-y-1">
      {/* Tables Section */}
      <div>
        <button
          onClick={() => toggleSection("tables")}
          className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface)] rounded"
        >
          <span className="text-xs">{expandedSections.has("tables") ? "▼" : "▶"}</span>
          <span>📄</span> Tables ({tables.length})
        </button>
        {expandedSections.has("tables") && (
          <div className="ml-6 space-y-0.5">
            {tables.map(table => (
              <div key={table.name}>
                <button
                  onClick={() => { toggleTable(table.name); onSelectTable(table.name); }}
                  className="w-full flex items-center gap-1 px-2 py-1.5 text-left text-xs hover:bg-[var(--surface)] rounded"
                >
                  <span className="text-[10px]">{expandedTables.has(table.name) ? "▼" : "▶"}</span>
                  <span className="font-mono text-[var(--ink)]">{table.name}</span>
                  <span className="text-[var(--stone)] ml-auto">{table.columns.length} cols</span>
                </button>
                {expandedTables.has(table.name) && (
                  <div className="ml-6 space-y-0.5">
                    {table.columns.map(col => (
                      <div key={`${table.name}.${col.name}`} className="flex items-center gap-2 px-2 py-1 text-xs">
                        <span className="font-mono text-[var(--ink)]">{col.name}</span>
                        <span className="font-mono text-[var(--stone)]">{col.type}</span>
                        {col.isPrimaryKey && <span className="text-[var(--primary-text)] text-[10px]">PK</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metrics Section */}
      <div>
        <button
          onClick={() => toggleSection("metrics")}
          className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface)] rounded"
        >
          <span className="text-xs">{expandedSections.has("metrics") ? "▼" : "▶"}</span>
          <span>📊</span> Metrics ({metrics.length})
        </button>
        {expandedSections.has("metrics") && (
          <div className="ml-6 space-y-0.5">
            {metrics.length === 0 ? (
              <p className="text-xs text-[var(--stone)] px-2 py-1">No metrics defined</p>
            ) : (
              metrics.map(m => (
                <button
                  key={m.id}
                  onClick={() => onSelectMetric(m)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--surface)] rounded"
                >
                  <span className="text-[var(--ink)]">{m.display_name || m.name}</span>
                  <span className="text-[var(--stone)] ml-2 font-mono">{m.sql_expression}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Dimensions Section */}
      <div>
        <button
          onClick={() => toggleSection("dimensions")}
          className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface)] rounded"
        >
          <span className="text-xs">{expandedSections.has("dimensions") ? "▼" : "▶"}</span>
          <span>📐</span> Dimensions ({dimensions.length})
        </button>
        {expandedSections.has("dimensions") && (
          <div className="ml-6 space-y-0.5">
            {dimensions.length === 0 ? (
              <p className="text-xs text-[var(--stone)] px-2 py-1">No dimensions defined</p>
            ) : (
              dimensions.map(d => (
                <button
                  key={d.id}
                  onClick={() => onSelectDimension(d)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--surface)] rounded"
                >
                  <span className="text-[var(--ink)]">{d.display_name || d.name}</span>
                  <span className="text-[var(--stone)] ml-2 font-mono">{d.data_type}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create RelationshipDiagram component**

Create `packages/web/src/components/Dictionary/RelationshipDiagram.tsx`:

```tsx
import { useState, useEffect } from "react";
import { schemaBrowseApi } from "../../api/client";

interface RelationshipDiagramProps {
  datasourceId: string;
}

interface Relationship {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export default function RelationshipDiagram({ datasourceId }: RelationshipDiagramProps) {
  const [tables, setTables] = useState<string[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasourceId) return;
    schemaBrowseApi.tables(datasourceId)
      .then(res => {
        setTables(res.tables.map(t => t.name));
        setRelationships(res.relationships);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [datasourceId]);

  if (loading) return <p className="text-xs text-[var(--steel)]">Loading relationships...</p>;
  if (error) return <p className="text-xs text-[var(--error)]">{error}</p>;
  if (relationships.length === 0) return <p className="text-xs text-[var(--steel)]">No relationships discovered</p>;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-[var(--ink)]">Table Relationships</h4>
      <div className="space-y-1.5">
        {relationships.map((rel, i) => (
          <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-[var(--surface)] border border-[var(--hairline)]">
            <span className="font-mono text-[var(--ink)]">{rel.fromTable}</span>
            <span className="font-mono text-[var(--stone)]">.{rel.fromColumn}</span>
            <span className="text-[var(--primary-text)]">→</span>
            <span className="font-mono text-[var(--ink)]">{rel.toTable}</span>
            <span className="font-mono text-[var(--stone)]">.{rel.toColumn}</span>
          </div>
        ))}
      </div>

      {/* Compact visual: table nodes */}
      <div className="mt-4">
        <h4 className="text-xs font-medium text-[var(--ink)] mb-2">Table Graph</h4>
        <div className="flex flex-wrap gap-2">
          {tables.map(name => {
            const hasRelation = relationships.some(r => r.fromTable === name || r.toTable === name);
            return (
              <div
                key={name}
                className={`px-3 py-1.5 rounded-md text-xs font-mono border ${
                  hasRelation
                    ? "border-[var(--primary)]/30 bg-[var(--primary-soft)] text-[var(--primary-text)]"
                    : "border-[var(--hairline)] bg-[var(--canvas)] text-[var(--steel)]"
                }`}
              >
                {name}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add browse mode toggle and integrate into DictionaryPage**

In `DictionaryPage.tsx`, add imports at top:
```typescript
import BrowseTree from "./BrowseTree";
import RelationshipDiagram from "./RelationshipDiagram";
```

Add a mode state (after the `selectedEntry` state, around line 23):
```typescript
  const [mode, setMode] = useState<"search" | "browse">("search");
  // Track selected table/metric/dimension from browse
  const [browseSelection, setBrowseSelection] = useState<{
    type: "table" | "metric" | "dimension";
    name: string;
    item?: any;
  } | null>(null);
```

Add mode toggle at the top of the content (after the header, before the search bar, around line 142):
```tsx
        {/* Mode tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-[var(--hairline)]">
          <button
            onClick={() => setMode("search")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              mode === "search"
                ? "border-[var(--primary)] text-[var(--primary-text)]"
                : "border-transparent text-[var(--steel)] hover:text-[var(--ink)]"
            }`}
          >
            🔍 Search
          </button>
          <button
            onClick={() => setMode("browse")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              mode === "browse"
                ? "border-[var(--primary)] text-[var(--primary-text)]"
                : "border-transparent text-[var(--steel)] hover:text-[var(--ink)]"
            }`}
          >
            🌳 Browse
          </button>
        </div>
```

Conditionally render based on mode. Wrap the existing search UI in a conditional:
```tsx
        {mode === "search" && (
          <>
            {/* existing search bar and results JSX */}
          </>
        )}

        {mode === "browse" && (
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              <BrowseTree
                datasourceId={selectedDatasourceId}
                onSelectTable={(name) => {
                  setBrowseSelection({ type: "table", name });
                  handleNavigate("table", name);
                }}
                onSelectMetric={(m) => {
                  setBrowseSelection({ type: "metric", name: m.name, item: m });
                  handleNavigate("metric", m.name);
                }}
                onSelectDimension={(d) => {
                  setBrowseSelection({ type: "dimension", name: d.name, item: d });
                  handleNavigate("dimension", d.name);
                }}
              />
            </div>
            <div className="w-[360px] flex-shrink-0 space-y-4">
              <RelationshipDiagram datasourceId={selectedDatasourceId} />
              {selectedEntry ? (
                <EntryDetail
                  entry={selectedEntry.item}
                  entryType={selectedEntry.type}
                  onNavigate={handleNavigate}
                />
              ) : (
                <div className="card-base text-center py-16">
                  <p className="text-sm text-[var(--steel)]">Select an item to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
```

- [ ] **Step 4: Verify compilation and commit**

```bash
npx tsc --noEmit -p packages/web/tsconfig.json
```

```bash
git add packages/web/src/components/Dictionary/BrowseTree.tsx \
        packages/web/src/components/Dictionary/RelationshipDiagram.tsx \
        packages/web/src/components/Dictionary/DictionaryPage.tsx
git commit -m "feat: add browse mode and relationship diagram to data dictionary"
```

---

### Task 9: Create Onboarding Wizard

> Creates a step-by-step wizard guiding users: Datasource → Schema Discovery → Annotations → Metrics. Shown when a datasource is first selected with no annotations or metrics.

**Files:**
- Create: `packages/web/src/components/Onboarding/OnboardingWizard.tsx`
- Create: `packages/web/src/components/Onboarding/WizardStep.tsx`
- Modify: `packages/web/src/stores/app.ts:29-54`

- [ ] **Step 1: Create WizardStep component**

Create `packages/web/src/components/Onboarding/WizardStep.tsx`:

```tsx
import type { ReactNode } from "react";

interface WizardStepProps {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  isActive: boolean;
  isCompleted: boolean;
  children: ReactNode;
  onNext?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}

export default function WizardStep({
  step, totalSteps, title, description,
  isActive, isCompleted, children,
  onNext, onSkip, nextLabel = "Next →", nextDisabled = false,
}: WizardStepProps) {
  if (!isActive) return null;

  return (
    <div className="card-base max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-4">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full ${
              i + 1 < step
                ? "bg-[var(--success)]"
                : i + 1 === step
                ? "bg-[var(--primary)]"
                : "bg-[var(--hairline)]"
            }`}
          />
        ))}
        <span className="text-xs text-[var(--steel)] ml-2">{step}/{totalSteps}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        {isCompleted && <span className="text-[var(--success)] text-sm mr-2">✓</span>}
        <h3 className="font-display text-heading-4 text-[var(--ink)]">{title}</h3>
        <p className="text-body-sm text-[var(--slate)] mt-1">{description}</p>
      </div>

      {/* Content */}
      <div className="mb-6">{children}</div>

      {/* Actions */}
      {!isCompleted && (
        <div className="flex items-center justify-between pt-4 border-t border-[var(--hairline)]">
          {onSkip ? (
            <button onClick={onSkip} className="btn-ghost text-xs">Skip</button>
          ) : (
            <div />
          )}
          <button
            onClick={onNext}
            disabled={nextDisabled}
            className="btn-primary disabled:opacity-40"
          >
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create OnboardingWizard component**

Create `packages/web/src/components/Onboarding/OnboardingWizard.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useAppStore } from "../../stores/app";
import { datasourcesApi, schemasApi, semanticApi, type Datasource } from "../../api/client";
import WizardStep from "./WizardStep";
import type { BrowseTable } from "../../api/client";

const TOTAL_STEPS = 4;

type WizardStepKey = "connect" | "discover" | "annotate" | "metrics";

const STEP_CONFIG: Record<WizardStepKey, { title: string; description: string }> = {
  connect: {
    title: "Step 1: Connect Your Database",
    description: "First, add a MySQL datasource so DataNova can discover your data.",
  },
  discover: {
    title: "Step 2: Discover Schema",
    description: "DataNova will scan your database to find tables, columns, and relationships.",
  },
  annotate: {
    title: "Step 3: Add Business Context",
    description: "Add business-friendly descriptions to help AI understand your data better.",
  },
  metrics: {
    title: "Step 4: Define Business Metrics",
    description: "Create reusable metrics and dimensions to make querying more accurate.",
  },
};

export default function OnboardingWizard() {
  const { selectedDatasourceId, setView } = useAppStore();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [showWizard, setShowWizard] = useState(true);

  // Step 1 state
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [selectedDsId, setSelectedDsId] = useState(selectedDatasourceId ?? "");

  // Step 2 state
  const [tables, setTables] = useState<BrowseTable[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState(false);

  // Step 3 state
  const [annotationsCount, setAnnotationsCount] = useState(0);

  // Step 4 state
  const [metricsCount, setMetricsCount] = useState(0);

  useEffect(() => {
    datasourcesApi.list().then(setDatasources).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedDatasourceId) {
      setSelectedDsId(selectedDatasourceId);
      // Check if already past step 2
      schemasApi.get(selectedDatasourceId).then(res => {
        if (res.schema.tables.length > 0) {
          setDiscovered(true);
          setCompletedSteps(prev => new Set([...prev, 2]));
          setCurrentStep(3);
        }
      }).catch(() => {});
    }
  }, [selectedDatasourceId]);

  const handleConnect = async () => {
    if (!selectedDsId) return;
    const { setSelectedDatasource } = useAppStore.getState();
    const ds = datasources.find(d => d.id === selectedDsId);
    if (ds) setSelectedDatasource(ds.id, ds.name);
    setCompletedSteps(prev => new Set([...prev, 1]));
    setCurrentStep(2);
  };

  const handleDiscover = async () => {
    if (!selectedDatasourceId) return;
    setDiscovering(true);
    try {
      await schemasApi.get(selectedDatasourceId);
      setDiscovered(true);
      setCompletedSteps(prev => new Set([...prev, 2]));
      setCurrentStep(3);
    } catch (err) {
      console.error("Discovery failed:", err);
    } finally {
      setDiscovering(false);
    }
  };

  const handleGoToAnnotate = () => {
    setCompletedSteps(prev => new Set([...prev, 3]));
    setCurrentStep(4);
    setView("schemas");
  };

  const handleGoToMetrics = () => {
    setCompletedSteps(prev => new Set([...prev, 4]));
    setView("metrics");
  };

  if (!showWizard) return null;

  return (
    <div className="p-6 bg-gradient-to-b from-[var(--cream-soft)] to-[var(--canvas)] border-b border-[var(--hairline)]">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-heading-4 text-[var(--ink)]">🚀 Setup Wizard</h3>
          <button onClick={() => setShowWizard(false)} className="text-xs text-[var(--steel)] hover:text-[var(--ink)]">
            Close
          </button>
        </div>

        {/* Step 1: Connect */}
        <WizardStep
          step={1} totalSteps={TOTAL_STEPS}
          isActive={currentStep === 1}
          isCompleted={completedSteps.has(1)}
          nextLabel="Connect & Continue"
          nextDisabled={!selectedDsId && !selectedDatasourceId}
          onNext={handleConnect}
          {...STEP_CONFIG.connect}
        >
          <div>
            <p className="text-sm text-[var(--slate)] mb-3">
              Select an existing datasource or go to the Datasources page to add a new one.
            </p>
            {datasources.length > 0 ? (
              <div className="space-y-2">
                {datasources.filter(ds => ds.enabled).map(ds => (
                  <button
                    key={ds.id}
                    onClick={() => setSelectedDsId(ds.id)}
                    className={`w-full text-left px-4 py-3 rounded-md border transition-colors ${
                      selectedDsId === ds.id
                        ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                        : "border-[var(--hairline)] hover:border-[var(--steel)]"
                    }`}
                  >
                    <p className="text-sm font-medium text-[var(--ink)]">{ds.name}</p>
                    <p className="text-xs text-[var(--steel)] font-mono">{ds.host}:{ds.port}/{ds.database}</p>
                  </button>
                ))}
                <button
                  onClick={() => setView("datasources")}
                  className="w-full text-center py-2 text-xs text-[var(--primary-text)] hover:underline"
                >
                  + Add a new datasource
                </button>
              </div>
            ) : (
              <button
                onClick={() => setView("datasources")}
                className="btn-primary text-sm"
              >
                Go to Datasources → Add your first connection
              </button>
            )}
          </div>
        </WizardStep>

        {/* Step 2: Discover */}
        <WizardStep
          step={2} totalSteps={TOTAL_STEPS}
          isActive={currentStep === 2}
          isCompleted={completedSteps.has(2)}
          onNext={handleDiscover}
          onSkip={() => { setCurrentStep(3); setCompletedSteps(prev => new Set([...prev, 2])); }}
          nextLabel={discovering ? "Discovering..." : "Discover Schema"}
          nextDisabled={discovering}
          {...STEP_CONFIG.discover}
        >
          <div>
            <p className="text-sm text-[var(--slate)] mb-2">
              DataNova will scan your database <strong className="text-[var(--ink)]">{selectedDatasourceId}</strong> to:
            </p>
            <ul className="text-sm text-[var(--slate)] space-y-1 list-disc list-inside mb-3">
              <li>Find all tables and columns</li>
              <li>Map foreign key relationships</li>
              <li>Detect value domains (enum values, numeric ranges)</li>
            </ul>
            {discovered && (
              <div className="p-3 rounded bg-[var(--success-soft)] text-[var(--success)] text-sm">
                ✓ Schema discovered successfully
              </div>
            )}
          </div>
        </WizardStep>

        {/* Step 3: Annotate */}
        <WizardStep
          step={3} totalSteps={TOTAL_STEPS}
          isActive={currentStep === 3}
          isCompleted={completedSteps.has(3)}
          onNext={handleGoToAnnotate}
          onSkip={() => { setCurrentStep(4); setCompletedSteps(prev => new Set([...prev, 3])); }}
          nextLabel="Open Schema Annotations →"
          {...STEP_CONFIG.annotate}
        >
          <div>
            <p className="text-sm text-[var(--slate)] mb-3">
              Add business descriptions to tables and columns. This helps AI generate better SQL queries.
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <span className="text-[var(--primary-text)] mt-0.5">🤖</span>
                <div>
                  <p className="text-[var(--ink)] font-medium">AI Auto-Annotate</p>
                  <p className="text-xs text-[var(--steel)]">Let AI analyze your schema and generate annotations automatically</p>
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <span className="text-[var(--primary-text)] mt-0.5">✏️</span>
                <div>
                  <p className="text-[var(--ink)] font-medium">Manual Annotate</p>
                  <p className="text-xs text-[var(--steel)]">Add descriptions yourself in the Schema Annotations page</p>
                </div>
              </div>
            </div>
          </div>
        </WizardStep>

        {/* Step 4: Metrics */}
        <WizardStep
          step={4} totalSteps={TOTAL_STEPS}
          isActive={currentStep === 4}
          isCompleted={completedSteps.has(4)}
          onNext={handleGoToMetrics}
          onSkip={() => setShowWizard(false)}
          nextLabel="Open Metrics →"
          {...STEP_CONFIG.metrics}
        >
          <div>
            <p className="text-sm text-[var(--slate)] mb-3">
              Define reusable metrics (like "Revenue", "Order Count") with pre-built SQL expressions.
              The AI will use these for deterministic, accurate queries.
            </p>
            <div className="p-3 rounded bg-[var(--primary-soft)] text-sm text-[var(--primary-text)]">
              <strong>💡 Tip:</strong> Use the "AI Recommend Metrics" button on the Metrics page
              to let AI suggest metrics based on your schema.
            </div>
          </div>
        </WizardStep>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add onboarding state to Zustand store**

In `packages/web/src/stores/app.ts`, add onboarding tracking fields:

Add to the `AppState` interface (after `modelId`, line ~26):
```typescript
  // Onboarding state
  onboardingCompleted: boolean;
  setOnboardingCompleted: (completed: boolean) => void;
```

Add to `create<AppState>` (after `setModel`, line ~54):
```typescript
  // Onboarding state
  onboardingCompleted: false,
  setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
```

- [ ] **Step 4: Integrate wizard into App layout**

In `packages/web/src/App.tsx`, add import:
```typescript
import OnboardingWizard from "./components/Onboarding/OnboardingWizard";
import { useAppStore } from "./stores/app";
```

Then inside the App component, after `<Layout>`, add the wizard conditionally before the view content. Modify the return block:

```tsx
  const { view, selectedDatasourceId, onboardingCompleted } = useAppStore();

  return (
    <Layout>
      {selectedDatasourceId && !onboardingCompleted && (
        <OnboardingWizard />
      )}
      {view === "chat" && <ChatWindow />}
      {/* ... rest of views */}
    </Layout>
  );
```

- [ ] **Step 5: Verify compilation and commit**

```bash
npx tsc --noEmit -p packages/web/tsconfig.json
```

```bash
git add packages/web/src/components/Onboarding/ \
        packages/web/src/stores/app.ts \
        packages/web/src/App.tsx
git commit -m "feat: add onboarding wizard for new datasource setup"
```

---

### Task 10: End-to-End Testing and Final Verification

> Run full E2E test suite, build, and verify all features work together.

- [ ] **Step 1: Full TypeScript compilation check**

```bash
npx tsc --noEmit -p packages/server/tsconfig.json
npx tsc --noEmit -p packages/web/tsconfig.json
```

Expected: Both pass with no errors.

- [ ] **Step 2: Full build**

```bash
npm run build
```

Expected: Both server and web build without errors.

- [ ] **Step 3: Run API E2E tests**

```bash
DATANOVA_DIR="/tmp/e2e-final" node packages/server/dist/index.js &
sleep 3
npx playwright test --reporter=list
kill %1
```

Expected: All previously passing API tests still pass.

- [ ] **Step 4: Smoke test new endpoints**

```bash
DATANOVA_DIR="/tmp/e2e-final" node packages/server/dist/index.js &
sleep 3

# Test browse endpoint
curl -s http://localhost:3000/api/schemas/nonexistent/browse
# Expected: JSON error or empty tables

# Test AI gen validation
curl -s -X POST http://localhost:3000/api/datasources/ds1/scheduled-queries/generate-sql \
  -H 'Content-Type: application/json' -d '{"prompt":""}'
# Expected: 400 error

kill %1
rm -rf /tmp/e2e-final
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git status
git commit -m "chore: final verification — all features build and test clean"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: All 4 remaining tasks (#2 Onboarding, #3 AI Annotation UX, #4 Semantic Form Simplification, #6 Dictionary Browse) have dedicated tasks
- [x] **Placeholder scan**: No TBD, TODO, or unimplemented code — every step has exact code
- [x] **Type consistency**: `BrowseTable`, `SchemaBrowseResponse`, `FilterCondition`, `AIAnnotationProgressProps`, `WizardStepProps` are consistently named and used
- [x] **File paths exact**: All file paths are absolute within the monorepo structure
- [x] **Interface alignment**: `schemaBrowseApi.tables()` returns `{ tables, relationships, modelNames }` matching `SchemaBrowseResponse`; `BrowseTree` correctly uses this API
- [x] **Import correctness**: All imports reference existing files or files created in earlier tasks
