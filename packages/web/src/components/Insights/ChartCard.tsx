import { useEffect, useState } from "react";
import { insightsApi, bookmarksApi, type Bookmark, type AnalysisResult } from "../../api/client";
import { inferChartType } from "../../utils/chart-inference";
import ChartView from "../Chat/ChartView";
import TableResult from "../Chat/TableResult";

interface ChartCardProps {
  dsId: string;
  sql: string;
  title: string;
  subtitle?: string;
  isBookmarked?: boolean;
  bookmarkId?: string;
  onBookmarkToggle?: () => void;
}

export default function ChartCard({
  dsId,
  sql,
  title,
  subtitle,
  isBookmarked,
  bookmarkId,
  onBookmarkToggle,
}: ChartCardProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookmarking, setBookmarking] = useState(false);
  const [showSql, setShowSql] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    insightsApi.execute(dsId, sql).then((res) => {
      if (!cancelled) {
        setResult(res);
        setLoading(false);
      }
    }).catch((err: any) => {
      if (!cancelled) {
        setError(err.message || "查询执行失败");
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [dsId, sql]);

  const handleBookmark = async () => {
    if (bookmarking) return;

    if (isBookmarked && bookmarkId) {
      setBookmarking(true);
      try {
        await bookmarksApi.delete(dsId, bookmarkId);
        onBookmarkToggle?.();
      } catch {} finally {
        setBookmarking(false);
      }
    } else {
      setBookmarking(true);
      try {
        await bookmarksApi.create(dsId, { title: title || "未命名报表", sql });
        onBookmarkToggle?.();
      } catch {} finally {
        setBookmarking(false);
      }
    }
  };

  // Try to infer chart type from result
  const hasChart = result && inferChartType({ columns: result.columns, rows: result.rows });

  return (
    <div className="card-base !p-0 overflow-hidden animate-in">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hairline-soft)]">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--ink)] truncate">{title}</h3>
          {subtitle && <p className="text-[10px] text-[var(--stone)] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => setShowSql(!showSql)}
            title="查看 SQL"
            className={`p-1 rounded-md transition-colors ${
              showSql
                ? "text-[var(--primary)] bg-[var(--primary-soft)]"
                : "text-[var(--stone)] hover:text-[var(--ink)] hover:bg-[var(--canvas)]"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </button>
          <button
            onClick={handleBookmark}
            disabled={bookmarking}
            title={isBookmarked ? "取消收藏" : "收藏此查询"}
            className={`p-1 rounded-md transition-colors ${
              isBookmarked
                ? "text-[var(--highlight)] hover:bg-[var(--warning-soft)]"
                : "text-[var(--stone)] hover:text-[var(--highlight)] hover:bg-[var(--canvas)]"
            }`}
          >
            <svg className="w-4 h-4" fill={isBookmarked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expandable SQL block */}
      {showSql && (
        <div className="px-5 py-3 bg-[var(--canvas)] border-b border-[var(--hairline-soft)]">
          <pre className="text-xs font-mono text-[var(--charcoal)] whitespace-pre-wrap overflow-x-auto max-h-32">
            {sql}
          </pre>
        </div>
      )}

      {/* Card body */}
      <div className="p-5">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-6 h-6 border-2 border-[var(--accent-300)] border-t-[var(--primary)] rounded-full animate-spin" />
            <span className="text-xs text-[var(--steel)]">加载中...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <svg className="w-8 h-8 text-[var(--error)]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-xs text-[var(--error)]/80 text-center max-w-[300px]">{error}</p>
          </div>
        )}

        {result && hasChart && (
          <ChartView data={{ columns: result.columns, rows: result.rows }} />
        )}

        {result && !hasChart && (
          <div className="max-h-[300px] overflow-auto custom-scrollbar">
            <TableResult data={{ columns: result.columns, rows: result.rows }} />
          </div>
        )}
      </div>
    </div>
  );
}
