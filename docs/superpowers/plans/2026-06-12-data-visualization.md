# Data Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic chart visualization to SQL query results in the chat interface, so users can see data trends at a glance.

**Architecture:** The data pipeline (execute_sql → chat-handler → useAgentStream) already delivers structured `tableData` to the frontend. We install Recharts, create a chart inference utility, build a `ChartView` component with table/chart tab switching, and integrate it into `MessageItem`.

**Tech Stack:** Recharts 2.x, React 19, TypeScript, TailwindCSS (CSS variables)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/web/src/utils/chart-inference.ts` | Chart type inference from TableData |
| Create | `packages/web/src/components/Chat/ChartView.tsx` | Main chart rendering with type switcher |
| Create | `packages/web/src/components/ChartRenderers.tsx` | Individual Recharts chart components (Bar, Line, Pie, Area, Scatter, KPI) |
| Modify | `packages/web/package.json` | Add recharts dependency |
| Modify | `packages/web/src/components/Chat/MessageItem.tsx` | Replace standalone TableResult with table/chart tab switcher |
| Modify | `packages/web/src/components/Chat/TableResult.tsx` | Extract shared chart-data-limit helper |

No server-side changes needed — `execute-sql.ts` already returns `columns` + `rows` in `details`, `chat-handler.ts` already forwards them, and `useAgentStream.ts` already populates `message.tableData`.

---

### Task 1: Install Recharts

**Files:**
- Modify: `packages/web/package.json`

- [ ] **Step 1: Install recharts package**

Run:
```bash
cd packages/web && npm install recharts
```

Expected: `recharts` appears in `dependencies` of `packages/web/package.json`

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
npx tsc --noEmit --project packages/web/tsconfig.json
```

Expected: PASS (no new errors)

- [ ] **Step 3: Commit**

```bash
git add packages/web/package.json packages/web/package-lock.json
git commit -m "feat: add recharts dependency for data visualization"
```

---

### Task 2: Create Chart Inference Utility

**Files:**
- Create: `packages/web/src/utils/chart-inference.ts`

This utility analyzes `TableData` and returns a `ChartInference` result describing the recommended chart type, available alternatives, and which columns to use for each axis.

- [ ] **Step 1: Create the inference module**

Create `packages/web/src/utils/chart-inference.ts`:

