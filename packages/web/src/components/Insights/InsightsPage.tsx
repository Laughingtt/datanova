import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import {
  datasourcesApi,
  insightsApi,
  bookmarksApi,
  type Datasource,
  type InsightsStatsResponse,
  type TopQueryItem,
  type Bookmark,
} from "../../api/client";
import StatsBar from "./StatsBar";
import ChartCard from "./ChartCard";
import BookmarkDialog from "./BookmarkDialog";

export default function InsightsPage() {
  const { selectedDatasourceId, setSelectedDatasource } = useAppStore();
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [currentDsId, setCurrentDsId] = useState<string>(selectedDatasourceId ?? "");
  const [stats, setStats] = useState<InsightsStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [topQueries, setTopQueries] = useState<TopQueryItem[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);

  useEffect(() => {
    datasourcesApi.list().then(setDatasources).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedDatasourceId && selectedDatasourceId !== currentDsId) {
      setCurrentDsId(selectedDatasourceId);
    }
  }, [selectedDatasourceId]);

  const loadData = useCallback(async () => {
    if (!currentDsId) { setStatsLoading(false); return; }
    setStatsLoading(true);
    try {
      const [s, tq, bm] = await Promise.all([
        insightsApi.stats(currentDsId),
        insightsApi.topQueries(currentDsId, 10),
        bookmarksApi.list(currentDsId).catch(() => [] as Bookmark[]),
      ]);
      setStats(s);
      setTopQueries(tq);
      setBookmarks(bm);
    } catch {
      setStats(null);
      setTopQueries([]);
      setBookmarks([]);
    } finally {
      setStatsLoading(false);
    }
  }, [currentDsId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDatasourceChange = (id: string) => {
    setCurrentDsId(id);
    setSelectedDatasource(id, datasources.find((d) => d.id === id)?.name ?? null);
    setStats(null);
    setTopQueries([]);
    setBookmarks([]);
  };

  const currentDs = datasources.find((d) => d.id === currentDsId);

  return (
    <div className="h-full overflow-auto bg-[var(--canvas)]">
      <div className="max-w-[1400px] mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-in">
          <div>
            <h2 className="font-display text-2xl text-[var(--ink)]">数据洞察</h2>
            <p className="text-sm text-[var(--steel)] mt-1">热门查询报表与收藏图表一览</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Datasource selector */}
            <div className="relative">
              <select
                value={currentDsId}
                onChange={(e) => handleDatasourceChange(e.target.value)}
                className="input-field !py-1.5 !pr-8 !text-xs !font-medium min-w-[200px] appearance-none bg-[var(--surface)]"
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
          </div>
        </div>

        {!currentDsId ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--primary-soft)] flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h2 className="font-display text-xl text-[var(--ink)] mb-2">数据洞察</h2>
              <p className="text-sm text-[var(--steel)] mb-4">选择数据源查看查询统计与热门报表</p>
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
            {/* Stats bar */}
            <StatsBar stats={stats} loading={statsLoading} />

            {/* Daily trend chart */}
            {stats && stats.dailyTrend.length > 0 && (
              <div className="card-base mb-8 animate-in delay-2">
                <h3 className="text-sm font-semibold text-[var(--ink)] font-body mb-4">近 7 日查询趋势</h3>
                <div className="flex items-end gap-2" style={{ height: 100 }}>
                  {stats.dailyTrend.map((day, i) => {
                    const max = Math.max(...stats.dailyTrend.map(d => d.count), 1);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-[var(--stone)] font-mono">{day.count || ""}</span>
                        <div
                          className="w-full rounded-t-md transition-all duration-300 hover:opacity-80"
                          style={{
                            height: `${Math.max((day.count / max) * 100, day.count > 0 ? 8 : 0)}%`,
                            background: day.count > 0
                              ? "linear-gradient(to top, var(--accent-600), var(--accent-400))"
                              : "var(--hairline-soft)",
                            minHeight: day.count > 0 ? 4 : 0,
                          }}
                        />
                        <span className="text-[10px] text-[var(--stone)]">
                          {new Date(day.date).getMonth() + 1}/{new Date(day.date).getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bookmarked section */}
            <div className="mb-8 animate-in delay-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⭐</span>
                  <h3 className="text-sm font-semibold text-[var(--ink)] font-body">收藏报表</h3>
                  <span className="text-xs text-[var(--stone)]">({bookmarks.length})</span>
                </div>
                <button
                  onClick={() => setShowBookmarkDialog(true)}
                  className="btn-ghost text-xs"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  添加收藏
                </button>
              </div>
              {bookmarks.length === 0 ? (
                <div className="text-center py-10 card-base">
                  <svg className="w-10 h-10 mx-auto text-[var(--stone)] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  <p className="text-xs text-[var(--steel)]">暂无收藏报表</p>
                  <p className="text-[10px] text-[var(--stone)] mt-1">点击「添加收藏」或从热门查询中收藏</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5">
                  {bookmarks.map((bm) => (
                    <ChartCard
                      key={bm.id}
                      dsId={currentDsId}
                      sql={bm.sql}
                      title={bm.title}
                      subtitle={`收藏于 ${new Date(bm.created_at).toLocaleDateString("zh-CN")}`}
                      isBookmarked={true}
                      bookmarkId={bm.id}
                      onBookmarkToggle={loadData}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Top queries section */}
            <div className="animate-in delay-3">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🔥</span>
                <h3 className="text-sm font-semibold text-[var(--ink)] font-body">热门查询</h3>
                <span className="text-xs text-[var(--stone)]">({topQueries.length})</span>
              </div>
              {topQueries.length === 0 && !statsLoading ? (
                <div className="text-center py-10 card-base">
                  <svg className="w-10 h-10 mx-auto text-[var(--stone)] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <p className="text-xs text-[var(--steel)]">暂无热门查询</p>
                  <p className="text-[10px] text-[var(--stone)] mt-1">执行一些查询后，热门报表将在这里展示</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5">
                  {topQueries.map((tq, idx) => {
                    const bookmarkMatch = bookmarks.find(b => b.sql === tq.sql);
                    return (
                      <ChartCard
                        key={idx}
                        dsId={currentDsId}
                        sql={tq.sql}
                        title={tq.question || `热门查询 #${idx + 1}`}
                        subtitle={`${tq.execution_count} 次执行 · 最近 ${new Date(tq.last_executed_at).toLocaleDateString("zh-CN")}`}
                        isBookmarked={!!bookmarkMatch}
                        bookmarkId={bookmarkMatch?.id}
                        onBookmarkToggle={loadData}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bookmark dialog */}
      {showBookmarkDialog && (
        <BookmarkDialog
          dsId={currentDsId}
          onClose={() => setShowBookmarkDialog(false)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}
