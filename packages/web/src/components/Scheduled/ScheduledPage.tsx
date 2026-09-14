import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import { scheduledApi, type ScheduledQuery, type QueryAlert } from "../../api/client";
import ScheduledForm from "./ScheduledForm";
import { toast } from "../../stores/toast";
import Dialog from "../common/Dialog";

export default function ScheduledPage() {
  const { selectedDatasourceId } = useAppStore();
  const [queries, setQueries] = useState<ScheduledQuery[]>([]);
  const [alerts, setAlerts] = useState<QueryAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingQuery, setEditingQuery] = useState<ScheduledQuery | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [histories, setHistories] = useState<Record<string, any[]>>({});
  const [historyLoading, setHistoryLoading] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ScheduledQuery | null>(null);

  const loadQueries = useCallback(async () => {
    if (!selectedDatasourceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await scheduledApi.list(selectedDatasourceId);
      setQueries(list);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "未知错误");
      setQueries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDatasourceId]);

  const loadAlerts = useCallback(async () => {
    if (!selectedDatasourceId) return;
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const alertList = await scheduledApi.listAlerts(selectedDatasourceId, since);
      setAlerts(alertList);
    } catch {
      // 告警加载失败不打扰用户
    }
  }, [selectedDatasourceId]);

  useEffect(() => {
    loadQueries();
    loadAlerts();
  }, [loadQueries, loadAlerts]);

  useEffect(() => {
    if (!selectedDatasourceId) return;
    const interval = setInterval(loadAlerts, 30_000);
    return () => clearInterval(interval);
  }, [selectedDatasourceId, loadAlerts]);

  const handleToggleEnabled = async (q: ScheduledQuery) => {
    if (!selectedDatasourceId) return;
    try {
      await scheduledApi.update(selectedDatasourceId, q.id, { enabled: q.enabled ? 0 : 1 });
      toast.success(q.enabled ? "已禁用" : "已启用", q.name);
      await loadQueries();
    } catch (err) {
      toast.error("操作失败", err instanceof Error ? err.message : undefined);
    }
  };

  const handleRunNow = async (q: ScheduledQuery) => {
    if (!selectedDatasourceId) return;
    setExecutingId(q.id);
    try {
      await scheduledApi.execute(selectedDatasourceId, q.id);
      toast.success("已触发执行", q.name);
      await loadQueries();
    } catch (err) {
      toast.error("执行失败", err instanceof Error ? err.message : undefined);
    } finally {
      setExecutingId(null);
    }
  };

  const handleDelete = (q: ScheduledQuery) => setDeleteTarget(q);

  const confirmDelete = async () => {
    if (!selectedDatasourceId || !deleteTarget) return;
    try {
      await scheduledApi.delete(selectedDatasourceId, deleteTarget.id);
      toast.success("已删除", deleteTarget.name);
      await loadQueries();
    } catch (err) {
      toast.error("删除失败", err instanceof Error ? err.message : undefined);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleToggleHistory = async (q: ScheduledQuery) => {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      if (next.has(q.id)) { next.delete(q.id); } else { next.add(q.id); }
      return next;
    });
    if (!histories[q.id] && selectedDatasourceId) {
      setHistoryLoading((prev) => new Set(prev).add(q.id));
      try {
        const h = await scheduledApi.history(selectedDatasourceId, q.id);
        setHistories((prev) => ({ ...prev, [q.id]: h }));
      } catch {
        toast.error("加载历史失败");
      } finally {
        setHistoryLoading((prev) => { const next = new Set(prev); next.delete(q.id); return next; });
      }
    }
  };

  const handleEdit = (q: ScheduledQuery) => { setEditingQuery(q); setShowForm(true); };
  const handleFormSave = async () => {
    setShowForm(false);
    setEditingQuery(null);
    toast.success(editingQuery ? "定时查询已更新" : "定时查询已创建");
    await loadQueries();
  };
  const handleFormCancel = () => { setShowForm(false); setEditingQuery(null); };

  if (!selectedDatasourceId) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--canvas)] px-8">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--primary-soft)] border border-[var(--hairline)] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--ink)]">请先选择一个数据源</p>
          <p className="text-xs text-[var(--steel)] mt-1">前往数据源页面选择一个数据源以管理定时查询</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[var(--canvas)]">
      <div className="sunset-stripe" />

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-display text-2xl text-[var(--ink)]">定时查询</h2>
            <p className="text-sm text-[var(--steel)] mt-1">
              配置定时执行的 SQL 查询，支持 Cron 表达式与告警条件
            </p>
          </div>
          <button onClick={() => { setEditingQuery(null); setShowForm(true); }} className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新建查询
          </button>
        </div>

        {alerts.length > 0 && (
          <div className="mb-6 p-4 rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-soft)]">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-[var(--warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-sm font-medium text-[var(--warning)]">
                活跃告警 ({alerts.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center gap-2 text-xs">
                  <span className={`inline-block w-2 h-2 rounded-full ${alert.severity === "critical" ? "bg-[var(--error)]" : "bg-[var(--warning)]"}`} />
                  <span className="text-[var(--ink)]">{alert.condition_triggered}</span>
                  <span className="text-[var(--steel)]">值: {alert.actual_value} (阈值: {alert.threshold})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showForm && (
          <div className="mb-8">
            <ScheduledForm datasourceId={selectedDatasourceId} query={editingQuery} onSave={handleFormSave} onCancel={handleFormCancel} />
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card-base p-4 space-y-2">
                <div className="h-4 w-40 rounded shimmer-bg" />
                <div className="h-3 w-64 rounded shimmer-bg" />
                <div className="h-3 w-48 rounded shimmer-bg" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="card-base flex flex-col items-center text-center py-16">
            <div className="w-12 h-12 rounded-xl bg-[var(--error-soft)] border border-[var(--hairline)] flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-[var(--error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-[var(--ink)] mb-1">加载失败</p>
            <p className="text-sm text-[var(--steel)] mb-4">{loadError}</p>
            <button onClick={loadQueries} className="btn-primary">重试</button>
          </div>
        ) : queries.length === 0 ? (
          <div className="card-base text-center py-16">
            <svg className="w-12 h-12 mx-auto text-[var(--stone)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[var(--steel)] text-sm">暂无定时查询</p>
            <p className="text-[var(--stone)] text-xs mt-1">点击"新建查询"创建一个定时查询</p>
          </div>
        ) : (
          <div className="space-y-4">
            {queries.map((q) => (
              <div key={q.id} className="card-base group hover:shadow-md transition-all duration-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-medium text-[var(--ink)] truncate">{q.name}</h3>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        q.enabled ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--canvas)] text-[var(--stone)] border border-[var(--hairline)]"
                      }`}>
                        {q.enabled ? "已启用" : "已禁用"}
                      </span>
                    </div>
                    {q.description && <p className="text-xs text-[var(--steel)] mt-1">{q.description}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--steel)]">
                      <span className="font-mono bg-[var(--canvas)] px-2 py-0.5 rounded border border-[var(--hairline-soft)]">{q.cron_expression}</span>
                      <span>{q.timezone}</span>
                      {q.last_run_at && (
                        <span>上次运行: {new Date(q.last_run_at).toLocaleString("zh-CN")}
                          {q.last_run_status && (
                            <span className={q.last_run_status === "success" ? "text-[var(--success)]" : "text-[var(--error)]"}> ({q.last_run_status === "success" ? "成功" : "失败"})</span>
                          )}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-[var(--stone)] mt-1.5 truncate">{q.sql}</p>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-4">
                    <button onClick={() => handleToggleHistory(q)} className="btn-ghost text-xs gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      历史
                    </button>
                    <button onClick={() => handleToggleEnabled(q)} className="btn-ghost text-xs" title={q.enabled ? "禁用" : "启用"}>
                      {q.enabled ? "禁用" : "启用"}
                    </button>
                    <button onClick={() => handleRunNow(q)} disabled={executingId === q.id} className="btn-ghost text-xs gap-1">
                      {executingId === q.id ? (
                        <><div className="w-3 h-3 border border-[var(--accent-300)] border-t-[var(--primary)] rounded-full animate-spin" />执行中</>
                      ) : (
                        <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>执行</>
                      )}
                    </button>
                    <button onClick={() => handleEdit(q)} className="btn-ghost text-xs gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      编辑
                    </button>
                    <button onClick={() => handleDelete(q)} className="btn-danger text-xs gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      删除
                    </button>
                  </div>
                </div>

                {expandedHistory.has(q.id) && (
                  <div className="mt-3 pt-3 border-t border-[var(--hairline)]">
                    {historyLoading.has(q.id) ? (
                      <div className="flex items-center gap-2 text-xs text-[var(--steel)]">
                        <div className="w-4 h-4 border border-[var(--accent-300)] border-t-[var(--primary)] rounded-full animate-spin" />
                        加载中...
                      </div>
                    ) : histories[q.id] && histories[q.id].length > 0 ? (
                      <div>
                        <h4 className="text-xs font-medium text-[var(--ink)] mb-2">执行历史 ({histories[q.id].length})</h4>
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar">
                          {histories[q.id].slice(0, 10).map((h: any, idx: number) => {
                            const isSuccess = h.status === "success";
                            return (
                              <div key={h.id ?? idx} className="flex items-center gap-3 text-xs">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSuccess ? "bg-[var(--success)]" : "bg-[var(--error)]"}`} />
                                <span className="text-[var(--steel)] font-mono w-[120px] flex-shrink-0">
                                  {new Date(h.executed_at).toLocaleString("zh-CN")}
                                </span>
                                <span className={`font-mono ${isSuccess ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                                  {isSuccess ? "成功" : "失败"}
                                </span>
                                {h.execution_time_ms && <span className="text-[var(--stone)]">{h.execution_time_ms}ms</span>}
                                {h.row_count != null && <span className="text-[var(--stone)]">{h.row_count} 行</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--steel)]">暂无执行历史</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 删除确认对话框 */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title="删除定时查询"
      >
        <p className="text-sm text-[var(--steel)]">
          确定要删除 <span className="font-medium text-[var(--ink)]">{deleteTarget?.name}</span> 吗？此操作不可撤销。
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setDeleteTarget(null)} className="btn-ghost text-sm">取消</button>
          <button onClick={confirmDelete} className="btn-danger text-sm">确认删除</button>
        </div>
      </Dialog>
    </div>
  );
}