```typescript
import type { TableData } from "../hooks/useAgentStream";

// ==================== Types ====================

export type ChartType = "line" | "area" | "bar" | "pie" | "scatter" | "kpi_card";

export interface ChartInference {
  recommended: ChartType;
  available: ChartType[];
  xColumn: string;
  yColumns: string[];
  categoryColumn?: string;
}

// ==================== Color Palette ====================

export const CHART_COLORS = [
  "#4f46e5", // primary - 靛蓝
  "#0ea5e9", // info - 天蓝
  "#f59e0b", // highlight - 琥珀
  "#059669", // success - 翠绿
  "#dc2626", // error - 玫红
  "#8b5cf6", // 紫罗兰
  "#ec4899", // 粉红
  "#14b8a6", // 青绿
];

// ==================== Column Detection ====================

const DATE_PATTERNS = [
  /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?(T|\s|$)/,
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i,
];

const DATE_NAME_PARTIALS = ["date", "time", "month", "year", "\u5e74", "\u6708", "\u65e5"];

function isDateLikeValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return DATE_PATTERNS.some((p) => p.test(value));
}

function isDateColumn(rows: Record<string, unknown>[], col: string): boolean {
  const sample = rows.slice(0, 5);
  if (sample.length === 0) return false;
  // Check values
  if (sample.every((r) => isDateLikeValue(r[col]))) return true;
  // Check column name
  const lower = col.toLowerCase();
  if (DATE_NAME_PARTIALS.some((p) => lower.includes(p))) {
    // Name hints date — verify at least some values look date-like
    if (sample.some((r) => isDateLikeValue(r[col]))) return true;
  }
  return false;
}

function isNumericValue(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value))) return true;
  return false;
}

function isNumericColumn(rows: Record<string, unknown>[], col: string): boolean {
  if (rows.length === 0) return false;
  const nonNull = rows.filter((r) => r[col] !== null && r[col] !== undefined);
  if (nonNull.length === 0) return false;
  // At least 80% of non-null values are numeric
  const numericCount = nonNull.filter((r) => isNumericValue(r[col])).length;
  return numericCount / nonNull.length >= 0.8;
}

function getUniqueValues(rows: Record<string, unknown>[], col: string): unknown[] {
  const seen = new Set<unknown>();
  for (const r of rows) {
    const v = r[col];
    if (v !== null && v !== undefined) seen.add(v);
  }
  return Array.from(seen);
}

// ==================== Main Inference ====================

export function inferChartType(data: TableData): ChartInference | null {
  const { columns, rows } = data;

  // No data → no chart
  if (rows.length === 0 || columns.length === 0) return null;

  // Identify column types
  const dateCols = columns.filter((c) => isDateColumn(rows, c));
  const numericCols = columns.filter(
    (c) => isNumericColumn(rows, c) && !dateCols.includes(c)
  );
  const categoryCols = columns.filter(
    (c) => !dateCols.includes(c) && !numericCols.includes(c)
  );

  // Also treat a numeric column with few unique values as a category
  const categoryLikeNumerics = numericCols.filter((c) => {
    const unique = getUniqueValues(rows, c);
    return unique.length <= 20 && unique.length < rows.length * 0.5;
  });
  const effectiveCategories = [...categoryCols, ...categoryLikeNumerics];
  const effectiveNumeric = numericCols.filter(
    (c) => !categoryLikeNumerics.includes(c)
  );

  // No numeric data at all → no chart
  if (effectiveNumeric.length === 0 && categoryLikeNumerics.length === 0) return null;

  // Single row → KPI card
  if (rows.length === 1) {
    const numCols = effectiveNumeric.length > 0 ? effectiveNumeric : categoryLikeNumerics;
    return {
      recommended: "kpi_card",
      available: ["kpi_card"],
      xColumn: "",
      yColumns: numCols,
    };
  }

  // Date + numeric → line chart
  if (dateCols.length > 0 && effectiveNumeric.length > 0) {
    return {
      recommended: "line",
      available: ["line", "area", "bar"],
      xColumn: dateCols[0],
      yColumns: effectiveNumeric,
      categoryColumn: dateCols[0],
    };
  }

  // Category + numeric
  if (effectiveCategories.length > 0 && effectiveNumeric.length > 0) {
    const uniqueValues = getUniqueValues(rows, effectiveCategories[0]);
    if (uniqueValues.length <= 8) {
      return {
        recommended: "pie",
        available: ["pie", "bar"],
        xColumn: effectiveCategories[0],
        yColumns: effectiveNumeric,
        categoryColumn: effectiveCategories[0],
      };
    }
    return {
      recommended: "bar",
      available: ["bar", "pie"],
      xColumn: effectiveCategories[0],
      yColumns: effectiveNumeric,
      categoryColumn: effectiveCategories[0],
    };
  }

  // Two numeric columns → scatter
  if (effectiveNumeric.length >= 2) {
    return {
      recommended: "scatter",
      available: ["scatter", "bar"],
      xColumn: effectiveNumeric[0],
      yColumns: [effectiveNumeric[1]],
    };
  }

  // Fallback → bar
  return {
    recommended: "bar",
    available: ["bar"],
    xColumn: columns[0],
    yColumns: effectiveNumeric.length > 0 ? effectiveNumeric : [columns[columns.length - 1]],
  };
}

/** Truncate data for chart rendering (max 100 rows). */
export function truncateForChart(data: TableData): TableData {
  if (data.rows.length <= 100) return data;
  return {
    ...data,
    rows: data.rows.slice(0, 100),
  };
}

/** Merge tail categories for pie chart (max 10 slices). */
export function mergePieData(
  rows: Record<string, unknown>[],
  categoryColumn: string,
  valueColumn: string
): { name: string; value: number }[] {
  const items = rows.map((r) => ({
    name: String(r[categoryColumn] ?? "unknown"),
    value: Number(r[valueColumn]) || 0,
  }));
  if (items.length <= 10) return items;
  const top = items.slice(0, 9);
  const otherValue = items.slice(9).reduce((sum, item) => sum + item.value, 0);
  top.push({ name: "\u5176\u4ed6", value: otherValue });
  return top;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
npx tsc --noEmit --project packages/web/tsconfig.json
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/utils/chart-inference.ts
git commit -m "feat: add chart type inference utility"
```

