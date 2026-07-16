import { useState, useEffect } from "react";
import { datasourcesApi, queryHistoryApi, conversationsApi, type Datasource, type SqlQueryHistoryItem, type Conversation } from "../../api/client";
import { useAppStore } from "../../stores/app";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeUp?: boolean;
  icon: string;
  delay: string;
}

function StatCard({ label, value, change, changeUp, icon, delay }: StatCardProps) {
  return (
    <div className={`stat-card animate-in ${delay}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--primary-soft)] flex items-center justify-center">
          <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        {change && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            changeUp ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--error-soft)] text-[var(--error)]"
          }`}>
            {changeUp ? "+" : ""}{change}
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body">{value}</div>
      <div className="text-xs text-[var(--steel)] mt-1">{label}</div>
    </div>
  );
}

function MiniBarChart({ data, height = 40 }: { data: number[]; height?: number }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-[var(--accent-400)] transition-all duration-300 hover:bg-[var(--primary)]"
          style={{ height: `${(v / max) * 100}%`, minHeight: 2 }}
        />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { selectedDatasourceId, setView } = useAppStore();
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [recentQueries, setRecentQueries] = useState<SqlQueryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [ds, convs] = await Promise.all([
          datasourcesApi.list().catch(() => [] as Datasource[]),
          conversationsApi.list().catch(() => [] as Conversation[]),
        ]);
        setDatasources(ds);
        setConversations(convs);

        if (ds.length > 0) {
          const dsId = selectedDatasourceId || ds[0].id;
          try {
            const history = await queryHistoryApi.listAll(20);
            setRecentQueries(history);
          } catch {}
        }
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedDatasourceId]);

  const successQueries = recentQueries.filter(q => q.status === "success");
  const errorQueries = recentQueries.filter(q => q.status === "error");
  const avgExecTime = successQueries.length > 0
    ? Math.round(successQueries.reduce((sum, q) => sum + (q.execution_time_ms || 0), 0) / successQueries.length)
    : 0;

  const queriesByDay: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const count = recentQueries.filter(q => q.executed_at?.slice(0, 10) === dayStr).length;
    queriesByDay.push(count);
  }

  const dayLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--canvas)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--accent-300)] border-t-[var(--primary)] rounded-full animate-spin" />
          <span className="text-sm text-[var(--steel)]">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[var(--canvas)]">
      <div className="max-w-[1200px] mx-auto px-8 py-8">
        {/* Header */}
        <div className="mb-8 animate-in">
          <h2 className="font-display text-2xl text-[var(--ink)]">数据概览</h2>
          <p className="text-sm text-[var(--steel)] mt-1">实时监控数据查询状态与系统运行情况</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-5 mb-8">
          <StatCard
            label="数据源连接"
            value={datasources.length}
            icon="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
            delay="delay-1"
          />
          <StatCard
            label="对话总数"
            value={conversations.length}
            icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            delay="delay-2"
          />
          <StatCard
            label="查询成功率"
            value={recentQueries.length > 0 ? `${Math.round((successQueries.length / recentQueries.length) * 100)}%` : "—"}
            change={recentQueries.length > 0 ? `${errorQueries.length} 失败` : undefined}
            changeUp={errorQueries.length === 0}
            icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            delay="delay-3"
          />
          <StatCard
            label="平均执行时间"
            value={avgExecTime > 0 ? `${avgExecTime}ms` : "—"}
            icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            delay="delay-4"
          />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-5 gap-6 mb-8">
          {/* Query trend chart */}
          <div className="col-span-3 card-base animate-in delay-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)] font-body">近 7 日查询趋势</h3>
                <p className="text-xs text-[var(--steel)] mt-0.5">每日查询执行次数</p>
              </div>
              <div className="text-xs text-[var(--steel)]">
                共 {recentQueries.length} 次查询
              </div>
            </div>
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {queriesByDay.map((count, i) => {
                const max = Math.max(...queriesByDay, 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-[var(--stone)] font-mono">{count || ""}</span>
                    <div
                      className="w-full rounded-t-md transition-all duration-300 hover:opacity-80"
                      style={{
                        height: `${Math.max((count / max) * 100, count > 0 ? 8 : 0)}%`,
                        background: count > 0
                          ? "linear-gradient(to top, var(--accent-600), var(--accent-400))"
                          : "var(--hairline-soft)",
                        minHeight: count > 0 ? 4 : 0,
                      }}
                    />
                    <span className="text-[10px] text-[var(--stone)]">{dayLabels[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Datasource status */}
          <div className="col-span-2 card-base animate-in delay-3">
            <h3 className="text-sm font-semibold text-[var(--ink)] font-body mb-4">数据源状态</h3>
            {datasources.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-[var(--steel)]">暂无数据源</p>
                <button onClick={() => setView("datasources")} className="btn-primary mt-3 text-xs">
                  添加数据源
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {datasources.map((ds) => (
                  <div key={ds.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--canvas)] border border-[var(--hairline-soft)]">
                    <div className={`w-2 h-2 rounded-full ${ds.enabled ? "bg-[var(--success)]" : "bg-[var(--stone)]"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--ink)] truncate">{ds.name}</p>
                      <p className="text-xs text-[var(--steel)] font-mono">{ds.host}:{ds.port}/{ds.database}</p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      ds.enabled ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--canvas)] text-[var(--stone)]"
                    }`}>
                      {ds.enabled ? "已启用" : "未启用"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent queries table */}
        <div className="card-base animate-in delay-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)] font-body">最近查询</h3>
              <p className="text-xs text-[var(--steel)] mt-0.5">最近执行的 SQL 查询记录</p>
            </div>
            <button onClick={() => setView("queryHistory")} className="btn-ghost text-xs">
              查看全部 →
            </button>
          </div>
          {recentQueries.length === 0 ? (
            <div className="text-center py-10">
              <svg className="w-12 h-12 mx-auto text-[var(--stone)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <p className="text-sm text-[var(--steel)]">暂无查询记录</p>
              <p className="text-xs text-[var(--stone)] mt-1">开始对话后，查询记录将显示在此处</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--hairline)]">
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--steel)] font-body">时间</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--steel)] font-body">数据源</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--steel)] font-body">问题</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--steel)] font-body">耗时</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--steel)] font-body">行数</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--steel)] font-body">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {recentQueries.slice(0, 8).map((q) => (
                    <tr key={q.id} className="border-b border-[var(--hairline-soft)] hover:bg-[var(--canvas)] transition-colors">
                      <td className="px-3 py-2.5 text-xs text-[var(--steel)] font-mono whitespace-nowrap">
                        {new Date(q.executed_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[var(--charcoal)]">{q.datasource_name}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--ink)] max-w-[200px] truncate">{q.question || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--charcoal)] font-mono">{q.execution_time_ms ? `${q.execution_time_ms}ms` : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--charcoal)] font-mono">{q.row_count ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          q.status === "success"
                            ? "bg-[var(--success-soft)] text-[var(--success)]"
                            : "bg-[var(--error-soft)] text-[var(--error)]"
                        }`}>
                          {q.status === "success" ? "成功" : "失败"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
