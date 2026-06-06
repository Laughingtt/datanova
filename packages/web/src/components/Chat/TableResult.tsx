import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import type { TableData } from "../../hooks/useAgentStream";

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

export default function TableResult({ data }: TableResultProps) {
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
    <div className="my-3 overflow-x-auto border border-[var(--hairline)] rounded-lg">
      {data.executionTime !== undefined && (
        <div className="px-3 py-1.5 bg-[var(--surface)] text-xs text-[var(--steel)] border-b border-[var(--hairline)]">
          {data.rows.length} rows · {data.executionTime}ms
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-[var(--cream-soft)]">
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