---

### Task 3: Create Individual Chart Renderer Components

**Files:**
- Create: `packages/web/src/components/ChartRenderers.tsx`

This file contains the individual Recharts chart components. Each receives pre-processed data and a `ChartInference` config.

- [ ] **Step 1: Create the chart renderers module**

Create `packages/web/src/components/ChartRenderers.tsx`:

```typescript
import {
  BarChart as RechartsBar,
  Bar,
  LineChart as RechartsLine,
  Line,
  PieChart as RechartsPie,
  Pie,
  Cell,
  AreaChart as RechartsArea,
  Area,
  ScatterChart as RechartsScatter,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ZAxis,
} from "recharts";
import type { TableData } from "../hooks/useAgentStream";
import {
  type ChartInference,
  CHART_COLORS,
  mergePieData,
} from "../utils/chart-inference";

// ==================== Shared Constants ====================

const GRID_COLOR = "#e2e8f0";
const AXIS_COLOR = "#64748b";
const TOOLTIP_BG = "#ffffff";
const TOOLTIP_BORDER = "#e2e8f0";
const MAX_BAR_LABEL_LEN = 6;

// ==================== Tooltip Style ====================

const tooltipStyle = {
  backgroundColor: TOOLTIP_BG,
  border: `1px solid ${TOOLTIP_BORDER}`,
  borderRadius: 6,
  fontSize: 12,
  padding: "6px 10px",
  boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
};

// ==================== Bar Chart ====================

export function BarChartRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  const isLongLabel = data.rows.some((r) => String(r[config.xColumn] ?? "").length > MAX_BAR_LABEL_LEN);
  const layout = isLongLabel ? "vertical" as const : "horizontal" as const;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsBar data={data.rows} layout={layout} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        {layout === "horizontal" ? (
          <>
            <XAxis dataKey={config.xColumn} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
            <YAxis tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
          </>
        ) : (
          <>
            <XAxis type="number" tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
            <YAxis dataKey={config.xColumn} type="category" tick={{ fill: AXIS_COLOR, fontSize: 11 }} width={80} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} />
        {config.yColumns.length > 1 && <Legend />}
        {config.yColumns.map((col, i) => (
          <Bar
            key={col}
            dataKey={col}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        ))}
      </RechartsBar>
    </ResponsiveContainer>
  );
}

// ==================== Line Chart ====================

export function LineChartRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsLine data={data.rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey={config.xColumn} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <YAxis tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        {config.yColumns.length > 1 && <Legend />}
        {config.yColumns.map((col, i) => (
          <Line
            key={col}
            type="monotone"
            dataKey={col}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }}
            activeDot={{ r: 5 }}
          />
        ))}
      </RechartsLine>
    </ResponsiveContainer>
  );
}

// ==================== Area Chart ====================

export function AreaChartRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsArea data={data.rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey={config.xColumn} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <YAxis tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        {config.yColumns.length > 1 && <Legend />}
        {config.yColumns.map((col, i) => (
          <Area
            key={col}
            type="monotone"
            dataKey={col}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            fillOpacity={0.2}
            strokeWidth={2}
          />
        ))}
      </RechartsArea>
    </ResponsiveContainer>
  );
}

// ==================== Pie Chart ====================

export function PieChartRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  const valueCol = config.yColumns[0];
  const catCol = config.categoryColumn ?? config.xColumn;
  const pieData = mergePieData(data.rows, catCol, valueCol);

  const renderLabel = ({ name, percent }: { name: string; percent: number }) =>
    `${name} ${(percent * 100).toFixed(0)}%`;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsPie margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
          label={renderLabel}
          labelLine={{ stroke: AXIS_COLOR, strokeWidth: 1 }}
        >
          {pieData.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="#fff" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
      </RechartsPie>
    </ResponsiveContainer>
  );
}

// ==================== Scatter Chart ====================

export function ScatterChartRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  const scatterData = data.rows.map((r) => ({
    x: Number(r[config.xColumn]) || 0,
    y: Number(r[config.yColumns[0]]) || 0,
    ...r,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsScatter margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey="x" name={config.xColumn} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <YAxis dataKey="y" name={config.yColumns[0]} tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
        <ZAxis range={[30, 30]} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => [value.toFixed(2), name]}
          labelFormatter={() => ""}
        />
        <Scatter data={scatterData} fill={CHART_COLORS[0]} />
      </RechartsScatter>
    </ResponsiveContainer>
  );
}

// ==================== KPI Card ====================

export function KpiCardRenderer({ data, config }: { data: TableData; config: ChartInference }) {
  const row = data.rows[0];
  return (
    <div className="flex flex-wrap gap-4 py-2">
      {config.yColumns.map((col, i) => {
        const val = row[col];
        const numVal = Number(val);
        const display = isNaN(numVal) ? String(val ?? "—") : numVal.toLocaleString();
        return (
          <div key={col} className="px-5 py-3 rounded-lg bg-[var(--surface)] border border-[var(--hairline)] min-w-[120px]">
            <div className="text-2xl font-mono font-semibold text-[var(--ink)]" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
              {display}
            </div>
            <div className="text-xs text-[var(--steel)] mt-1">{col}</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
npx tsc --noEmit --project packages/web/tsconfig.json
```

