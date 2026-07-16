import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format } from "sql-formatter";
import { useAppStore } from "../../stores/app";
import {
  datasourcesApi,
  analysisApi,
  scheduledApi,
  queryHistoryApi,
  type Datasource,
  type AnalysisResult,
  type ScheduledQuery,
  type SqlQueryHistoryItem,
} from "../../api/client";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import ScheduledForm from "../Scheduled/ScheduledForm";

/* ==================== CSV Export ==================== */
function downloadCSV(result: AnalysisResult) {
  const escapeField = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = result.columns.map(escapeField).join(",");
  const body = result.rows.map((row) => result.columns.map((col) => escapeField(row[col])).join(",")).join("\n");
  const csv = "﻿" + header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  a.href = url;
  a.download = `分析结果_${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ==================== Recent Query Chip ==================== */
function RecentQueryChip({ item, onClick }: { item: SqlQueryHistoryItem; onClick: () => void }) {
  const preview = item.sql.length > 60 ? item.sql.slice(0, 60) + "..." : item.sql;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--canvas)] transition-colors group"
    >
      <span className="text-[10px] font-mono text-[var(--stone)] shrink-0">
        {new Date(item.executed_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="text-xs font-mono text-[var(--charcoal)] truncate group-hover:text-[var(--primary-text)]">
        {preview}
      </span>
      <span className={`ml-auto text-[10px] shrink-0 ${item.status === "success" ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
        {item.execution_time_ms != null ? `${item.execution_time_ms}ms` : "\u2014"}
      </span>
    </button>
  );
}

