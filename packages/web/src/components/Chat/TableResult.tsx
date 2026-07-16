import { useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import type { TableData } from "../../hooks/useAgentStream";
import * as XLSX from "xlsx";

interface TableResultProps {
  data: TableData;
}

// ==================== Helper Functions ====================

function isDateLike(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return (
    /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?(T|\s|$)/.test(value) ||
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i.test(value)
  );
}

function isNumeric(value: unknown): boolean {
  return (
    typeof value === "number" ||
    (typeof value === "string" && !isNaN(Number(value)) && value.trim() !== "")
  );
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return NaN;
}

function computeChange(
  current: number,
  previous: number
): { pct: number; direction: "up" | "down" } | null {
  if (previous === 0 || isNaN(previous) || isNaN(current)) return null;
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  return { pct: Math.abs(pct), direction: pct >= 0 ? "up" : "down" };
}

interface ColumnStats {
  mean: number;
  std: number;
}

function computeColumnStats(
  rows: Record<string, unknown>[],
  column: string
): ColumnStats | null {
  const values = rows
    .map((row) => toNumber(row[column]))
    .filter((v) => !isNaN(v));

  if (values.length < 5) return null;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);

  return { mean, std };
}

function isAnomaly(value: unknown, stats: ColumnStats | null): boolean {
  if (!stats || stats.std === 0) return false;
  const num = toNumber(value);
  if (isNaN(num)) return false;
  return Math.abs(num - stats.mean) > 2 * stats.std;
}

function isAnomalyHigh(value: unknown, stats: ColumnStats | null): boolean {
  if (!stats || stats.std === 0) return false;
  const num = toNumber(value);
  if (isNaN(num)) return false;
  return num > stats.mean + 2 * stats.std;
}

// ==================== Main Component ====================

function exportToExcel(data: TableData) {
  const ws = XLSX.utils.json_to_sheet(data.rows, { header: data.columns });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "查询结果");
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  XLSX.writeFile(wb, `查询结果_${ts}.xlsx`);
}