Expected: PASS (may have Recharts type warnings — acceptable)

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/ChartRenderers.tsx
git commit -m "feat: add individual chart renderer components"
```

---

### Task 4: Create ChartView Component

**Files:**
- Create: `packages/web/src/components/Chat/ChartView.tsx`

This is the main container component that infers chart type, renders the type switcher, and delegates to the appropriate renderer.

- [ ] **Step 1: Create ChartView**

Create `packages/web/src/components/Chat/ChartView.tsx`:

```typescript
import { useState, useEffect, useMemo } from "react";
import type { TableData } from "../../hooks/useAgentStream";
import {
  type ChartType,
  type ChartInference,
  inferChartType,
  truncateForChart,
} from "../../utils/chart-inference";
import {
  BarChartRenderer,
  LineChartRenderer,
  PieChartRenderer,
  AreaChartRenderer,
  ScatterChartRenderer,
  KpiCardRenderer,
} from "../ChartRenderers";

// ==================== Chart Type Labels ====================

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: "\u67f1\u5f62\u56fe",
  line: "\u6298\u7ebf\u56fe",
  area: "\u9762\u79ef\u56fe",
  pie: "\u997c\u56fe",
  scatter: "\u6563\u70b9\u56fe",
  kpi_card: "\u6570\u503c\u5361\u7247",
};

// ==================== Component ====================

interface ChartViewProps {
  data: TableData;
}

