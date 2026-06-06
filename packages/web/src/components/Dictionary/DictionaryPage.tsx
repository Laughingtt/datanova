import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import { dictionaryApi, type RecentChanges } from "../../api/client";
import EntryDetail from "./EntryDetail";

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

  const loadRecentChanges = useCallback(async () => {
    if (!selectedDatasourceId) return;
    setLoadingRecent(true);
    try {
      const data = await dictionaryApi.recentChanges(selectedDatasourceId);
      setRecentChanges(data);
    } catch (err) {
      console.error("Failed to load recent changes:", err);
    } finally {
      setLoadingRecent(false);
    }
  }, [selectedDatasourceId]);

  useEffect(() => {
    loadRecentChanges();
  }, [loadRecentChanges]);

  const handleSearch = useCallback(async () => {
    if (!selectedDatasourceId || !query.trim()) return;
    setSearching(true);
    setSelectedEntry(null);
    try {
      const r = await dictionaryApi.search(selectedDatasourceId, query.trim());
      setResults(r as SearchResult);
    } catch (err) {
      console.error("Dictionary search failed:", err);
      setResults(null);
    } finally {
      setSearching(false);
    }
  }, [selectedDatasourceId, query]);

  // Debounced search on query change
  useEffect(() => {
    if (!query || !selectedDatasourceId || query.length < 1) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      dictionaryApi
        .search(selectedDatasourceId, query)
        .then((r) => setResults(r as SearchResult))
        .catch(() => setResults(null))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, selectedDatasourceId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleNavigate = async (type: string, name: string) => {
    if (!selectedDatasourceId) return;
    // For table type, try to load detail via tableDetail API
    if (type === "table") {
      try {
        const detail = await dictionaryApi.tableDetail(selectedDatasourceId, name);
        setSelectedEntry({ type: "table", item: { name, table_name: name, ...detail.table, annotations: detail.annotations, relatedMetrics: detail.relatedMetrics } });
        return;
      } catch {
        // Fallback: use data from search results
      }
    }
    if (results) {
      const typeKey = type as keyof SearchResult;
      const list = results[typeKey];
      if (Array.isArray(list)) {
        const item = list.find((i: any) => i.name === name || i.table_name === name || i.field_name === name);
        if (item) {
          setSelectedEntry({ type: type as SelectedEntry["type"], item });
        }
      }
    }
  };

  if (!selectedDatasourceId) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--canvas)]">
        <div className="text-center">
          <p className="text-sm text-[var(--slate)]">请先选择一个数据源</p>
          <p className="text-xs text-[var(--steel)] mt-2">
            前往数据源页面选择一个数据源以浏览数据字典
          </p>
        </div>
      </div>
    );
  }

  const resultGroups: { key: keyof SearchResult; label: string; icon: string; type: SelectedEntry["type"] }[] = [
    { key: "metrics", label: "指标", icon: "📊", type: "metric" },
    { key: "dimensions", label: "维度", icon: "📐", type: "dimension" },
    { key: "tables", label: "表", icon: "📄", type: "table" },
    { key: "columns", label: "字段", icon: "📝", type: "column" },
  ];

  const totalCount = results
    ? resultGroups.reduce((sum, g) => sum + (results[g.key]?.length ?? 0), 0)
    : 0;

  return (
    <div className="h-full overflow-auto bg-[var(--canvas)]">
      <div className="sunset-stripe" />

      <div className="max-w-5xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <h2 className="font-display text-heading-2 text-[var(--ink)]">Data Dictionary</h2>
          <p className="text-body-sm text-[var(--slate)] mt-1">
            Search metrics, tables, fields, and business terms across your data source
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索指标、表、字段、业务术语..."
            className="flex-1 px-4 py-2.5 text-sm bg-[var(--surface)] border border-[var(--hairline)] rounded-lg text-[var(--ink)] placeholder-[var(--steel)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="btn-primary"
          >
            {searching ? "搜索中..." : "Search"}
          </button>
        </div>

        {/* Main content: split layout */}
        <div className="flex gap-6">
          {/* Left: Results */}
          <div className="flex-1 min-w-0">
            {results ? (
              totalCount === 0 ? (
                <div className="card-base text-center py-12">
                  <p className="text-sm text-[var(--steel)]">No results found for "{query}"</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {resultGroups.map(({ key, label, icon, type }) => {
                    const items = results[key];
                    if (!items || items.length === 0) return null;
                    return (
                      <div key={key}>
                        <h3 className="text-sm font-medium text-[var(--ink)] mb-2 flex items-center gap-2">
                          <span>{icon}</span> {label}
                          <span className="text-xs text-[var(--steel)] bg-[var(--surface)] px-1.5 py-0.5 rounded">
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
                              <button
                                key={itemKey}
                                onClick={() => setSelectedEntry({ type, item })}
                                className={`w-full text-left px-4 py-2.5 rounded-md border transition-colors ${
                                  isSelected
                                    ? "border-[var(--primary)] bg-[var(--primary-soft,rgba(59,130,246,0.08))]"
                                    : "border-[var(--hairline)] hover:border-[var(--primary)] bg-[var(--surface)]"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-[var(--ink)]">
                                    {item.display_name || item.table_name || item.field_name}
                                  </span>
                                  {item.name !== item.display_name && item.display_name && (
                                    <span className="text-xs font-mono text-[var(--steel)]">
                                      ({item.name})
                                    </span>
                                  )}
                                </div>
                                {item.description && (
                                  <p className="text-xs text-[var(--slate)] mt-0.5 truncate">{item.description}</p>
                                )}
                                {item.annotation && (
                                  <p className="text-xs text-[var(--slate)] mt-0.5 truncate">{item.annotation}</p>
                                )}
                                {item.type && (
                                  <span className="text-xs font-mono text-[var(--steel)] mt-0.5 inline-block">
                                    {item.type}
                                  </span>
                                )}
                                {item.table_name && type === "column" && (
                                  <span className="text-xs font-mono text-[var(--steel)]">{item.table_name}.</span>
                                )}
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
              /* Recent Changes (shown when no search) */
              <div>
                <h3 className="text-sm font-medium text-[var(--ink)] mb-3">Recent Changes</h3>
                {loadingRecent ? (
                  <p className="text-sm text-[var(--steel)]">Loading recent changes...</p>
                ) : recentChanges ? (
                  <div className="space-y-4">
                    {recentChanges.annotations && recentChanges.annotations.length > 0 && (
                      <div>
                        <h4 className="text-xs text-[var(--steel)] uppercase tracking-wider mb-2">Annotations</h4>
                        <div className="space-y-1.5">
                          {recentChanges.annotations.map((ann: any, idx: number) => (
                            <div key={ann.id ?? idx} className="card-base px-4 py-2.5">
                              <p className="text-sm text-[var(--ink)]">{ann.annotation}</p>
                              <p className="text-xs text-[var(--steel)] mt-0.5">
                                {ann.table_name}{ann.field_name ? `.${ann.field_name}` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {recentChanges.metrics && recentChanges.metrics.length > 0 && (
                      <div>
                        <h4 className="text-xs text-[var(--steel)] uppercase tracking-wider mb-2">New Metrics</h4>
                        <div className="space-y-1.5">
                          {recentChanges.metrics.map((m: any, idx: number) => (
                            <div key={m.id ?? idx} className="card-base px-4 py-2.5">
                              <p className="text-sm font-medium text-[var(--ink)]">{m.display_name || m.name}</p>
                              {m.description && (
                                <p className="text-xs text-[var(--slate)] mt-0.5">{m.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {recentChanges.dimensions && recentChanges.dimensions.length > 0 && (
                      <div>
                        <h4 className="text-xs text-[var(--steel)] uppercase tracking-wider mb-2">New Dimensions</h4>
                        <div className="space-y-1.5">
                          {recentChanges.dimensions.map((d: any, idx: number) => (
                            <div key={d.id ?? idx} className="card-base px-4 py-2.5">
                              <p className="text-sm font-medium text-[var(--ink)]">{d.display_name || d.name}</p>
                              {d.data_type && (
                                <span className="text-xs font-mono text-[var(--steel)]">{d.data_type}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!recentChanges.annotations?.length && !recentChanges.metrics?.length && !recentChanges.dimensions?.length && (
                      <p className="text-sm text-[var(--steel)]">No recent changes</p>
                    )}
                  </div>
                ) : (
                  !query && (
                    <div className="text-center text-[var(--steel)] text-sm mt-10">
                      <p>输入关键词搜索数据字典</p>
                      <p className="text-xs mt-2">可搜索指标、维度、表、字段的名称和业务描述</p>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Right: Detail panel */}
          <div className="w-[360px] flex-shrink-0">
            {selectedEntry ? (
              <EntryDetail
                entry={selectedEntry.item}
                entryType={selectedEntry.type}
                onNavigate={handleNavigate}
              />
            ) : (
              <div className="card-base text-center py-16">
                <p className="text-sm text-[var(--steel)]">Select an entry to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
