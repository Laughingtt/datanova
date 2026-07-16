import type { InsightsStatsResponse } from "../../api/client";

interface StatsBarProps {
  stats: InsightsStatsResponse | null;
  loading: boolean;
}

export default function StatsBar({ stats, loading }: StatsBarProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-5 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="stat-card animate-pulse">
            <div className="h-4 bg-[var(--hairline)] rounded w-24 mb-3" />
            <div className="h-8 bg-[var(--hairline)] rounded w-16 mb-1" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-3 gap-5 mb-8">
      <div className="stat-card animate-in">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--primary-soft)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
        </div>
        <div className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body">
          {stats.totalQueries.toLocaleString()}
        </div>
        <div className="text-xs text-[var(--steel)] mt-1">总查询次数</div>
      </div>

      <div className="stat-card animate-in delay-1">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--success-soft)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--success-soft)] text-[var(--success)]">
            {stats.avgExecutionTimeMs}ms 平均
          </span>
        </div>
        <div className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body">
          {stats.successRate}%
        </div>
        <div className="text-xs text-[var(--steel)] mt-1">查询成功率</div>
      </div>

      <div className="stat-card animate-in delay-2">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--warning-soft)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--highlight)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
            </svg>
          </div>
        </div>
        <div className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body font-mono">
          {stats.topTable ? stats.topTable.name : "—"}
        </div>
        <div className="text-xs text-[var(--steel)] mt-1">
          最热表{stats.topTable ? ` · ${stats.topTable.count} 次查询` : ""}
        </div>
      </div>
    </div>
  );
}
