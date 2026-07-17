import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import { queryHistoryApi, bookmarksApi, type SqlQueryHistoryItem } from "../../api/client";

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
      console.error("Failed to load query history:", err);
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
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="font-display text-2xl text-[var(--ink)]">SQL 查询历史</h2>
              <p className="text-sm text-[var(--steel)] mt-1">
                所有已执行的 SQL 查询记录，包括查询时间、问题、SQL 和执行结果
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[var(--steel)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllDs}
                  onChange={(e) => setShowAllDs(e.target.checked)}
                  className="rounded border-[var(--hairline-strong)] text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                显示所有数据源
              </label>
              <button onClick={loadHistory} className="btn-ghost text-sm gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                刷新
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex min-h-0 px-8 pb-8 gap-6">
          <div className="w-[480px] flex-shrink-0 flex flex-col min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-[var(--accent-300)] border-t-[var(--primary)] rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="card-base text-center py-16">
                <div className="card-base-inner">
                  <svg className="w-10 h-10 mx-auto text-[var(--stone)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <p className="text-sm text-[var(--steel)]">暂无查询历史</p>
                  <p className="text-xs text-[var(--stone)] mt-1">在对话中执行 SQL 查询后，记录将显示在这里</p>
                </div>
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
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 border ${
                        isSelected
                          ? "bg-[var(--primary-soft)] border-[var(--primary)]"
                          : "hover:bg-[var(--surface)] border-transparent hover:border-[var(--hairline)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--ink)] truncate flex-1">
                          {item.question || "（无问题记录）"}
                        </span>
                        <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          isError
                            ? "bg-[var(--error-soft)] text-[var(--error)]"
                            : "bg-[var(--success-soft)] text-[var(--success)]"
                        }`}>
                          {isError ? "失败" : "成功"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono text-[var(--steel)] truncate max-w-[280px]">
                          {item.sql}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--steel)]">
                        <span>{formatTime(item.executed_at)}</span>
                        {item.datasource_name && (
                          <span className="text-[var(--primary-text)] font-medium">{item.datasource_name}</span>
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

          <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
            {selectedItem ? (
              <div className="card-base">
                <div className="card-base-inner">
                <div className="space-y-5">
                  <div>
                    <h3 className="label-mono">状态</h3>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                      selectedItem.status === "error"
                        ? "bg-[var(--error-soft)] text-[var(--error)]"
                        : "bg-[var(--success-soft)] text-[var(--success)]"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${selectedItem.status === "error" ? "bg-[var(--error)]" : "bg-[var(--success)]"}`} />
                      {selectedItem.status === "error" ? "失败" : "成功"}
                    </span>
                  </div>

                  {selectedItem.question && (
                    <div>
                      <h3 className="label-mono">用户问题</h3>
                      <p className="text-sm text-[var(--ink)] bg-[var(--canvas)] rounded-lg p-3">
                        {selectedItem.question}
                      </p>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="label-mono !mb-0">SQL 查询</h3>
                      <button
                        onClick={async () => {
                          if (!selectedItem.datasource_id) return;
                          try {
                            await bookmarksApi.create(selectedItem.datasource_id, {
                              title: selectedItem.question || "未命名报表",
                              sql: selectedItem.sql,
                            });
                            alert("已收藏");
                          } catch {
                            alert("收藏失败");
                          }
                        }}
                        className="btn-ghost !text-[10px] !py-0.5 !px-1.5"
                        title="收藏此查询"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                        收藏
                      </button>
                    </div>
                    <pre className="text-sm font-mono text-[var(--ink)] bg-[var(--canvas)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap border border-[var(--hairline-soft)]">
                      {selectedItem.sql}
                    </pre>
                  </div>

                  <div>
                    <h3 className="label-mono">数据源</h3>
                    <p className="text-sm text-[var(--ink)]">
                      {selectedItem.datasource_name || selectedItem.datasource_id}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <h3 className="label-mono">执行时间</h3>
                      <p className="text-sm text-[var(--ink)]">{formatTime(selectedItem.executed_at)}</p>
                    </div>
                    <div>
                      <h3 className="label-mono">耗时</h3>
                      <p className="text-sm text-[var(--ink)]">{formatDuration(selectedItem.execution_time_ms)}</p>
                    </div>
                    <div>
                      <h3 className="label-mono">返回行数</h3>
                      <p className="text-sm text-[var(--ink)]">
                        {selectedItem.row_count !== null ? selectedItem.row_count : "-"}
                      </p>
                    </div>
                  </div>

                  {selectedItem.error_message && (
                    <div>
                      <h3 className="label-mono">错误信息</h3>
                      <pre className="text-sm text-[var(--error)] bg-[var(--error-soft)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                        {selectedItem.error_message}
                      </pre>
                    </div>
                  )}
                </div>
                </div>
              </div>
            ) : (
              <div className="card-base text-center py-16">
                <svg className="w-10 h-10 mx-auto text-[var(--stone)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <p className="text-sm text-[var(--steel)]">选择一条记录查看详情</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
