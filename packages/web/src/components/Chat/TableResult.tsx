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
      data.columns.map((col) => ({
        accessorKey: col,
        header: col,
        cell: (info) => {
          const val = info.getValue();
          return val === null || val === undefined ? (
            <span className="text-muted-slate italic">NULL</span>
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
    <div className="my-3 overflow-x-auto border border-hairline rounded-xs">
      {data.executionTime !== undefined && (
        <div className="px-3 py-1 bg-soft-stone text-micro text-muted-slate border-b border-hairline">
          {data.rows.length} rows returned in {data.executionTime}ms
        </div>
      )}
      <table className="w-full text-caption">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-soft-stone">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 py-2 text-left font-mono text-mono-label text-muted-slate border-b border-hairline"
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
              className={`border-b border-card-border ${
                i % 2 === 0 ? "bg-canvas-white" : "bg-soft-stone/30"
              } hover:bg-soft-stone/50 transition-colors`}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 font-mono text-micro">
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
