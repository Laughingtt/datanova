import { useRef } from "react";
import { useCountUp, useStaggerEntrance } from "../../hooks/useGsapAnimations";
import type { AgentTraceStats } from "../../api/client";
import { formatDuration } from "../../utils/format";

interface TraceStatsBarProps {
  stats: AgentTraceStats | null;
  loading: boolean;
}

export default function TraceStatsBar({ stats, loading }: TraceStatsBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const totalRef = useRef<HTMLDivElement>(null);
  const hitRateRef = useRef<HTMLDivElement>(null);
  const toolCallsRef = useRef<HTMLDivElement>(null);
  const selfCorrectRef = useRef<HTMLDivElement>(null);

  useCountUp(totalRef, stats?.totalTraces ?? 0);
  useCountUp(hitRateRef, stats?.semanticLayerHitRate ?? 0, { suffix: "%" });
  useCountUp(toolCallsRef, stats?.avgToolCalls ?? 0, { decimals: 1 });
  useCountUp(selfCorrectRef, stats?.selfCorrectionRate ?? 0, { suffix: "%" });
  useStaggerEntrance(containerRef, ".stat-card", [stats]);

  if (loading) {
    return (
      <div ref={containerRef} className="grid grid-cols-4 gap-5 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="stat-card">
            <div className="h-4 bg-[var(--hairline)] rounded w-24 mb-3 shimmer-bg" />
            <div className="h-8 bg-[var(--hairline)] rounded w-16 mb-1 shimmer-bg" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div ref={containerRef} className="grid grid-cols-4 gap-5 mb-6">
      {/* Total traces */}
      <div className="stat-card">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--primary-soft)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
        </div>
        <div ref={totalRef} className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body">0</div>
        <div className="text-xs text-[var(--steel)] mt-1">Agent 追踪总数</div>
      </div>

      {/* Semantic layer hit rate */}
      <div className="stat-card">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--info-soft)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--info-soft)] text-[var(--info)]">
            语义层
          </span>
        </div>
        <div ref={hitRateRef} className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body">0%</div>
        <div className="text-xs text-[var(--steel)] mt-1">语义层命中率</div>
      </div>

      {/* Average tool calls */}
      <div className="stat-card">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--accent-100)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--accent-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </div>
        </div>
        <div ref={toolCallsRef} className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body">
          0
        </div>
        <div className="text-xs text-[var(--steel)] mt-1">平均工具调用</div>
      </div>

      {/* Self-correction rate */}
      <div className="stat-card">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--warning-soft)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--highlight)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--warning-soft)] text-[var(--highlight)]">
            {formatDuration(stats.avgDurationMs)}
          </span>
        </div>
        <div ref={selfCorrectRef} className="text-2xl font-semibold text-[var(--ink)] tracking-tight font-body">
          0%
        </div>
        <div className="text-xs text-[var(--steel)] mt-1">自修复率</div>
      </div>
    </div>
  );
}
