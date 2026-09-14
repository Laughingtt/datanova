import { useState, useEffect, useRef } from "react";
import { datasourcesApi, queryHistoryApi, conversationsApi, type Datasource, type SqlQueryHistoryItem, type Conversation } from "../../api/client";
import { useAppStore } from "../../stores/app";
import { useStaggerEntrance, useBarGrow, useCountUp } from "../../hooks/useGsapAnimations";
import { toast } from "../../stores/toast";
import { formatDuration, formatDateTimeShort } from "../../utils/format";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeUp?: boolean;
  icon: string;
  valueRef?: React.RefObject<HTMLDivElement | null>;
}

function StatCard({ label, value, change, changeUp, icon, valueRef }: StatCardProps) {
  return (
    <div className="stat-card">
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
      <div ref={valueRef} className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body">{value}</div>
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
  const [loadError, setLoadError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const barChartRef = useRef<HTMLDivElement>(null);
  const dsCountRef = useRef<HTMLDivElement>(null);
  const convCountRef = useRef<HTMLDivElement>(null);

  useStaggerEntrance(containerRef, ".stat-card", [loading]);
  useBarGrow(barChartRef, ".trend-bar", [recentQueries.length]);
  useCountUp(dsCountRef, datasources.length);
  useCountUp(convCountRef, conversations.length);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [ds, convs] = await Promise.all([
          datasourcesApi.list().catch((e) => {
            toast.error("加载数据源失败", e instanceof Error ? e.message : undefined);
            return [] as Datasource[];
          }),
          conversationsApi.list().catch((e) => {
            toast.error("加载对话失败", e instanceof Error ? e.message : undefined);
            return [] as Conversation[];
          }),
        ]);
        if (cancelled) return;
        setDatasources(ds);
        setConversations(convs);

        if (ds.length > 0) {
          try {
            const history = await queryHistoryApi.listAll(20);
            if (cancelled) return;
            setRecentQueries(history);
          } catch (e) {
            if (cancelled) return;
            toast.error("加载查询历史失败", e instanceof Error ? e.message : undefined);
            setLoadError("查询历史加载失败");
          }
        }
      } catch {
        if (!cancelled) setLoadError("数据加载失败，请重试");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedDatasourceId]);

  const successQueries = recentQueries.filter(q => q.status === "success");
  const errorQueries = recentQueries.filter(q => q.status === "error");
  const avgExecTime = successQueries.length > 0
    ? Math.round(successQueries.reduce((sum, q) => sum + (q.execution_time_ms || 0), 0) / successQueries.length)
    : 0;
  const avgExecTimeDisplay = avgExecTime > 0 ? formatDuration(avgExecTime) : "—";

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
    // 骨架屏：与真实布局对应（Header / 4×StatCard / 5 列两栏）
    return (
      <div className="h-full overflow-auto bg-[var(--canvas)]">
        <div className="max-w-[1200px] mx-auto px-8 py-8">
          <div className="mb-8 space-y-2">
            <div className="h-7 w-40 rounded shimmer-bg" />
            <div className="h-4 w-72 rounded shimmer-bg" />
          </div>
          <div className="grid grid-cols-4 gap-5 mb-8">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card-base p-5 space-y-3">
                <div className="h-4 w-20 rounded shimmer-bg" />
                <div className="h-7 w-16 rounded shimmer-bg" />
                <div className="h-3 w-24 rounded shimmer-bg" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-6">
            <div className="col-span-3 card-base p-5 space-y-4">
              <div className="h-4 w-32 rounded shimmer-bg" />
              <div className="h-[120px] w-full rounded shimmer-bg" />
            </div>
            <div className="col-span-2 card-base p-5 space-y-4">
              <div className="h-4 w-28 rounded shimmer-bg" />
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 w-full rounded shimmer-bg" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loadError && datasources.length === 0) {
    return (
      <div className="h-full overflow-auto bg-[var(--canvas)]">
        <div className="max-w-[1200px] mx-auto px-8 py-8">
          <div className="card-base flex flex-col items-center text-center py-16">
            <div className="w-12 h-12 rounded-xl bg-[var(--error-soft)] border border-[var(--hairline)] flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-[var(--error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-[var(--ink)] mb-1">加载失败</h3>
            <p className="text-sm text-[var(--steel)] mb-4">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              重新加载
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-[var(--canvas)]">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-8">
        {/* Header */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-[var(--ink)]">数据概览</h2>
            <p className="text-sm text-[var(--steel)] mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                {datasources.filter((d) => d.enabled).length} 个数据源在线
              </span>
              <span className="text-[var(--stone)]">·</span>
              <span>实时监控数据查询状态</span>
            </p>
          </div>
          <button
            onClick={() => setView("chat")}
            className="btn-primary flex items-center gap-1.5 whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新建查询
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <StatCard
            label="数据源连接"
            value={datasources.length}
            icon="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
            valueRef={dsCountRef}
          />
          <StatCard
            label="对话总数"
            value={conversations.length}
            icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            valueRef={convCountRef}
          />
          <StatCard
            label="查询成功率"
            value={recentQueries.length > 0 ? `${Math.round((successQueries.length / recentQueries.length) * 100)}%` : "—"}
            change={recentQueries.length > 0 ? `${errorQueries.length} 失败` : undefined}
            changeUp={errorQueries.length === 0}
            icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
          <StatCard
            label="平均执行时间"
            value={avgExecTimeDisplay}
            icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
          {/* Query trend chart */}
          <div className="lg:col-span-3 card-base">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--ink)] font-body">近 7 日查询趋势</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--canvas)] text-[var(--steel)] border border-[var(--hairline)]">
                  7 days
                </span>
              </div>
              <div className="text-xs text-[var(--steel)]">
                共 {recentQueries.length} 次查询
              </div>
            </div>
            <div ref={barChartRef} className="flex items-end gap-1" style={{ height: 120 }}>
              {queriesByDay.map((count, i) => {
                const max = Math.max(...queriesByDay, 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-[var(--stone)] font-mono">{count || ""}</span>
                    <div
                      className="trend-bar w-full rounded-t-md transition-all duration-300 hover:opacity-80"
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
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--hairline-soft)]">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-sm bg-[var(--accent-400)]" />
                <span className="text-[var(--steel)]">成功</span>
                <span className="text-[var(--ink)] font-mono font-medium">{successQueries.length}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-sm bg-[var(--error)]" />
                <span className="text-[var(--steel)]">失败</span>
                <span className="text-[var(--ink)] font-mono font-medium">{errorQueries.length}</span>
              </div>
            </div>
          </div>

          {/* Datasource status */}
          <div className="lg:col-span-2 card-base">
            <h3 className="text-sm font-semibold text-[var(--ink)] font-body mb-4">数据源状态</h3>
            {datasources.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-3">
                <div className="w-12 h-12 rounded-xl bg-[var(--primary-soft)] border border-[var(--hairline)] flex items-center justify-center">
                  <svg className="w-6 h-6 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75" />
                  </svg>
                </div>
                <p className="text-sm text-[var(--slate)]">暂无数据源</p>
                <button onClick={() => setView("datasources")} className="btn-primary text-xs">
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
        <div className="card-base">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--ink)] font-body">最近查询</h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--success-soft)] text-[var(--success)] border border-[var(--hairline)]">
                <span className="w-1 h-1 rounded-full bg-[var(--success)]" />
                实时
              </span>
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
                        {formatDateTimeShort(q.executed_at)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[var(--charcoal)]">{q.datasource_name}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--ink)] max-w-[200px] truncate">{q.question || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--charcoal)] font-mono">{q.execution_time_ms ? formatDuration(q.execution_time_ms) : "—"}</td>
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
