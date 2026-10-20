import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import { dictionaryApi, type RecentChanges } from "../../api/client";
import EntryDetail from "./EntryDetail";
import BrowseTree from "./BrowseTree";
import RelationshipDiagram from "./RelationshipDiagram";
import { toast } from "../../stores/toast";

interface SearchResult {
  metrics: Array<{ id: string; name: string; display_name: string; description?: string; type: string }>;
  dimensions: Array<{ id: string; name: string; display_name: string; type: string }>;
  tables: Array<{ table_name: string; annotation: string; type: string }>;
  columns: Array<{ table_name: string; field_name: string; annotation: string; type: string }>;
}

interface SelectedEntry {
  type: "metric" | "dimension" | "table" | "column";
  item: any;
}

export default function DictionaryPage() {
  const { selectedDatasourceId } = useAppStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<SelectedEntry | null>(null);
  const [recentChanges, setRecentChanges] = useState<RecentChanges | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [mode, setMode] = useState<"search" | "browse">("search");

  const loadRecentChanges = useCallback(async () => {
    if (!selectedDatasourceId) return;
    setLoadingRecent(true);
    try {
      const data = await dictionaryApi.recentChanges(selectedDatasourceId);
      setRecentChanges(data);
    } catch (err) {
      toast.error("加载最近变更失败", err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingRecent(false);
    }
  }, [selectedDatasourceId]);

  useEffect(() => { loadRecentChanges(); }, [loadRecentChanges]);

  const handleSearch = useCallback(async () => {
    if (!selectedDatasourceId || !query.trim()) return;
    setSearching(true);
    setSelectedEntry(null);
    try {
      const r = await dictionaryApi.search(selectedDatasourceId, query.trim());
      setResults(r as SearchResult);
    } catch (err) {
      toast.error("搜索失败", err instanceof Error ? err.message : undefined);
      setResults(null);
    } finally {
      setSearching(false);
    }
  }, [selectedDatasourceId, query]);

  useEffect(() => {
    if (!query || !selectedDatasourceId || query.length < 1) { setResults(null); return; }
    const timer = setTimeout(() => {
      setSearching(true);
      dictionaryApi.search(selectedDatasourceId, query)
        .then((r) => setResults(r as SearchResult))
        .catch(() => setResults(null))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, selectedDatasourceId]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleSearch(); };

  const handleNavigate = async (type: string, name: string) => {
    if (!selectedDatasourceId) return;
    if (type === "table") {
      try {
        const detail = await dictionaryApi.tableDetail(selectedDatasourceId, name);
        setSelectedEntry({ type: "table", item: { name, table_name: name, ...detail.table, annotations: detail.annotations, relatedMetrics: detail.relatedMetrics } });
        return;
      } catch {}
    }
    if (results) {
      const typeKey = type as keyof SearchResult;
      const list = results[typeKey];
      if (Array.isArray(list)) {
        const item = list.find((i: any) => i.name === name || i.table_name === name || i.field_name === name);
        if (item) setSelectedEntry({ type: type as SelectedEntry["type"], item });
      }
    }
  };

  if (!selectedDatasourceId) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto text-[var(--muted-foreground)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-sm text-[var(--muted-foreground)]">请先选择一个数据源</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">前往数据源页面选择一个数据源以浏览数据字典</p>
        </div>
      </div>
    );
  }

  const resultGroups: { key: keyof SearchResult; label: string; type: SelectedEntry["type"] }[] = [
    { key: "metrics", label: "指标", type: "metric" },
    { key: "dimensions", label: "维度", type: "dimension" },
    { key: "tables", label: "表", type: "table" },
    { key: "columns", label: "字段", type: "column" },
  ];

  const totalCount = results
    ? resultGroups.reduce((sum, g) => sum + (results[g.key]?.length ?? 0), 0)
    : 0;

  return (
    <div className="h-full overflow-auto bg-[var(--background)]">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-[var(--foreground)]">语义层目录</h2>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">浏览和搜索语义层中的指标、维度、表、字段</p>
        </div>

        <div className="tabs-track mb-6">
          <button onClick={() => setMode("search")} data-active={mode === "search"} className="tab-trigger">搜索</button>
          <button onClick={() => setMode("browse")} data-active={mode === "browse"} className="tab-trigger">浏览</button>
        </div>

        {mode === "browse" && (
          <div className="flex gap-6 mb-8">
            <div className="flex-1 min-w-0">
              <BrowseTree datasourceId={selectedDatasourceId}
                onSelectTable={(name) => handleNavigate("table", name)}
                onSelectMetric={(m) => handleNavigate("metric", m.name)}
                onSelectDimension={(d) => handleNavigate("dimension", d.name)}
              />
            </div>
            <div className="w-[360px] flex-shrink-0 space-y-4">
              <RelationshipDiagram datasourceId={selectedDatasourceId} />
              {selectedEntry ? (
                <EntryDetail entry={selectedEntry.item} entryType={selectedEntry.type} onNavigate={handleNavigate} />
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-8 py-16 text-center">
                  <p className="text-sm text-[var(--muted-foreground)]">选择条目查看详情</p>
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "search" && (
          <>
            <div className="flex items-center gap-3 mb-8">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="搜索指标、表、字段、业务术语…"
                  className="input-field pl-10"
                />
              </div>
              <button onClick={handleSearch} disabled={searching || !query.trim()} className="btn-primary">
                {searching ? "搜索中..." : "搜索"}
              </button>
            </div>

            <div className="flex gap-6">
              <div className="flex-1 min-w-0">
                {results ? (
                  totalCount === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] p-8 py-12 text-center">
                      <p className="text-sm text-[var(--muted-foreground)]">未找到结果："{query}"</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 space-y-6">
                      {resultGroups.map(({ key, label, type }) => {
                        const items = results[key];
                        if (!items || items.length === 0) return null;
                        return (
                          <div key={key}>
                            <h3 className="text-sm font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
                              {label}
                              <span className="text-[10px] text-[var(--muted-foreground)] bg-[var(--muted)] px-1.5 py-0.5 rounded-full">
                                {items.length}
                              </span>
                            </h3>
                            <div className="space-y-1.5">
                              {items.map((item: any, idx: number) => {
                                const itemKey = item.id ?? idx;
                                const itemName = item.name || item.table_name || item.field_name;
                                const isSelected = selectedEntry?.type === type && (
                                  selectedEntry?.item?.id === item.id ||
                                  selectedEntry?.item?.name === itemName ||
                                  selectedEntry?.item?.table_name === item.table_name
                                );
                                return (
                                  <button key={itemKey} onClick={() => setSelectedEntry({ type, item })}
                                    className={`w-full text-left px-2.5 py-2 rounded-md border border-transparent transition-colors ${
                                      isSelected
                                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                                        : "hover:bg-[var(--muted)]"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-[var(--foreground)]">
                                        {item.display_name || item.table_name || item.field_name}
                                      </span>
                                      {item.name !== item.display_name && item.display_name && (
                                        <span className="text-xs font-mono text-[var(--muted-foreground)]">({item.name})</span>
                                      )}
                                    </div>
                                    {item.description && <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">{item.description}</p>}
                                    {item.annotation && <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">{item.annotation}</p>}
                                    {item.type && <span className="text-xs font-mono text-[var(--muted-foreground)] mt-0.5 inline-block">{item.type}</span>}
                                    {item.table_name && type === "column" && <span className="text-xs font-mono text-[var(--muted-foreground)]">{item.table_name}.</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div>
                    <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">最近更新</h3>
                    {loadingRecent ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--primary)] rounded-full animate-spin" />
                      </div>
                    ) : recentChanges ? (
                      <div className="space-y-4">
                        {recentChanges.annotations && recentChanges.annotations.length > 0 && (
                          <div>
                            <h4 className="label-mono mb-2">标注</h4>
                            <div className="space-y-1.5">
                              {recentChanges.annotations.map((ann: any, idx: number) => (
                                <div key={ann.id ?? idx} className="card-base px-4 py-2.5">
                                  <p className="text-sm text-[var(--foreground)]">{ann.annotation}</p>
                                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{ann.table_name}{ann.field_name ? `.${ann.field_name}` : ""}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {recentChanges.metrics && recentChanges.metrics.length > 0 && (
                          <div>
                            <h4 className="label-mono mb-2">新增指标</h4>
                            <div className="space-y-1.5">
                              {recentChanges.metrics.map((m: any, idx: number) => (
                                <div key={m.id ?? idx} className="card-base px-4 py-2.5">
                                  <p className="text-sm font-medium text-[var(--foreground)]">{m.display_name || m.name}</p>
                                  {m.description && <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{m.description}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {recentChanges.dimensions && recentChanges.dimensions.length > 0 && (
                          <div>
                            <h4 className="label-mono mb-2">新增维度</h4>
                            <div className="space-y-1.5">
                              {recentChanges.dimensions.map((d: any, idx: number) => (
                                <div key={d.id ?? idx} className="card-base px-4 py-2.5">
                                  <p className="text-sm font-medium text-[var(--foreground)]">{d.display_name || d.name}</p>
                                  {d.data_type && <span className="text-xs font-mono text-[var(--muted-foreground)]">{d.data_type}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {!recentChanges.annotations?.length && !recentChanges.metrics?.length && !recentChanges.dimensions?.length && (
                          <p className="text-sm text-[var(--muted-foreground)]">暂无最近更新</p>
                        )}
                      </div>
                    ) : !query && (
                      <div className="text-center text-[var(--muted-foreground)] text-sm mt-10">
                        <p>输入关键词搜索数据字典</p>
                        <p className="text-xs mt-2 text-[var(--muted-foreground)]">可搜索指标、维度、表、字段的名称和业务描述</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="w-[360px] flex-shrink-0">
                {selectedEntry ? (
                  <EntryDetail entry={selectedEntry.item} entryType={selectedEntry.type} onNavigate={handleNavigate} />
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--border)] p-8 py-16 text-center">
                    <p className="text-sm text-[var(--muted-foreground)]">选择条目查看详情</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
