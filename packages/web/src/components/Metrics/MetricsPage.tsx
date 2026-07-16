import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import { getAgentEntryPoint } from "../../agents/registry";
import {
  semanticApi,
  type SemanticMetric,
  type SemanticDimension,
  type SemanticModel,
} from "../../api/client";
import { schemasApi } from "../../api/client";
import MetricForm from "./MetricForm";
import DimensionForm from "./DimensionForm";
import ModelForm from "./ModelForm";
import EnumDictList from "./EnumDictList";

type TabKey = "metrics" | "dimensions" | "models" | "dictionary";

const STATUS_BADGE: Record<string, { dot: string; label: string; cls: string }> = {
  published:  { dot: "bg-[var(--success)]",  label: "已发布",  cls: "text-[var(--success)]" },
  draft:      { dot: "bg-[var(--warning)]",   label: "草稿",      cls: "text-[var(--warning)]" },
  deprecated: { dot: "bg-[var(--error)]",     label: "已弃用", cls: "text-[var(--error)]" },
};

export default function MetricsPage() {
  const { selectedDatasourceId } = useAppStore();
  const { setView, setActiveChannel } = useAppStore();
  const metricDevEntry = getAgentEntryPoint("metrics");
  const [tab, setTab] = useState<TabKey>("metrics");
  const [showDeprecated, setShowDeprecated] = useState(false);

  // Metrics state
  const [metrics, setMetrics] = useState<SemanticMetric[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<SemanticMetric | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Dimensions state
  const [dimensions, setDimensions] = useState<SemanticDimension[]>([]);
  const [selectedDimension, setSelectedDimension] = useState<SemanticDimension | null>(null);
  const [dimensionsLoading, setDimensionsLoading] = useState(false);

  // Models state
  const [models, setModels] = useState<SemanticModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<SemanticModel | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  // AI suggest loading
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestError, setAiSuggestError] = useState<string | null>(null);
  const [aiSuggestSuccess, setAiSuggestSuccess] = useState(false);

  // Table selector for AI suggest
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [showTableSelector, setShowTableSelector] = useState(false);

  // AI suggest dimensions
  const [aiSuggestingDimensions, setAiSuggestingDimensions] = useState(false);

  // Bulk import
  // AI preview state
  const [aiPreview, setAiPreview] = useState<{ metrics?: any[]; dimensions?: any[]; models?: any[] } | null>(null);
  const [aiPreviewType, setAiPreviewType] = useState<"semantic" | "dimensions">("semantic");
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [creatingFromPreview, setCreatingFromPreview] = useState(false);

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkContent, setBulkContent] = useState("");
  const [bulkContentType, setBulkContentType] = useState<"sql" | "description" | "document">("description");
  const [bulkImporting, setBulkImporting] = useState(false);

  const dsId = selectedDatasourceId!;

  // Load metrics
  const loadMetrics = useCallback(async () => {
    if (!dsId) return;
    setMetricsLoading(true);
    try {
      const list = await semanticApi.listMetrics(dsId);
      setMetrics(list);
    } catch (err) {
      console.error("Failed to load metrics:", err);
      setMetrics([]);
    } finally {
      setMetricsLoading(false);
    }
  }, [dsId]);

  // Load dimensions
  const loadDimensions = useCallback(async () => {
    if (!dsId) return;
    setDimensionsLoading(true);
    try {
      const list = await semanticApi.listDimensions(dsId);
      setDimensions(list);
    } catch (err) {
      console.error("Failed to load dimensions:", err);
      setDimensions([]);
    } finally {
      setDimensionsLoading(false);
    }
  }, [dsId]);

  // Load models
  const loadModels = useCallback(async () => {
    if (!dsId) return;
    setModelsLoading(true);
    try {
      const list = await semanticApi.listModels(dsId);
      setModels(list);
    } catch (err) {
      console.error("Failed to load models:", err);
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [dsId]);

  useEffect(() => {
    if (tab === "metrics") loadMetrics();
  }, [tab, loadMetrics]);

  useEffect(() => {
    if (tab === "dimensions") loadDimensions();
  }, [tab, loadDimensions]);

  useEffect(() => {
    if (tab === "models") loadModels();
  }, [tab, loadModels]);

  // Reset selection when tab changes
  useEffect(() => {
    setSelectedMetric(null);
    setSelectedDimension(null);
    setSelectedModel(null);
  }, [tab]);

  // Load table names for table selector
  useEffect(() => {
    if (!dsId) return;
    schemasApi.get(dsId).then((res) => {
      setTableNames(res.schema.tables.map(t => t.table.name));
    }).catch(() => setTableNames([]));
  }, [dsId]);

  // AI suggest handler
  const handleAiSuggest = async () => {
    if (!dsId) return;
    setAiSuggesting(true);
    setAiSuggestError(null);
    setAiSuggestSuccess(false);
    try {
      const result = await semanticApi.aiPreviewSemantic(dsId, selectedTables.length > 0 ? selectedTables : undefined);
      setAiPreview(result.suggestions);
      setAiPreviewType("semantic");
      const all = [...(result.suggestions.metrics || []), ...(result.suggestions.dimensions || []), ...(result.suggestions.models || [])];
      setSelectedSuggestions(new Set(all.map((_: any, i: number) => i)));
    } catch (err) {
      setAiSuggestError((err as Error).message || "AI 推荐失败");
    } finally {
      setAiSuggesting(false);
    }
  };

  // AI suggest dimensions handler
  const handleAiSuggestDimensions = async () => {
    if (!dsId) return;
    setAiSuggestingDimensions(true);
    setAiSuggestError(null);
    try {
      const result = await semanticApi.aiPreviewDimensions(dsId, selectedTables.length > 0 ? selectedTables : undefined);
      setAiPreview(result.suggestions);
      setAiPreviewType("dimensions");
      const all = result.suggestions.dimensions || [];
      setSelectedSuggestions(new Set(all.map((_: any, i: number) => i)));
    } catch (err) {
      setAiSuggestError((err as Error).message || "AI 推荐维度失败");
    } finally {
      setAiSuggestingDimensions(false);
    }
  };

  // Batch create from AI preview
  const handleCreateFromPreview = async () => {
    if (!dsId || !aiPreview) return;
    setCreatingFromPreview(true);
    setAiSuggestError(null);
    try {
      const toCreate: { metrics?: any[]; dimensions?: any[]; models?: any[] } = {};
      if (aiPreviewType === "semantic") {
        const mLen = aiPreview.metrics?.length || 0;
        const dLen = aiPreview.dimensions?.length || 0;
        toCreate.metrics = (aiPreview.metrics || []).filter((_: any, i: number) => selectedSuggestions.has(i));
        toCreate.dimensions = (aiPreview.dimensions || []).filter((_: any, i: number) => selectedSuggestions.has(mLen + i));
        toCreate.models = (aiPreview.models || []).filter((_: any, i: number) => selectedSuggestions.has(mLen + dLen + i));
      } else {
        toCreate.dimensions = (aiPreview.dimensions || []).filter((_: any, i: number) => selectedSuggestions.has(i));
      }
      await semanticApi.batchCreateFromSuggestions(dsId, toCreate);
      await Promise.all([loadMetrics(), loadDimensions(), loadModels()]);
      setAiPreview(null);
      setSelectedSuggestions(new Set());
      setAiSuggestSuccess(true);
      setTimeout(() => setAiSuggestSuccess(false), 3000);
    } catch (err) {
      setAiSuggestError((err as Error).message || "创建失败");
    } finally {
      setCreatingFromPreview(false);
    }
  };

  const toggleSuggestion = (idx: number) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // Bulk import handler
  const handleBulkImport = async () => {
    if (!dsId || !bulkContent.trim()) return;
    setBulkImporting(true);
    setAiSuggestError(null);
    try {
      await semanticApi.bulkImportMetrics(dsId, bulkContent, bulkContentType);
      await Promise.all([loadMetrics(), loadDimensions()]);
      setAiSuggestSuccess(true);
      setShowBulkImport(false);
      setBulkContent("");
      setTimeout(() => setAiSuggestSuccess(false), 3000);
    } catch (err) {
      setAiSuggestError((err as Error).message || "批量导入失败");
    } finally {
      setBulkImporting(false);
    }
  };

  // Filtered lists
  const filteredMetrics = showDeprecated
    ? metrics
    : metrics.filter((m) => m.status !== "deprecated");

  const filteredDimensions = showDeprecated
    ? dimensions
    : dimensions.filter((d) => d.status !== "deprecated");

  const filteredModels = showDeprecated
    ? models
    : models.filter((m) => m.status !== "deprecated");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "metrics", label: "指标" },
    { key: "dimensions", label: "维度" },
    { key: "models", label: "模型" },
    { key: "dictionary", label: "枚举值字典" },
  ];

  return (
    <div className="h-full flex flex-col bg-[var(--canvas)]">
      {/* Sunset stripe top accent */}
      <div className="sunset-stripe" />

      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="font-display text-heading-2 text-[var(--ink)]">
                指标管理
              </h2>
              <p className="text-body-sm text-[var(--slate)] mt-1">
                定义业务指标、维度和语义模型，提升 AI 查询准确度
              </p>
            </div>
            <div className="flex items-center gap-3">
              {metricDevEntry && (
                <button
                  onClick={() => {
                    setActiveChannel("metric_dev");
                    setView("chat");
                  }}
                  className="btn-primary inline-flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>
                  {metricDevEntry.label}
                </button>
              )}
              <button
                onClick={handleAiSuggest}
                disabled={aiSuggesting}
                className="btn-primary inline-flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>
                {aiSuggesting ? "分析中..." : "AI 推荐指标"}
              </button>
              <button
                onClick={handleAiSuggestDimensions}
                disabled={aiSuggestingDimensions}
                className="btn-secondary inline-flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>
                {aiSuggestingDimensions ? "分析中..." : "AI 推荐维度"}
              </button>
              <button
                onClick={() => setShowBulkImport(true)}
                className="btn-ghost text-xs"
              >
                批量导入
              </button>
              <button
                onClick={() => setShowTableSelector(!showTableSelector)}
                className="btn-ghost text-xs inline-flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
{showTableSelector ? "隐藏表选择" : "选择表"}
              </button>
            </div>
            {showTableSelector && tableNames.length > 0 && (
              <div className="mt-4 p-4 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[var(--ink)]">
                    选择用于 AI 推荐的表（不选则全局推荐）
                  </span>
                  <button
                    onClick={() => setSelectedTables([])}
                    className="text-xs text-[var(--primary)] hover:underline"
                  >
                    清除选择
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tableNames.map((name) => {
                    const isSelected = selectedTables.includes(name);
                    return (
                      <button
                        key={name}
                        onClick={() =>
                          {
                            setSelectedTables((prev) =>
                              prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
                            );
                            setShowTableSelector(false);
                          }
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                          isSelected
                            ? "bg-[var(--primary)] text-white shadow-sm"
                            : "bg-[var(--canvas)] text-[var(--steel)] border border-[var(--hairline)] hover:border-[var(--primary)]/40 hover:text-[var(--ink)]"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {aiSuggestError && (
              <div className="mt-3 px-3 py-2 rounded-lg border border-[var(--error)]/20 bg-[var(--error-soft)] text-[var(--error)] text-xs">
                {aiSuggestError}
              </div>
            )}
            {aiSuggestSuccess && (
              <div className="mt-3 px-3 py-2 rounded-lg border border-[var(--success)]/20 bg-[var(--success-soft)] text-[var(--success)] text-xs">
                AI 推荐完成，新指标/维度/模型已创建为草稿
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-[var(--hairline)]">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? "border-[var(--primary)] text-[var(--primary-text)]"
                    : "border-transparent text-[var(--steel)] hover:text-[var(--ink)]"
                }`}
              >
                {t.label}
              </button>
            ))}

            {/* Show deprecated toggle */}
            <div className="ml-auto flex items-center gap-2 mb-1">
              <label className="text-xs text-[var(--steel)] flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDeprecated}
                  onChange={(e) => setShowDeprecated(e.target.checked)}
                  className="rounded border-[var(--hairline-strong)] text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                显示已弃用
              </label>
            </div>
          </div>
        </div>

        {/* Content: list + detail split */}
        <div className="flex-1 flex min-h-0 px-8 pb-8 gap-6">
          {/* Left: List */}
          <div className="w-[340px] flex-shrink-0 flex flex-col min-h-0">
            {/* Add button (hidden for dictionary tab — entries come from dimensions/annotations) */}
            {tab !== "dictionary" && (
            <div className="mb-3">
              <button
                onClick={() => {
                  if (tab === "metrics") setSelectedMetric(null);
                  if (tab === "dimensions") setSelectedDimension(null);
                  if (tab === "models") setSelectedModel(null);
                }}
                className="btn-primary text-sm w-full"
              >
                + 新增{tab === "metrics" ? "指标" : tab === "dimensions" ? "维度" : "模型"}
              </button>
            </div>
            )}

            {/* List items */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
              {tab === "metrics" && (
                <>
                  {metricsLoading ? (
                    <p className="text-sm text-[var(--steel)] py-4">加载中...</p>
                  ) : filteredMetrics.length === 0 ? (
                    <p className="text-sm text-[var(--steel)] py-4">暂无指标定义</p>
                  ) : (
                    filteredMetrics.map((m) => {
                      const badge = STATUS_BADGE[m.status] || STATUS_BADGE.draft;
                      const isSelected = selectedMetric?.id === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setSelectedMetric(m)}
                          className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                            isSelected
                              ? "bg-[var(--primary-soft)] border border-[var(--primary)]"
                              : "hover:bg-[var(--surface)] border border-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-[var(--ink)] truncate">
                              {m.display_name || m.name}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                m.metric_type === 'atomic' ? 'bg-blue-100 text-blue-700' :
                                m.metric_type === 'derived' ? 'bg-green-100 text-green-700' :
                                'bg-purple-100 text-purple-700'
                              }`}>
                                {m.metric_type === 'atomic' ? '原子' :
                                 m.metric_type === 'derived' ? '衍生' : '复合'}
                              </span>
                              <span className={`flex items-center gap-1 text-xs ${badge.cls}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                                {badge.label}
                              </span>
                            </div>
                          </div>
                          {m.description && (
                            <p className="text-xs text-[var(--steel)] mt-0.5 truncate">
                              {m.description}
                            </p>
                          )}
                        </button>
                      );
                    })
                  )}
                </>
              )}

              {tab === "dimensions" && (
                <>
                  {dimensionsLoading ? (
                    <p className="text-sm text-[var(--steel)] py-4">加载中...</p>
                  ) : filteredDimensions.length === 0 ? (
                    <p className="text-sm text-[var(--steel)] py-4">暂无维度定义</p>
                  ) : (
                    filteredDimensions.map((d) => {
                      const dimBadge = STATUS_BADGE[d.status] || STATUS_BADGE.draft;
                      const isSelected = selectedDimension?.id === d.id;
                      return (
                        <button
                          key={d.id}
                          onClick={() => setSelectedDimension(d)}
                          className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                            isSelected
                              ? "bg-[var(--primary-soft)] border border-[var(--primary)]"
                              : "hover:bg-[var(--surface)] border border-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-[var(--ink)] truncate">
                              {d.display_name || d.name}
                              {d.grain && (
                                <span className="text-xs text-[var(--steel)] ml-1">({d.grain})</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {d.is_enum_dict && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">字典</span>
                              )}
                              <span className="text-xs text-[var(--steel)] bg-[var(--surface)] px-1.5 py-0.5 rounded">
                                {d.data_type}
                              </span>
                              <span className={`flex items-center gap-1 text-xs ${dimBadge.cls}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${dimBadge.dot}`} />
                                {dimBadge.label}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-[var(--steel)] mt-0.5 truncate font-mono">
                            {d.sql_expression}
                          </p>
                        </button>
                      );
                    })
                  )}
                </>
              )}

              {tab === "models" && (
                <>
                  {modelsLoading ? (
                    <p className="text-sm text-[var(--steel)] py-4">加载中...</p>
                  ) : filteredModels.length === 0 ? (
                    <p className="text-sm text-[var(--steel)] py-4">暂无模型定义</p>
                  ) : (
                    filteredModels.map((m) => {
                      const badge = STATUS_BADGE[m.status] || STATUS_BADGE.draft;
                      const isSelected = selectedModel?.id === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setSelectedModel(m)}
                          className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                            isSelected
                              ? "bg-[var(--primary-soft)] border border-[var(--primary)]"
                              : "hover:bg-[var(--surface)] border border-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-[var(--ink)] truncate">
                              {m.name}
                            </span>
                            <span className={`flex items-center gap-1 text-xs ${badge.cls}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--steel)] mt-0.5 truncate font-mono">
                            {m.base_table}
                          </p>
                        </button>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right: Detail / Form */}
          <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
            {tab === "metrics" && (
              <MetricForm
                datasourceId={dsId}
                metric={selectedMetric}
                dimensions={dimensions}
                onSave={loadMetrics}
                onDelete={() => { setSelectedMetric(null); loadMetrics(); }}
              />
            )}
            {tab === "dimensions" && (
              <DimensionForm
                datasourceId={dsId}
                dimension={selectedDimension}
                onSave={loadDimensions}
                onDelete={() => { setSelectedDimension(null); loadDimensions(); }}
              />
            )}
            {tab === "models" && (
              <ModelForm
                datasourceId={dsId}
                model={selectedModel}
                metrics={metrics}
                dimensions={dimensions}
                onSave={loadModels}
                onDelete={() => { setSelectedModel(null); loadModels(); }}
              />
            )}

          {tab === "dictionary" && (
            <EnumDictList datasourceId={dsId} />
          )}
          </div>
        </div>
      </div>
      {/* AI Preview Modal */}
      {aiPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--hairline)] w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
            <div className="sunset-stripe" />
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--hairline)]">
              <div>
                <h3 className="font-display text-lg text-[var(--ink)]">AI 推荐结果</h3>
                <p className="text-xs text-[var(--steel)] mt-0.5">选择要创建的项目，未选中的将被忽略</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const total = aiPreviewType === "semantic"
                      ? (aiPreview.metrics?.length || 0) + (aiPreview.dimensions?.length || 0) + (aiPreview.models?.length || 0)
                      : (aiPreview.dimensions?.length || 0);
                    if (selectedSuggestions.size === total) setSelectedSuggestions(new Set());
                    else {
                      const all: any[] = [];
                      if (aiPreview.metrics) all.push(...aiPreview.metrics);
                      if (aiPreview.dimensions) all.push(...aiPreview.dimensions);
                      if (aiPreview.models) all.push(...aiPreview.models);
                      setSelectedSuggestions(new Set(all.map((_: any, i: number) => i)));
                    }
                  }}
                  className="btn-ghost text-xs"
                >
                  {selectedSuggestions.size === ((aiPreview.metrics?.length || 0) + (aiPreview.dimensions?.length || 0) + (aiPreview.models?.length || 0)) ? "取消全选" : "全选"}
                </button>
                <button onClick={() => { setAiPreview(null); setSelectedSuggestions(new Set()); }} className="btn-ghost text-xs">关闭</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-6 space-y-6">
              {aiPreviewType === "semantic" && aiPreview.metrics && aiPreview.metrics.length > 0 && (
                <div>
                  <h4 className="label-mono mb-3">推荐指标 ({aiPreview.metrics.length})</h4>
                  <div className="space-y-2">
                    {aiPreview.metrics.map((m: any, i: number) => (
                      <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${selectedSuggestions.has(i) ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--hairline)] bg-[var(--canvas)] hover:border-[var(--primary)]/50"}`}>
                        <input type="checkbox" checked={selectedSuggestions.has(i)} onChange={() => toggleSuggestion(i)} className="mt-1 rounded border-[var(--hairline-strong)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--ink)]">{m.display_name || m.name}</span>
                            <span className="text-[10px] text-[var(--stone)] font-mono">{m.name}</span>
                            {m.metric_type && <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  m.metric_type === 'atomic' ? 'bg-blue-100 text-blue-700' :
                                  m.metric_type === 'derived' ? 'bg-green-100 text-green-700' :
                                  'bg-purple-100 text-purple-700'
                                }`}>{m.metric_type === 'atomic' ? '原子' : m.metric_type === 'derived' ? '衍生' : '复合'}</span>}
	                            {m.unit && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-100)] text-[var(--primary-text)]">{m.unit}</span>}
	                          </div>
	                          {m.business_context && <p className="text-xs text-[var(--steel)] mt-0.5">{m.business_context}</p>}
	                          {m.description && <p className="text-xs text-[var(--steel)] mt-0.5">{m.description}</p>}
	                          <p className="text-xs font-mono text-[var(--charcoal)] mt-1 bg-[var(--canvas)] rounded px-2 py-1 inline-block">{m.sql || m.sql_expression}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {aiPreview.dimensions && aiPreview.dimensions.length > 0 && (
                <div>
                  <h4 className="label-mono mb-3">推荐维度 ({aiPreview.dimensions.length})</h4>
                  <div className="space-y-2">
                    {aiPreview.dimensions.map((d: any, i: number) => {
                      const globalIdx = aiPreviewType === "semantic" ? (aiPreview.metrics?.length || 0) + i : i;
                      return (
                        <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${selectedSuggestions.has(globalIdx) ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--hairline)] bg-[var(--canvas)] hover:border-[var(--primary)]/50"}`}>
                          <input type="checkbox" checked={selectedSuggestions.has(globalIdx)} onChange={() => toggleSuggestion(globalIdx)} className="mt-1 rounded border-[var(--hairline-strong)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--ink)]">{d.display_name || d.name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--canvas)] text-[var(--steel)] border border-[var(--hairline)]">{d.data_type}</span>
                            </div>
                            {d.description && <p className="text-xs text-[var(--steel)] mt-0.5">{d.description}</p>}
                            <p className="text-xs font-mono text-[var(--charcoal)] mt-1">{d.sql_expression}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {aiPreviewType === "semantic" && aiPreview.models && aiPreview.models.length > 0 && (
                <div>
                  <h4 className="label-mono mb-3">推荐模型 ({aiPreview.models.length})</h4>
                  <div className="space-y-2">
                    {aiPreview.models.map((mdl: any, i: number) => {
                      const globalIdx = (aiPreview.metrics?.length || 0) + (aiPreview.dimensions?.length || 0) + i;
                      return (
                        <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${selectedSuggestions.has(globalIdx) ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--hairline)] bg-[var(--canvas)] hover:border-[var(--primary)]/50"}`}>
                          <input type="checkbox" checked={selectedSuggestions.has(globalIdx)} onChange={() => toggleSuggestion(globalIdx)} className="mt-1 rounded border-[var(--hairline-strong)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--ink)]">{mdl.name}</span>
                              <span className="text-[10px] font-mono text-[var(--stone)]">{mdl.base_table}</span>
                            </div>
                            {mdl.description && <p className="text-xs text-[var(--steel)] mt-0.5">{mdl.description}</p>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--hairline)] bg-[var(--canvas)]">
              <span className="text-xs text-[var(--steel)]">已选择 {selectedSuggestions.size} 项</span>
              <div className="flex items-center gap-3">
                <button onClick={() => { setAiPreview(null); setSelectedSuggestions(new Set()); }} className="btn-ghost">放弃全部</button>
                <button onClick={handleCreateFromPreview} disabled={creatingFromPreview || selectedSuggestions.size === 0} className="btn-primary disabled:opacity-40">
                  {creatingFromPreview ? "创建中..." : `创建选中的 ${selectedSuggestions.size} 项`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--canvas)] rounded-lg shadow-xl border border-[var(--hairline)] w-full max-w-2xl mx-4 p-6">
            <h3 className="font-display text-heading-4 text-[var(--ink)] mb-4">批量导入指标</h3>
            <p className="text-xs text-[var(--slate)] mb-4">
              提供 SQL、业务描述或文档内容，AI 将结合数据源表结构生成推荐指标和维度（草稿状态）
            </p>
            {/* Content type selector */}
            <div className="flex gap-2 mb-3">
              {(["description", "sql", "document"] as const).map((ct) => {
                const labels: Record<string, string> = { description: "业务描述", sql: "SQL", document: "文档" };
                return (
                  <button
                    key={ct}
                    onClick={() => setBulkContentType(ct)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      bulkContentType === ct
                        ? "bg-[var(--primary)] text-[var(--on-dark)]"
                        : "bg-[var(--surface)] text-[var(--slate)] border border-[var(--hairline)]"
                    }`}
                  >
                    {labels[ct]}
                  </button>
                );
              })}
            </div>
            {/* Content input */}
            <textarea
              className="w-full h-48 px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] placeholder:text-[var(--stone)] resize-y font-mono"
              value={bulkContent}
              onChange={(e) => setBulkContent(e.target.value)}
              placeholder={
                bulkContentType === "sql"
                  ? "粘贴 SQL 语句，如：SELECT SUM(amount) FROM orders GROUP BY customer_id"
                  : bulkContentType === "document"
                  ? "粘贴文档内容，如：业务指标定义文档..."
                  : "描述业务指标需求，如：需要统计每月总营收、订单数量、活跃用户数"
              }
            />
            {aiSuggestError && (
              <div className="mt-3 p-2 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-xs">
                {aiSuggestError}
              </div>
            )}
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowBulkImport(false); setBulkContent(""); setAiSuggestError(null); }}
                className="btn-ghost"
              >
                取消
              </button>
              <button
                onClick={handleBulkImport}
                disabled={bulkImporting || !bulkContent.trim()}
                className="btn-dark"
              >
                {bulkImporting ? "AI 分析中..." : "开始导入"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
