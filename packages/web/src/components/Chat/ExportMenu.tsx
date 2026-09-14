/**
 * Result Export Menu — dropdown with CSV / TSV / JSON / XLSX options.
 *
 * All formats are produced server-side by /api/exports/:format so the output
 * is identical regardless of client (helpful when sharing files between
 * teammates on different OS / browser). The server stamps the filename with
 * a date+time suffix.
 */
import { useEffect, useRef, useState } from "react";
import { downloadExport, type ExportFormat } from "../../api/client";
import type { TableData } from "../../hooks/useAgentStream";

interface ExportMenuProps {
  data: TableData;
  /** Base filename without extension; default "查询结果". */
  filenameBase?: string;
}

const OPTIONS: Array<{ key: ExportFormat; label: string; hint: string }> = [
  { key: "csv", label: "CSV", hint: "逗号分隔，Excel/Numbers 可直接打开" },
  { key: "tsv", label: "TSV", hint: "Tab 分隔，含逗号的数据安全" },
  { key: "json", label: "JSON", hint: "行对象数组，程序消费" },
  { key: "xlsx", label: "Excel (.xlsx)", hint: "保留表头样式，冻结首行" },
];

export default function ExportMenu({ data, filenameBase = "查询结果" }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (data.rows.length === 0) return null;

  const handlePick = async (fmt: ExportFormat) => {
    setOpen(false);
    setBusy(fmt);
    setError(null);
    try {
      await downloadExport(fmt, data.columns, data.rows, filenameBase);
    } catch (e) {
      setError((e as Error).message);
      // Auto-dismiss error after 4s
      setTimeout(() => setError(null), 4000);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy !== null}
        className="text-[var(--primary)] hover:underline font-medium flex items-center gap-1 disabled:opacity-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {busy ? `导出 ${busy.toUpperCase()}…` : "导出"}
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-56 rounded-lg border border-[var(--hairline)] bg-[var(--surface)] shadow-lg z-20 overflow-hidden"
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="menuitem"
              onClick={() => handlePick(opt.key)}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--primary-soft)] focus:bg-[var(--primary-soft)] focus:outline-none"
            >
              <div className="font-medium text-[var(--ink)]">{opt.label}</div>
              <div className="text-[11px] text-[var(--steel)] mt-0.5">{opt.hint}</div>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="absolute right-0 mt-1 px-2 py-1 text-[11px] rounded bg-red-50 text-red-700 border border-red-200 whitespace-nowrap z-30">
          导出失败：{error}
        </div>
      )}
    </div>
  );
}