/* ==================== Results Table ==================== */
function ResultsTable({ result }: { result: AnalysisResult }) {
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    return result.columns.map((col) => ({
      id: col,
      accessorKey: col,
      header: col,
      cell: (info: { getValue: () => unknown }) => {
        const val = info.getValue();
        if (val === null || val === undefined) {
          return <span className="text-[var(--stone)] italic text-xs">NULL</span>;
        }
        const str = String(val);
        if (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?(T|\s|$)/.test(str)) {
          return <span className="text-[var(--slate)]">{str}</span>;
        }
        if (typeof val === "number" || (!isNaN(Number(str)) && str.trim() !== "")) {
          return <span className="font-mono tabular-nums text-[var(--ink)]">{str}</span>;
        }
        return <span>{str}</span>;
      },
    }));
  }, [result.columns]);

  const table = useReactTable({
    data: result.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex-1 min-h-0 overflow-auto border border-[var(--hairline)] rounded-xl">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="bg-[var(--canvas)]">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-[var(--steel)] border-b border-[var(--hairline)] whitespace-nowrap"
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
                i % 2 === 0 ? "bg-[var(--surface)]" : "bg-[var(--canvas)]"
              } hover:bg-[var(--primary-soft)] transition-colors`}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-4 py-2 text-[13px] text-[var(--charcoal)] max-w-[320px] truncate"
                  title={String(cell.getValue() ?? "")}
                >
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

/* ==================== Scheduled Queries Panel ==================== */
function ScheduledPanel({
  datasourceId,
  onClose,
  onSelectSql,
}: {
  datasourceId: string;
  onClose: () => void;
  onSelectSql: (sql: string) => void;
}) {
  const [queries, setQueries] = useState<ScheduledQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingQuery, setEditingQuery] = useState<ScheduledQuery | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const loadQueries = useCallback(async () => {
    setLoading(true);
    try {
      const list = await scheduledApi.list(datasourceId);
      setQueries(list);
    } catch { setQueries([]); }
    finally { setLoading(false); }
  }, [datasourceId]);

  useEffect(() => { loadQueries(); }, [loadQueries]);

  const handleToggle = async (q: ScheduledQuery) => {
    try { await scheduledApi.update(datasourceId, q.id, { enabled: q.enabled ? 0 : 1 }); await loadQueries(); } catch {}
  };

  const handleRunNow = async (q: ScheduledQuery) => {
    setExecutingId(q.id);
    try { await scheduledApi.execute(datasourceId, q.id); await loadQueries(); } catch {} finally { setExecutingId(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除此定时查询？")) return;
    try { await scheduledApi.delete(datasourceId, id); await loadQueries(); } catch {}
  };

  const handleFormSave = async () => { setShowForm(false); setEditingQuery(null); await loadQueries(); };
  const handleFormCancel = () => { setShowForm(false); setEditingQuery(null); };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-[560px] max-w-[90vw] h-full bg-[var(--surface)] shadow-2xl flex flex-col animate-in">
        <div className="sunset-stripe" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--hairline)]">
          <div>
            <h2 className="font-display text-lg text-[var(--ink)]">定时查询</h2>
            <p className="text-xs text-[var(--steel)] mt-0.5">管理定时执行的 SQL 查询任务</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditingQuery(null); setShowForm(true); }} className="btn-primary text-xs">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              新建定时查询
            </button>
            <button onClick={onClose} className="btn-ghost text-xs">关闭</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-6">
          {showForm ? (
            <ScheduledForm
              datasourceId={datasourceId}
              query={editingQuery}
              onSave={handleFormSave}
              onCancel={handleFormCancel}
            />
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : queries.length === 0 ? (
            <div className="text-center py-20">
              <svg className="w-12 h-12 mx-auto text-[var(--stone)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-sm text-[var(--steel)]">暂无定时查询</p>
              <p className="text-xs text-[var(--stone)] mt-1">点击上方按钮创建您的第一个定时查询</p>
            </div>
          ) : (
            <div className="space-y-3">
              {queries.map((q) => (
                <div key={q.id} className="card-base !p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-[var(--ink)] truncate">{q.name}</h4>
                        <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-medium ${q.enabled ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--canvas)] text-[var(--stone)]"}`}>
                          {q.enabled ? "已启用" : "已停用"}
                        </span>
                      </div>
                      {q.description && <p className="text-xs text-[var(--steel)] mt-0.5">{q.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => onSelectSql(q.sql)} className="btn-ghost text-[11px]" title="使用此 SQL">使用SQL</button>
                      <button onClick={() => handleToggle(q)} className="btn-ghost text-[11px]">{q.enabled ? "停用" : "启用"}</button>
                      <button onClick={() => handleRunNow(q)} disabled={executingId === q.id} className="btn-ghost text-[11px]">
                        {executingId === q.id ? "执行中..." : "立即执行"}
                      </button>
                      <button onClick={() => { setEditingQuery(q); setShowForm(true); }} className="btn-ghost text-[11px]">编辑</button>
                      <button onClick={() => handleDelete(q.id)} className="btn-danger text-[11px]">删除</button>
                    </div>
                  </div>
                  <pre className="text-xs font-mono text-[var(--charcoal)] bg-[var(--canvas)] rounded-lg p-3 overflow-x-auto max-h-24">{q.sql}</pre>
                  <div className="flex items-center gap-4 text-[10px] text-[var(--stone)]">
                    <span>Cron: <code className="text-[var(--slate)]">{q.cron_expression}</code></span>
                    <span>时区: {q.timezone}</span>
                    {q.last_run_at && (
                      <span>上次执行: {new Date(q.last_run_at).toLocaleString("zh-CN")} ({q.last_run_status === "success" ? "成功" : "失败"})</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================== Main Analysis Page ==================== */
export default function AnalysisPage() {
  const { selectedDatasourceId, setSelectedDatasource } = useAppStore();
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [currentDsId, setCurrentDsId] = useState<string>(selectedDatasourceId ?? "");
  const [sql, setSql] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentQueries, setRecentQueries] = useState<SqlQueryHistoryItem[]>([]);
  const [showScheduled, setShowScheduled] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    datasourcesApi.list().then(setDatasources).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedDatasourceId && selectedDatasourceId !== currentDsId) {
      setCurrentDsId(selectedDatasourceId);
    }
  }, [selectedDatasourceId]);

  useEffect(() => {
    if (!currentDsId) { setRecentQueries([]); return; }
    queryHistoryApi.list(currentDsId, 15).then(setRecentQueries).catch(() => setRecentQueries([]));
  }, [currentDsId]);

  const currentDs = useMemo(() => datasources.find((d) => d.id === currentDsId), [datasources, currentDsId]);

  const handleDatasourceChange = (id: string) => {
    setCurrentDsId(id);
    setSelectedDatasource(id, datasources.find((d) => d.id === id)?.name ?? null);
    setResult(null);
    setError(null);
  };

  const handleExecute = useCallback(async () => {
    if (!currentDsId || !sql.trim()) return;
    setExecuting(true);
    setError(null);
    setResult(null);
    try {
      const res = await analysisApi.executeSql(currentDsId, sql.trim());
      setResult(res);
    } catch (err: any) {
      setError(err.message ?? "查询执行失败");
    } finally {
      setExecuting(false);
      queryHistoryApi.list(currentDsId, 15).then(setRecentQueries).catch(() => {});
    }
  }, [currentDsId, sql]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleSelectRecent = (item: SqlQueryHistoryItem) => {
    setSql(item.sql);
    editorRef.current?.focus();
  };

  const handleSelectScheduledSql = (s: string) => {
    setSql(s);
    setShowScheduled(false);
    editorRef.current?.focus();
  };

  return (
    <div className="flex h-full bg-[var(--canvas)]">
      {/* Left sidebar - recent queries */}
      {showSidebar && (
        <div className="w-[260px] flex flex-col border-r border-[var(--hairline)] bg-[var(--surface)] shrink-0">
          <div className="px-4 py-3 border-b border-[var(--hairline)]">
            <h3 className="text-xs font-medium text-[var(--steel)] uppercase tracking-wider">最近查询</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar py-1">
            {recentQueries.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-[var(--stone)]">暂无查询记录</p>
              </div>
            ) : (
              recentQueries.map((item) => (
                <RecentQueryChip key={item.id} item={item} onClick={() => handleSelectRecent(item)} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="sunset-stripe" />

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--hairline)] bg-[var(--surface)]">
          <button onClick={() => setShowSidebar(!showSidebar)} className="btn-ghost text-xs p-1.5" title="切换侧栏">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Datasource selector */}
          <div className="relative">
            <select
              value={currentDsId}
              onChange={(e) => handleDatasourceChange(e.target.value)}
              className="input-field !py-1.5 !pr-8 !text-xs !font-medium min-w-[180px] appearance-none bg-[var(--surface)]"
            >
              <option value="">选择数据源</option>
              {datasources.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
            <svg className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--stone)] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {currentDs && (
            <span className="text-[10px] text-[var(--stone)] font-mono">
              {currentDs.host}:{currentDs.port}/{currentDs.database}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowScheduled(true)}
              disabled={!currentDsId}
              className="btn-secondary text-xs disabled:opacity-40"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              定时查询
            </button>
          </div>
        </div>

        {!currentDsId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--primary-soft)] flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h2 className="font-display text-xl text-[var(--ink)] mb-2">自助分析</h2>
              <p className="text-sm text-[var(--steel)] mb-4">选择数据源后即可编写和执行 SQL 查询</p>
              <select
                value={currentDsId}
                onChange={(e) => handleDatasourceChange(e.target.value)}
                className="input-field max-w-[240px] mx-auto"
              >
                <option value="">选择数据源开始</option>
                {datasources.map((ds) => (
                  <option key={ds.id} value={ds.id}>{ds.name}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <>
            {/* SQL Editor */}
            <div className="px-5 pt-4 pb-2">
              <div className="input-well">
                <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--hairline-soft)]">
                  <span className="label-mono !mb-0">SQL 查询</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--stone)]">Ctrl+Enter 执行</span>
                    <button
                      onClick={() => {
                        try {
                          setSql(format(sql, { language: "mysql" }));
                        } catch {
                          // If formatting fails, keep original SQL
                        }
                      }}
                      disabled={!sql.trim()}
                      title="格式化 SQL"
                      className="btn-ghost !text-[10px] !py-1 !px-2 disabled:opacity-30"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                      </svg>
                      格式化
                    </button>
                    <button
                      onClick={handleExecute}
                      disabled={executing || !sql.trim()}
                      className="btn-primary !py-1.5 !px-4 !text-xs disabled:opacity-40"
                    >
                      {executing ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          执行中...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          执行查询
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <textarea
                  ref={editorRef}
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={"SELECT ...\nFROM ...\nWHERE ...\nGROUP BY ...\nORDER BY ...\nLIMIT ..."}
                  rows={8}
                  className="w-full px-4 py-3 text-sm font-mono leading-relaxed bg-transparent text-[var(--ink)] placeholder-[var(--stone)] resize-y focus:outline-none"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Results area */}
            <div className="flex-1 min-h-0 flex flex-col px-5 pb-4">
              {error && (
                <div className="mb-3 p-4 rounded-xl bg-[var(--error-soft)] border border-[var(--error)]/20">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-[var(--error)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-[var(--error)]">查询执行失败</p>
                      <p className="text-xs text-[var(--error)]/80 mt-1 font-mono">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {result && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-[var(--ink)]">查询结果</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--success)] bg-[var(--success-soft)] px-2 py-0.5 rounded-full">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        成功
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[var(--steel)]">
                      <span>{result.rowCount} 行</span>
                      <span>{result.columns.length} 列</span>
                      <span>{result.executionTime}ms</span>
                      <button
                        onClick={() => downloadCSV(result)}
                        className="text-[var(--primary)] hover:underline font-medium flex items-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        导出 CSV
                      </button>
                    </div>
                  </div>
                  <ResultsTable result={result} />
                </div>
              )}

              {!result && !error && !executing && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto text-[var(--hairline-strong)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-[var(--stone)]">输入 SQL 并点击执行查看结果</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Scheduled Queries Slide-over Panel */}
      {showScheduled && currentDsId && (
        <ScheduledPanel
          datasourceId={currentDsId}
          onClose={() => setShowScheduled(false)}
          onSelectSql={handleSelectScheduledSql}
        />
      )}
    </div>
  );
}