function downloadCSV(data: TableData) {
  const escapeField = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = data.columns.map(escapeField).join(",");
  const body = data.rows.map((row) => data.columns.map((col) => escapeField(row[col])).join(",")).join("\n");
  const csv = "﻿" + header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  a.href = url;
  a.download = `查询结果_${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TableResult({ data }: TableResultProps) {
  const handleExport = useCallback(() => {
    exportToExcel(data);
  }, [data]);

  // Detect date-like column and numeric columns
  const { dateColumn, numericColumns } = useMemo(() => {
    if (data.rows.length === 0) {
      return { dateColumn: null, numericColumns: [] };
    }

    // Find first column that looks like a date
    let dateCol: string | null = null;
    for (const col of data.columns) {
      const values = data.rows.slice(0, 5).map((row) => row[col]);
      if (values.every(isDateLike)) {
        dateCol = col;
        break;
      }
    }

    // Find numeric columns (excluding date column)
    const numericCols = data.columns.filter((col) => {
      if (col === dateCol) return false;
      const values = data.rows.map((row) => row[col]);
      return values.some(isNumeric);
    });

    return { dateColumn: dateCol, numericColumns: numericCols };
  }, [data.columns, data.rows]);

  // Compute column stats for anomaly detection
  const columnStats = useMemo(() => {
    const stats: Record<string, ColumnStats | null> = {};
    for (const col of numericColumns) {
      stats[col] = computeColumnStats(data.rows, col);
    }
    return stats;
  }, [data.rows, numericColumns]);

  // Check if we should show trend columns (need date column and 2+ rows)
  const showTrend = dateColumn !== null && data.rows.length >= 2;

  // Build enhanced columns with trend annotations
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    return data.columns.flatMap((col: string) => {
      const baseColumn: ColumnDef<Record<string, unknown>> = {
        id: col,
        accessorKey: col,
        header: col,
        cell: (info: { getValue: () => unknown; row: { index: number } }) => {
          const val = info.getValue();
          const stats = columnStats[col];
          const isNum = isNumeric(val);
          const anomaly = isAnomaly(val, stats);

          if (val === null || val === undefined) {
            return (
              <span className="text-[var(--stone)] italic">NULL</span>
            );
          }

          const displayValue = String(val);
          const numValue = isNum ? toNumber(val) : NaN;

          if (anomaly && isNum && !isNaN(numValue)) {
            const isHigh = isAnomalyHigh(val, stats);
            return (
              <div
                className="flex items-center gap-1 px-1 -mx-1 rounded bg-red-100 dark:bg-red-900/30"
                title={`此值相比该列其他值异常${isHigh ? "偏高" : "偏低"}`}
              >
                <span className="text-red-600 dark:text-red-400 shrink-0">⚠️</span>
                <span>{displayValue}</span>
              </div>
            );
          }

          return displayValue;
        },
      };

      // Add trend column after numeric columns if we have date column
      if (showTrend && numericColumns.includes(col)) {
        const trendColumn: ColumnDef<Record<string, unknown>> = {
          id: `${col}_trend`,
          header: `${col} 环比`,
          cell: (info: { row: { index: number; original: Record<string, unknown> } }) => {
            const rowIndex = info.row.index;
            if (rowIndex === 0) {
              return <span className="text-[var(--stone)]">—</span>;
            }

            const current = toNumber(info.row.original[col]);
            const previous = toNumber(data.rows[rowIndex - 1][col]);

            const change = computeChange(current, previous);
            if (!change) {
              return <span className="text-[var(--stone)]">—</span>;
            }

            const { pct, direction } = change;
            const isUp = direction === "up";
            const colorClass = isUp
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400";
            const arrow = isUp ? "↑" : "↓";

            return (
              <span className={`${colorClass} font-medium`}>
                {arrow} {pct}%
              </span>
            );
          },
        };

        return [baseColumn, trendColumn];
      }

      return [baseColumn];
    });
  }, [data.columns, data.rows, columnStats, showTrend, numericColumns]);

  const table = useReactTable({
    data: data.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="my-3 overflow-x-auto border border-[var(--hairline)] rounded-xl shadow-sm">
      <div className="px-3 py-1.5 bg-[var(--canvas)] text-xs text-[var(--steel)] border-b border-[var(--hairline)]">
        <div className="flex items-center justify-between">
          <span>{data.rows.length} 行{data.executionTime !== undefined ? ` · ${data.executionTime}ms` : ""}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => downloadCSV(data)}
              className="text-[var(--primary)] hover:underline font-medium flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              导出 CSV
            </button>
            <button
              onClick={handleExport}
              className="text-[var(--primary)] hover:underline font-medium flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              导出 Excel
            </button>
          </div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-[var(--canvas)]">
              {headerGroup.headers.map((header) => {
                const isTrendCol = header.id.endsWith("_trend");
                return (
                  <th
                    key={header.id}
                    className={`px-3 py-2 text-left font-mono text-xs uppercase tracking-wider border-b border-[var(--hairline)] ${
                      isTrendCol
                        ? "text-[var(--steel)] bg-[var(--surface)] italic font-normal"
                        : "text-[var(--steel)]"
                    }`}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr
              key={row.id}
              className={`border-b border-[var(--hairline-soft)] ${
                i % 2 === 0 ? "bg-[var(--canvas)]" : "bg-[var(--surface)]"
              } hover:bg-[var(--primary-soft)] transition-colors`}
            >
              {row.getVisibleCells().map((cell) => {
                const isTrendCol = cell.column.id.endsWith("_trend");
                return (
                  <td
                    key={cell.id}
                    className={`px-3 py-2 font-mono text-xs ${
                      isTrendCol
                        ? "text-[var(--steel)] bg-[var(--surface)]/50 w-24 min-w-[6rem]"
                        : "text-[var(--charcoal)]"
                    }`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
