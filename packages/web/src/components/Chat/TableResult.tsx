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

export default function TableResult({ data }: TableResultProps) {
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      data.columns.map((col: string) => ({
        accessorKey: col,
        header: col,
        cell: (info: { getValue: () => unknown }) => {
          const val = info.getValue();
          return val === null || val === undefined ? (
            <span className="text-[var(--stone)] italic">NULL</span>
          ) : (
            String(val)
          );
        },
      })),
    [data.columns]
  );

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
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 py-2 text-left font-mono text-xs text-[var(--steel)] uppercase tracking-wider border-b border-[var(--hairline)]"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
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
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 font-mono text-xs text-[var(--charcoal)]">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}