export default function ChartView({ data }: ChartViewProps) {
  const inference = useMemo(() => inferChartType(data), [data]);
  const [chartType, setChartType] = useState<ChartType | null>(null);
  const [truncated, setTruncated] = useState(false);

  const chartData = useMemo(() => {
    if (data.rows.length > 100) {
      setTruncated(true);
      return truncateForChart(data);
    }
    setTruncated(false);
    return data;
  }, [data]);

  useEffect(() => {
    if (inference) {
      setChartType(inference.recommended);
    }
  }, [inference]);

  if (!inference || !chartType) return null;

  const renderChart = () => {
    switch (chartType) {
      case "bar": return <BarChartRenderer data={chartData} config={inference} />;
      case "line": return <LineChartRenderer data={chartData} config={inference} />;
      case "area": return <AreaChartRenderer data={chartData} config={inference} />;
      case "pie": return <PieChartRenderer data={chartData} config={inference} />;
      case "scatter": return <ScatterChartRenderer data={chartData} config={inference} />;
      case "kpi_card": return <KpiCardRenderer data={chartData} config={inference} />;
    }
  };

  return (
    <div className="my-3 border border-[var(--hairline)] rounded-xl shadow-sm bg-[var(--surface)] overflow-hidden">
      {/* Type switcher bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--hairline)] bg-[var(--canvas)] overflow-x-auto">
        {inference.available.map((ct) => (
          <button
            key={ct}
            onClick={() => setChartType(ct)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              chartType === ct
                ? "bg-[var(--primary)] text-[var(--on-dark)]"
                : "text-[var(--steel)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            }`}
          >
            {CHART_TYPE_LABELS[ct]}
          </button>
        ))}
        {inference.recommended !== chartType && (
          <span className="ml-auto text-xs text-[var(--stone)]">
            \u63a8\u8350: {CHART_TYPE_LABELS[inference.recommended]}
          </span>
        )}
      </div>

      {/* Chart area */}
      <div className="px-2 py-3">
        {renderChart()}
        {truncated && (
          <p className="text-xs text-[var(--stone)] mt-2 text-center">
            \u4ec5\u5c55\u793a\u524d 100 \u6761\u6570\u636e
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
npx tsc --noEmit --project packages/web/tsconfig.json
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/Chat/ChartView.tsx
git commit -m "feat: add ChartView component with type switcher"
```

---

### Task 5: Integrate ChartView into MessageItem with Table/Chart Tab Switcher

**Files:**
- Modify: `packages/web/src/components/Chat/MessageItem.tsx`

Replace the standalone `TableResult` rendering with a tab switcher that toggles between table and chart views. When the inference result is meaningful, default to the chart tab.

- [ ] **Step 1: Add imports and state**

In `packages/web/src/components/Chat/MessageItem.tsx`, add `ChartView` import and a `DataViewToggle` inline component.

Add after the existing imports (line 10):
```typescript
import ChartView from "./ChartView";
import { inferChartType } from "../../utils/chart-inference";
```

Add a new inline component before the `MessageItem` function (around line 40):
```typescript
type DataViewTab = "table" | "chart";

function DataViewToggle({ tableData }: { tableData: TableData }) {
  const [tab, setTab] = useState<DataViewTab>(() => {
    const inference = inferChartType(tableData);
    return inference ? "chart" : "table";
  });

  return (
    <div className="my-3">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => setTab("table")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            tab === "table"
              ? "bg-[var(--primary-soft)] text-[var(--primary-text)] border border-[var(--primary)]"
              : "text-[var(--steel)] hover:text-[var(--ink)] border border-transparent"
          }`}
        >
          \ud83d\udccb \u8868\u683c
        </button>
        <button
          onClick={() => setTab("chart")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            tab === "chart"
              ? "bg-[var(--primary-soft)] text-[var(--primary-text)] border border-[var(--primary)]"
              : "text-[var(--steel)] hover:text-[var(--ink)] border border-transparent"
          }`}
        >
          \ud83d\udcca \u56fe\u8868
        </button>
      </div>

      {/* Content */}
      {tab === "table" ? (
        <TableResult data={tableData} />
      ) : (
        <ChartView data={tableData} />
      )}
    </div>
  );
}
```

Also add the missing `useState` import — it is not currently imported in `MessageItem.tsx`. Add it to the React import:
```typescript
import { useState } from "react";
```

And add the `TableData` type import:
```typescript
import type { TableData } from "../../hooks/useAgentStream";
```

- [ ] **Step 2: Replace the standalone TableResult with DataViewToggle**

In the assistant section of `MessageItem`, replace lines 121-122:
```typescript
            {/* 4. TableResult */}
            {message.tableData && <TableResult data={message.tableData} />}
```

with:
```typescript
            {/* 4. Table / Chart view */}
            {message.tableData && <DataViewToggle tableData={message.tableData} />}
```

The `TableResult` import can remain since it's still used inside `DataViewToggle`.

- [ ] **Step 3: Verify TypeScript compilation**

Run:
```bash
npx tsc --noEmit --project packages/web/tsconfig.json
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/Chat/MessageItem.tsx
git commit -m "feat: integrate ChartView with table/chart tab switcher in MessageItem"
```

---

### Task 6: Build, Smoke Test, and Verify End-to-End

**Files:**
- None (verification only)

- [ ] **Step 1: Full production build**

Run:
```bash
npm run build
```

Expected: Exit code 0, no TypeScript errors

- [ ] **Step 2: Start dev servers**

Run (in two separate terminals or background):
```bash
npm run dev:server
npm run dev:web
```

Verify:
- http://localhost:3000/api/health returns `{"status":"ok"}`
- http://localhost:5173 loads the app

- [ ] **Step 3: E2E smoke test — chat query produces chart**

Manual steps in browser:
1. Select a datasource
2. Open chat, type a query like "show me all data from [table]" or "\u67e5\u8be2\u6240\u6709\u8868\u7684\u6570\u636e"
3. Wait for SQL execution to complete
4. Verify: result area shows "表格 / 图表" tab switcher
5. Click "图表" tab — verify chart renders (bar/line/pie depending on data shape)
6. Click different chart types in the switcher bar — verify they switch
7. Click "表格" tab — verify table renders

- [ ] **Step 4: E2E edge cases**

Test the following scenarios:
- Query that returns 0 rows → no chart area shown
- Query that returns 1 row → KPI card shown
- Query with date column + numeric column → line chart recommended
- Query with many categories (>8) → bar chart recommended
- Query with few categories (<=8) → pie chart recommended

- [ ] **Step 5: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: address issues found during e2e testing"
```
```

---

## Self-Review

### Spec Coverage
- [x] P0: Chat query auto-chart → Task 4 + Task 5
- [x] Chart types: bar/line/pie/area/scatter/kpi_card → Task 3
- [x] Chart type inference → Task 2
- [x] Table/Chart tab switcher → Task 5
- [x] Chart colors match design system → Task 3 (CHART_COLORS)
- [x] Data limit (100 rows, 10 pie slices) → Task 2 + Task 4
- [x] No-chart for empty/pure-text results → Task 2 (returns null)
- [x] Hover Tooltip → Task 3 (all renderers include Tooltip)
- [x] Manual chart type switching → Task 4 (switcher bar)

### Placeholder Scan
- No TBD/TODO/fill-in-later patterns found
- All code blocks contain complete implementations
- All commands specify expected outcomes

### Type Consistency
- `ChartType` defined in `chart-inference.ts`, used consistently in `ChartRenderers.tsx` and `ChartView.tsx`
- `ChartInference` interface defined in `chart-inference.ts`, passed as `config` prop to all renderers
- `TableData` from `useAgentStream.ts` used consistently across all components
- `DataViewToggle` uses `TableData` type for its `tableData` prop

### Data Flow Gap
- Server-side data pipeline is already complete (execute-sql → chat-handler → useAgentStream all carry columns+rows)
- No server changes needed in this plan
