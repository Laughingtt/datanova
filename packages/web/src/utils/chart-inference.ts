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
  "#dc2626", // error - 赤红
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
  if (sample.every((r) => isDateLikeValue(r[col]))) return true;
  const lower = col.toLowerCase();
  if (DATE_NAME_PARTIALS.some((p) => lower.includes(p))) {
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

  if (rows.length === 0 || columns.length === 0) return null;

  const dateCols = columns.filter((c) => isDateColumn(rows, c));
  const numericCols = columns.filter(
    (c) => isNumericColumn(rows, c) && !dateCols.includes(c)
  );
  const categoryCols = columns.filter(
    (c) => !dateCols.includes(c) && !numericCols.includes(c)
  );

  // Treat a numeric column with few unique values as a category
  const categoryLikeNumerics = numericCols.filter((c) => {
    const unique = getUniqueValues(rows, c);
    return unique.length <= 20 && unique.length < rows.length * 0.5;
  });
  const effectiveCategories = [...categoryCols, ...categoryLikeNumerics];
  const effectiveNumeric = numericCols.filter(
    (c) => !categoryLikeNumerics.includes(c)
  );

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
