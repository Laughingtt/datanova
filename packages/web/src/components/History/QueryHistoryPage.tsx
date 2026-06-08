import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import { queryHistoryApi, type SqlQueryHistoryItem } from "../../api/client";

export default function QueryHistoryPage() {
  const { selectedDatasourceId } = useAppStore();
  const [history, setHistory] = useState<SqlQueryHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SqlQueryHistoryItem | null>(null);
  const [showAllDs, setShowAllDs] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      if (showAllDs || !selectedDatasourceId) {
        const data = await queryHistoryApi.listAll(200);
        setHistory(data);
      } else if (selectedDatasourceId) {
        const data = await queryHistoryApi.list(selectedDatasourceId, 100);
        setHistory(data);
      }
    } catch (err) {
      console.error("加载查询历史失败:", err);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDatasourceId, showAllDs]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const formatTime = (iso: string) => {
    const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null || ms === undefined) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="h-full flex flex-col bg-[var(--canvas)]">
      <div className="sunset-stripe" />

      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="font-display text-heading-2 text-[var(--ink)]">
                📋 SQL 查询历史
              </h2>
              <p className="text-body-sm text-[var(--slate)] mt-1">
                所有已执行的 SQL 查询记录，包括查询时间、问题、SQL 和执行结果
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[var(--steel)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllDs}
                  onChange={(e) => setShowAllDs(e.target.checked)}
                  className="rounded border-[var(--hairline-strong)]"
                />
                显示所有数据源
              </label>
              <button onClick={loadHistory} className="btn-ghost text-sm">
                🔄 刷新
              </button>
            </div>
          </div>
        </div>

        {/* Content: split layout */}
        <div className="flex-1 flex min-h-0 px-8 pb-8 gap-6">
          {/* Left: History list */}
          <div className="w-[480px] flex-shrink-0 flex flex-col min-h-0">
            {loading ? (
              <p className="text-sm text-[var(--steel)] py-4">加载中...</p>
            ) : history.length === 0 ? (
              <div className="card-base text-center py-16">
                <p className="text-sm text-[var(--steel)]">暂无查询历史</p>
                <p className="text-xs text-[var(--steel)] mt-2">
                  在对话中执行 SQL 查询后，记录将显示在这里
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5">
                {history.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  const isError = item.status === "error";
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`w-full text-left px-3 py-2.5 rounded-md transition-colors border ${
                        isSelected
                          ? "bg-[var(--primary-soft)] border-[var(--primary)]"
                          : "hover:bg-[var(--surface)] border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--ink)] truncate flex-1">
                          {item.question || "（无问题记录）"}
                        </span>
                        <span
                          className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded ${
                            isError
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {isError ? "失败" : "成功"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono text-[var(--steel)] truncate max-w-[280px]">
                          {item.sql}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[var(--steel)]">
                        <span>{formatTime(item.executed_at)}</span>
                        {item.datasource_name && (
                          <span className="text-[var(--primary-text)]">{item.datasource_name}</span>
                        )}
                        {item.row_count !== null && item.status === "success" && (
                          <span>{item.row_count} 行</span>
                        )}
                        {item.execution_time_ms !== null && (
                          <span>{formatDuration(item.execution_time_ms)}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Detail panel */}
          <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
            {selectedItem ? (
              <div className="card-base">
                <div className="space-y-5">
                  {/* Status */}
                  <div>
                    <h3 className="text-xs text-[var(--steel)] uppercase tracking-wider mb-1">状态</h3>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                        selectedItem.status === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {selectedItem.status === "error" ? "失败" : "成功"}
                    </span>
                  </div>

                  {/* Question */}
                  {selectedItem.question && (
                    <div>
                      <h3 className="text-xs text-[var(--steel)] uppercase tracking-wider mb-1">用户问题</h3>
                      <p className="text-sm text-[var(--ink)] bg-[var(--surface)] rounded p-3">
                        {selectedItem.question}
                      </p>
                    </div>
                  )}

                  {/* SQL */}
                  <div>
                    <h3 className="text-xs text-[var(--steel)] uppercase tracking-wider mb-1">SQL 查询</h3>
                    <pre className="text-sm font-mono text-[var(--ink)] bg-[var(--surface)] rounded p-3 overflow-x-auto whitespace-pre-wrap">
                      {selectedItem.sql}
                    </pre>
                  </div>

                  {/* Datasource info */}
                  <div>
                    <h3 className="text-xs text-[var(--steel)] uppercase tracking-wider mb-1">数据源</h3>
                    <p className="text-sm text-[var(--ink)]">
                      {selectedItem.datasource_name || selectedItem.datasource_id}
                    </p>
                  </div>

                  {/* Execution details */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <h3 className="text-xs text-[var(--steel)] uppercase tracking-wider mb-1">执行时间</h3>
                      <p className="text-sm text-[var(--ink)]">
                        {formatTime(selectedItem.executed_at)}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xs text-[var(--steel)] uppercase tracking-wider mb-1">耗时</h3>
                      <p className="text-sm text-[var(--ink)]">
                        {formatDuration(selectedItem.execution_time_ms)}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xs text-[var(--steel)] uppercase tracking-wider mb-1">返回行数</h3>
                      <p className="text-sm text-[var(--ink)]">
                        {selectedItem.row_count !== null ? selectedItem.row_count : "-"}
                      </p>
                    </div>
                  </div>

                  {/* Error message */}
                  {selectedItem.error_message && (
                    <div>
                      <h3 className="text-xs text-[var(--steel)] uppercase tracking-wider mb-1">错误信息</h3>
                      <pre className="text-sm text-red-700 bg-red-50 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                        {selectedItem.error_message}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card-base text-center py-16">
                <p className="text-sm text-[var(--steel)]">选择一条记录查看详情</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
