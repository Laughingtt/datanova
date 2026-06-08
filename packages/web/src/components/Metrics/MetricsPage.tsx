import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import {
  semanticApi,
  type SemanticMetric,
  type SemanticDimension,
  type SemanticModel,
} from "../../api/client";
import MetricForm from "./MetricForm";
import DimensionForm from "./DimensionForm";
import ModelForm from "./ModelForm";

type TabKey = "metrics" | "dimensions" | "models";

const STATUS_BADGE: Record<string, { dot: string; label: string; cls: string }> = {
  published:  { dot: "bg-[var(--success)]",  label: "已发布",  cls: "text-[var(--success)]" },
  draft:      { dot: "bg-[var(--warning)]",   label: "草稿",      cls: "text-[var(--warning)]" },
  deprecated: { dot: "bg-[var(--error)]",     label: "已弃用", cls: "text-[var(--error)]" },
};

export default function MetricsPage() {
  const { selectedDatasourceId } = useAppStore();
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

  // AI suggest handler
  const handleAiSuggest = async () => {
    if (!dsId) return;
    setAiSuggesting(true);
    try {
      await semanticApi.aiSuggestSemantic(dsId);
      // Reload all data after suggestion
      await Promise.all([loadMetrics(), loadDimensions(), loadModels()]);
    } catch (err) {
      console.error("AI suggest failed:", err);
    } finally {
      setAiSuggesting(false);
    }
  };

  // Filtered lists
  const filteredMetrics = showDeprecated
    ? metrics
    : metrics.filter((m) => m.status !== "deprecated");

  const filteredDimensions = showDeprecated
    ? dimensions
    : dimensions; // dimensions don't have status, show all

  const filteredModels = showDeprecated
    ? models
    : models; // models don't have status, show all

  const tabs: { key: TabKey; label: string }[] = [
    { key: "metrics", label: "指标" },
    { key: "dimensions", label: "维度" },
    { key: "models", label: "模型" },
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
              <button
                onClick={handleAiSuggest}
                disabled={aiSuggesting}
                className="btn-cream"
              >
                {aiSuggesting ? "AI 分析中..." : "AI 推荐指标"}
              </button>
            </div>
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
                Show deprecated
              </label>
            </div>
          </div>
        </div>

        {/* Content: list + detail split */}
        <div className="flex-1 flex min-h-0 px-8 pb-8 gap-6">
          {/* Left: List */}
          <div className="w-[340px] flex-shrink-0 flex flex-col min-h-0">
            {/* Add button */}
            <div className="mb-3">
              <button
                onClick={() => {
                  if (tab === "metrics") setSelectedMetric(null);
                  if (tab === "dimensions") setSelectedDimension(null);
                  if (tab === "models") setSelectedModel(null);
                }}
                className="btn-primary text-sm w-full"
              >
                + Add {tab === "metrics" ? "Metric" : tab === "dimensions" ? "Dimension" : "Model"}
              </button>
            </div>

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
                            <span className={`flex items-center gap-1 text-xs ${badge.cls}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                              {badge.label}
                            </span>
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
                            </span>
                            <span className="text-xs text-[var(--steel)] bg-[var(--surface)] px-1.5 py-0.5 rounded">
                              {d.data_type}
                            </span>
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
          </div>
        </div>
      </div>
    </div>
  );
}
