import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import { scheduledApi, type ScheduledQuery, type QueryAlert } from "../../api/client";
import ScheduledForm from "./ScheduledForm";

export default function ScheduledPage() {
  const { selectedDatasourceId } = useAppStore();
  const [queries, setQueries] = useState<ScheduledQuery[]>([]);
  const [alerts, setAlerts] = useState<QueryAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingQuery, setEditingQuery] = useState<ScheduledQuery | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [histories, setHistories] = useState<Record<string, any[]>>({});
  const [historyLoading, setHistoryLoading] = useState<Set<string>>(new Set());

  const loadQueries = useCallback(async () => {
    if (!selectedDatasourceId) return;
    setLoading(true);
    try {
      const list = await scheduledApi.list(selectedDatasourceId);
      setQueries(list);
    } catch (err) {
      console.error("Failed to load scheduled queries:", err);
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
    } catch (err) {
      console.error("Failed to load alerts:", err);
    }
  }, [selectedDatasourceId]);

  useEffect(() => {
    loadQueries();
    loadAlerts();
  }, [loadQueries, loadAlerts]);

  // Poll alerts every 30s
  useEffect(() => {
    if (!selectedDatasourceId) return;
    const interval = setInterval(loadAlerts, 30_000);
    return () => clearInterval(interval);
  }, [selectedDatasourceId, loadAlerts]);

  const handleToggleEnabled = async (q: ScheduledQuery) => {
    if (!selectedDatasourceId) return;
    try {
      await scheduledApi.update(selectedDatasourceId, q.id, {
        enabled: q.enabled ? 0 : 1,
      });
      await loadQueries();
    } catch (err) {
      console.error("Failed to toggle query:", err);
    }
  };

  const handleRunNow = async (q: ScheduledQuery) => {
    if (!selectedDatasourceId) return;
    setExecutingId(q.id);
    try {
      await scheduledApi.execute(selectedDatasourceId, q.id);
      await loadQueries();
    } catch (err) {
      console.error("Failed to execute query:", err);
    } finally {
      setExecutingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!selectedDatasourceId) return;
    if (!confirm("Delete this scheduled query?")) return;
    try {
      await scheduledApi.delete(selectedDatasourceId, id);
      await loadQueries();
    } catch (err) {
      console.error("Failed to delete query:", err);
    }
  };

  const handleToggleHistory = async (q: ScheduledQuery) => {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      if (next.has(q.id)) {
        next.delete(q.id);
        return next;
      }
      next.add(q.id);
      return next;
    });

    // Load history if not already loaded
    if (!histories[q.id] && selectedDatasourceId) {
      setHistoryLoading((prev) => new Set(prev).add(q.id));
      try {
        const h = await scheduledApi.history(selectedDatasourceId, q.id);
        setHistories((prev) => ({ ...prev, [q.id]: h }));
      } catch (err) {
        console.error("Failed to load history:", err);
      } finally {
        setHistoryLoading((prev) => {
          const next = new Set(prev);
          next.delete(q.id);
          return next;
        });
      }
    }
  };

  const handleEdit = (q: ScheduledQuery) => {
    setEditingQuery(q);
    setShowForm(true);
  };

  const handleFormSave = async () => {
    setShowForm(false);
    setEditingQuery(null);
    await loadQueries();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingQuery(null);
  };

  if (!selectedDatasourceId) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--canvas)]">
        <div className="text-center">
          <p className="text-sm text-[var(--slate)]">请先选择一个数据源</p>
          <p className="text-xs text-[var(--steel)] mt-2">
            前往数据源页面选择一个数据源以管理定时查询
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[var(--canvas)]">
      <div className="sunset-stripe" />

      <div className="max-w-5xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-display text-heading-2 text-[var(--ink)]">Scheduled Queries</h2>
            <p className="text-body-sm text-[var(--slate)] mt-1">
              Automate recurring SQL queries with cron schedules and alert conditions
            </p>
          </div>
          <button
            onClick={() => { setEditingQuery(null); setShowForm(true); }}
            className="btn-primary"
          >
            + New Query
          </button>
        </div>

        {/* Alert Banner */}
        {alerts.length > 0 && (
          <div className="mb-6 p-4 rounded-lg border border-[var(--warning-soft,rgba(234,179,8,0.2))] bg-[var(--warning-soft,rgba(234,179,8,0.08))]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-[var(--warning,#ca8a04)]">
                Active Alerts ({alerts.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center gap-2 text-xs">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    alert.severity === "critical" ? "bg-[var(--error)]" : "bg-[var(--warning,#ca8a04)]"
                  }`} />
                  <span className="text-[var(--ink)]">{alert.condition_triggered}</span>
                  <span className="text-[var(--steel)]">
                    Value: {alert.actual_value} (threshold: {alert.threshold})
                  </span>
                </div>
              ))}
              {alerts.length > 5 && (
                <p className="text-xs text-[var(--steel)]">+{alerts.length - 5} more alerts</p>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="mb-8">
            <ScheduledForm
              datasourceId={selectedDatasourceId}
              query={editingQuery}
              onSave={handleFormSave}
              onCancel={handleFormCancel}
            />
          </div>
        )}

        {/* Query List */}
        {loading ? (
          <p className="text-sm text-[var(--steel)]">Loading scheduled queries...</p>
        ) : queries.length === 0 ? (
          <div className="card-base text-center py-16">
            <p className="text-[var(--steel)] text-sm">No scheduled queries yet</p>
            <p className="text-[var(--stone)] text-xs mt-1">Click "+ New Query" to create one</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queries.map((q) => (
              <div
                key={q.id}
                className="card-base group hover:shadow-2 transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-medium text-[var(--ink)] truncate">
                        {q.name}
                      </h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-md font-mono ${
                          q.enabled
                            ? "bg-green-100 text-green-700"
                            : "bg-[var(--surface)] text-[var(--steel)]"
                        }`}
                      >
                        {q.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    {q.description && (
                      <p className="text-xs text-[var(--slate)] mt-1">{q.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--steel)]">
                      <span className="font-mono">{q.cron_expression}</span>
                      <span>{q.timezone}</span>
                      {q.last_run_at && (
                        <span>
                          Last run: {new Date(q.last_run_at).toLocaleString()}
                          {q.last_run_status && (
                            <span className={q.last_run_status === "success" ? "text-green-600" : "text-[var(--error)]"}>
                              {" "}({q.last_run_status})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-[var(--steel)] mt-1.5 truncate opacity-60">
                      {q.sql}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4">
                    <button
                      onClick={() => handleToggleHistory(q)}
                      className="btn-ghost text-xs"
                    >
                      History
                    </button>
                    <button
                      onClick={() => handleToggleEnabled(q)}
                      className="btn-ghost text-xs"
                      title={q.enabled ? "Disable" : "Enable"}
                    >
                      {q.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleRunNow(q)}
                      disabled={executingId === q.id}
                      className="btn-ghost text-xs"
                    >
                      {executingId === q.id ? "Running..." : "Run Now"}
                    </button>
                    <button
                      onClick={() => handleEdit(q)}
                      className="btn-ghost text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(q.id)}
                      className="btn-danger text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Execution History (collapsible) */}
                {expandedHistory.has(q.id) && (
                  <div className="mt-3 pt-3 border-t border-[var(--hairline)]">
                    {historyLoading.has(q.id) ? (
                      <p className="text-xs text-[var(--steel)]">Loading history...</p>
                    ) : histories[q.id] && histories[q.id].length > 0 ? (
                      <div>
                        <h4 className="text-xs font-medium text-[var(--ink)] mb-2">
                          Execution History ({histories[q.id].length})
                        </h4>
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar">
                          {histories[q.id].slice(0, 10).map((h: any, idx: number) => {
                            const isSuccess = h.status === "success";
                            const executedAt = new Date(h.executed_at);
                            return (
                              <div key={h.id ?? idx} className="flex items-center gap-3 text-xs">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSuccess ? "bg-[var(--success)]" : "bg-[var(--error)]"}`} />
                                <span className="text-[var(--steel)] font-mono w-[120px] flex-shrink-0">
                                  {executedAt.toLocaleString()}
                                </span>
                                <span className={`font-mono ${isSuccess ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                                  {isSuccess ? "✓" : "✗"}
                                </span>
                                {h.execution_time_ms && (
                                  <span className="text-[var(--stone)]">{h.execution_time_ms}ms</span>
                                )}
                                {h.row_count != null && (
                                  <span className="text-[var(--stone)]">{h.row_count} rows</span>
                                )}
                                {!isSuccess && h.result_summary && (
                                  <span className="text-[var(--error)] truncate flex-1">
                                    {(() => { try { return JSON.parse(h.result_summary).error; } catch { return ""; } })()}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--steel)]">No execution history yet</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
