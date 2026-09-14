import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import {
  datasourcesApi,
  agentTraceApi,
  type Datasource,
  type AgentTraceItem,
  type AgentTraceStats,
  type AgentChainInference,
} from "../../api/client";
import { formatDuration, formatDateTimeShort, formatRelativeTime } from "../../utils/format";
import { useCopy } from "../../hooks/useCopy";
import TraceStatsBar from "./TraceStatsBar";
import ToolChainTimeline, { ToolChainCompact } from "./ToolChainTimeline";

export default function AgentTracesPage() {
  const { selectedDatasourceId, selectedDatasourceName, setSelectedDatasource } = useAppStore();
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [currentDsId, setCurrentDsId] = useState<string>(selectedDatasourceId ?? "");
  const [traces, setTraces] = useState<AgentTraceItem[]>([]);
  const [stats, setStats] = useState<AgentTraceStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedTrace, setSelectedTrace] = useState<AgentTraceItem | null>(null);
  const [filterSelfCorrected, setFilterSelfCorrected] = useState(false);
  const [filterNoSemanticLayer, setFilterNoSemanticLayer] = useState(false);
  const { copy } = useCopy({ inline: false, successText: "SQL 已复制" });

  // Load datasources on mount
  useEffect(() => {
    datasourcesApi.list().then(setDatasources).catch(() => {});
  }, []);

  const loadTraces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await agentTraceApi.list({
        datasourceId: currentDsId || undefined,
        selfCorrected: filterSelfCorrected,
        noSemanticLayer: filterNoSemanticLayer,
        limit: 100,
      });
      setTraces(data);
    } catch {
      setTraces([]);
    } finally {
      setLoading(false);
    }
  }, [currentDsId, filterSelfCorrected, filterNoSemanticLayer]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await agentTraceApi.stats(currentDsId || undefined);
      setStats(s);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [currentDsId]);

  useEffect(() => { loadTraces(); }, [loadTraces]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const handleDatasourceChange = (id: string) => {
    setCurrentDsId(id);
    setSelectedDatasource(id, datasources.find((d) => d.id === id)?.name ?? null);
    setSelectedTrace(null);
  };

  return (
    <div className="h-full overflow-auto bg-[var(--canvas)]">
      <div className="sunset-stripe" />
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-2xl text-[var(--ink)]">Agent 追踪</h2>
            <p className="text-sm text-[var(--steel)] mt-1">
              监控智能问数 Agent 的决策路径、工具选择与执行质量
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Datasource selector */}
            <div className="relative">
              <select
                value={currentDsId}
                onChange={(e) => handleDatasourceChange(e.target.value)}
                className="input-field !py-1.5 !pr-8 !text-xs !font-medium min-w-[200px] appearance-none bg-[var(--surface)]"
              >
                <option value="">全部数据源</option>
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

        {/* Stats */}
        <TraceStatsBar stats={stats} loading={statsLoading} />

        {/* Tool distribution (if stats available) */}
        {stats && stats.toolDistribution.length > 0 && (
          <div className="card-base mb-6">
            <h3 className="text-sm font-semibold text-[var(--ink)] font-body mb-3">工具使用分布</h3>
            <div className="flex items-end gap-3 flex-wrap">
              {stats.toolDistribution.map((t, i) => {
                const max = Math.max(...stats.toolDistribution.map(d => d.count), 1);
                const toolLabels: Record<string, string> = {
                  lookup_semantic_layer: "语义层",
                  discover_schema: "Schema",
                  execute_sql: "SQL执行",
                  lookup_examples: "示例",
                  read_skill: "技能",
                };
                return (
                  <div key={i} className="flex flex-col items-center gap-1 min-w-[60px]">
                    <span className="text-xs text-[var(--ink)] font-mono font-medium">{t.count}</span>
                    <div
                      className="w-12 rounded-t-md transition-all duration-300"
                      style={{
                        height: `${Math.max((t.count / max) * 60, 8)}px`,
                        background: "linear-gradient(to top, var(--accent-600), var(--accent-400))",
                      }}
                    />
                    <span className="text-[10px] text-[var(--steel)] text-center">
                      {toolLabels[t.tool] ?? t.tool}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-[var(--steel)] cursor-pointer">
            <input
              type="checkbox"
              checked={filterSelfCorrected}
              onChange={(e) => setFilterSelfCorrected(e.target.checked)}
              className="rounded border-[var(--hairline-strong)] text-[var(--highlight)] focus:ring-[var(--highlight)]"
            />
            <span className="flex items-center gap-1">
              <span className="text-[var(--highlight)]">⚠️</span>
              仅看自修复
            </span>
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--steel)] cursor-pointer">
            <input
              type="checkbox"
              checked={filterNoSemanticLayer}
              onChange={(e) => setFilterNoSemanticLayer(e.target.checked)}
              className="rounded border-[var(--hairline-strong)] text-[var(--error)] focus:ring-[var(--error)]"
            />
            <span className="flex items-center gap-1">
              <span className="text-[var(--error)]">🔴</span>
              未用语义层
            </span>
          </label>
          <button
            onClick={() => { loadTraces(); loadStats(); }}
            className="btn-ghost text-xs gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新
          </button>
          <span className="text-xs text-[var(--stone)] ml-auto">{traces.length} 条记录</span>
        </div>

        {/* List + Detail */}
        <div className="flex gap-6 flex-col md:flex-row">
          {/* List */}
          <div className="w-full md:w-[520px] flex-shrink-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-[var(--accent-300)] border-t-[var(--primary)] rounded-full animate-spin" />
              </div>
            ) : traces.length === 0 ? (
              <div className="card-base text-center py-16">
                <svg className="w-10 h-10 mx-auto text-[var(--stone)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <p className="text-sm text-[var(--steel)]">暂无 Agent 追踪记录</p>
                <p className="text-xs text-[var(--stone)] mt-1">在智能对话中提问后，决策路径将显示在这里</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto custom-scrollbar">
                {traces.map((trace) => {
                  const isSelected = selectedTrace?.id === trace.id;
                  let toolSequence: string[] = [];
                  try { toolSequence = JSON.parse(trace.tool_sequence); } catch {}
                  return (
                    <button
                      key={trace.id}
                      onClick={() => setSelectedTrace(trace)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 border ${
                        isSelected
                          ? "bg-[var(--primary-soft)] border-[var(--primary)]"
                          : "hover:bg-[var(--surface)] border-transparent hover:border-[var(--hairline)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--ink)] truncate flex-1">
                          {trace.user_question || "（无问题记录）"}
                        </span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {trace.self_corrected === 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--warning-soft)] text-[var(--highlight)]" title="发生自修复">
                              修复
                            </span>
                          )}
                          {trace.used_semantic_layer === 0 && trace.total_tool_calls > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--error-soft)] text-[var(--error)]" title="未使用语义层">
                              无语义层
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1.5">
                        <ToolChainCompact toolSequence={toolSequence} />
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--steel)]">
                        <span>{formatRelativeTime(trace.created_at)}</span>
                        {trace.datasource_name && (
                          <span className="text-[var(--primary-text)] font-medium">{trace.datasource_name}</span>
                        )}
                        <span>{trace.total_tool_calls} 次调用</span>
                        {trace.duration_ms !== null && (
                          <span>{formatDuration(trace.duration_ms)}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className="flex-1 min-w-0">
            {selectedTrace ? (
              <TraceDetail trace={selectedTrace} onCopy={copy} />
            ) : (
              <div className="card-base text-center py-16">
                <svg className="w-10 h-10 mx-auto text-[var(--stone)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <p className="text-sm text-[var(--steel)]">选择一条记录查看决策详情</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Trace Detail Panel ====================

function TraceDetail({ trace, onCopy }: { trace: AgentTraceItem; onCopy: (text: string) => void }) {
  let toolDetails: Array<{ turn: number; thinking: string; tool: string; args_summary: string; result_summary: string; is_error: boolean }> = [];
  try { toolDetails = JSON.parse(trace.tool_details); } catch {}

  const [inference, setInference] = useState<AgentChainInference | null>(null);
  const [inferring, setInferring] = useState(false);
  const [inferError, setInferError] = useState<string | null>(null);

  // Reset inference state when switching traces
  useEffect(() => {
    setInference(null);
    setInferring(false);
    setInferError(null);
  }, [trace.id]);

  const runInferChain = async () => {
    setInferring(true);
    setInferError(null);
    try {
      const result = await agentTraceApi.inferChain(trace.id);
      setInference(result);
    } catch (err) {
      setInferError((err as Error).message);
    } finally {
      setInferring(false);
    }
  };

  return (
    <div className="card-base">
      <div className="space-y-5">
        {/* User question */}
        <div>
          <h3 className="label-mono mb-1.5">用户问题</h3>
          <p className="text-sm text-[var(--ink)] bg-[var(--canvas)] rounded-lg p-3">
            {trace.user_question || "（无问题记录）"}
          </p>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <h3 className="label-mono mb-1">Agent 类型</h3>
            <p className="text-sm text-[var(--ink)] font-medium">{trace.agent_type}</p>
          </div>
          <div>
            <h3 className="label-mono mb-1">数据源</h3>
            <p className="text-sm text-[var(--ink)]">{trace.datasource_name || "—"}</p>
          </div>
          <div>
            <h3 className="label-mono mb-1">耗时</h3>
            <p className="text-sm text-[var(--ink)]">{formatDuration(trace.duration_ms)}</p>
          </div>
          <div>
            <h3 className="label-mono mb-1">时间</h3>
            <p className="text-sm text-[var(--ink)]">{formatDateTimeShort(trace.created_at)}</p>
          </div>
        </div>

        {/* Decision analysis tags */}
        <div>
          <h3 className="label-mono mb-2">决策分析</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <AnalysisTag
              active={trace.used_semantic_layer === 1}
              label="语义层命中"
              activeColor="bg-[var(--info-soft)] text-[var(--info)]"
              inactiveColor="bg-[var(--error-soft)] text-[var(--error)]"
            />
            <AnalysisTag
              active={trace.used_discover_schema === 1}
              label="Schema 发现"
              activeColor="bg-[var(--accent-100)] text-[var(--accent-600)]"
            />
            <AnalysisTag
              active={trace.used_examples === 1}
              label="示例匹配"
              activeColor="bg-[var(--primary-soft)] text-[var(--primary)]"
            />
            <AnalysisTag
              active={trace.used_skill === 1}
              label="技能使用"
              activeColor="bg-[var(--warning-soft)] text-[var(--highlight)]"
            />
            <AnalysisTag
              active={trace.self_corrected === 1}
              label="发生自修复"
              activeColor="bg-[var(--warning-soft)] text-[var(--highlight)]"
            />
          </div>
        </div>

        {/* Synthesized decision rationale (full chain narrative) */}
        {trace.decision_rationale && trace.decision_rationale.trim().length > 0 && (
          <div>
            <h3 className="label-mono mb-2">链路综述 · 抉择路径</h3>
            <pre className="text-xs text-[var(--ink)] bg-[var(--canvas)] rounded-lg p-3 whitespace-pre-wrap border border-[var(--hairline-soft)] max-h-[320px] overflow-y-auto custom-scrollbar font-body leading-relaxed">
              {trace.decision_rationale}
            </pre>
          </div>
        )}

        {/* Tool chain timeline */}
        <div>
          <h3 className="label-mono mb-3">工具调用链路（点击节点查看抉择理由）</h3>
          <ToolChainTimeline toolDetails={toolDetails} thinkingSummary={trace.thinking_summary} />
        </div>

        {/* Administrator chain audit — reconstruct the decision chain via LLM */}
        <div>
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="label-mono !mb-0">管理员链路审计 · 反推决策链</h3>
            <button
              onClick={runInferChain}
              disabled={inferring}
              className="btn-primary !text-xs !py-1 !px-2.5 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {inferring ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  反推中…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  {inference ? "重新审计" : "审计链路"}
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-[var(--steel)] mb-2">
            调用 infer_agent_chain，由管理员 Agent 根据本条 trace 反推出功能 Agent 的完整决策链路（每步抉择点、期望 vs 实际、自修复分析、链路判定）。
          </p>
          {inferError && (
            <div className="text-xs text-[var(--error)] bg-[var(--error-soft)] rounded-lg p-2.5 mb-2">
              审计失败：{inferError}
            </div>
          )}
          {inference && <ChainInferenceView inference={inference} />}
        </div>

        {/* Final SQL */}
        {trace.final_sql && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="label-mono !mb-0">最终执行的 SQL</h3>
              <button
                onClick={() => onCopy(trace.final_sql!)}
                className="btn-ghost !text-[10px] !py-0.5 !px-1.5"
                title="复制 SQL"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                复制
              </button>
            </div>
            <pre className="text-sm font-mono text-[var(--ink)] bg-[var(--canvas)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap border border-[var(--hairline-soft)]">
              {trace.final_sql}
            </pre>
          </div>
        )}

        {/* Conversation link */}
        <div className="text-xs text-[var(--stone)] pt-2 border-t border-[var(--hairline-soft)]">
          会话 ID: <span className="font-mono">{trace.conversation_id}</span>
          {trace.total_turns > 0 && <span className="ml-3">思考步数: {trace.total_turns}</span>}
        </div>
      </div>
    </div>
  );
}

// ==================== Chain Inference View ====================

function ChainInferenceView({ inference }: { inference: AgentChainInference }) {
  const chain = inference.chain;

  if (!chain) {
    return (
      <div className="text-xs text-[var(--steel)] bg-[var(--canvas)] rounded-lg p-3 border border-[var(--hairline-soft)] whitespace-pre-wrap">
        {inference.text || "（无链路反推结果）"}
      </div>
    );
  }

  const verdictColor: Record<string, string> = {
    "合理": "bg-[var(--success-soft)] text-[var(--success)]",
    "基本合理": "bg-[var(--warning-soft)] text-[var(--highlight)]",
    "存在缺陷": "bg-[var(--error-soft)] text-[var(--error)]",
    "信息不足": "bg-[var(--surface)] text-[var(--steel)]",
    "信息受限": "bg-[var(--surface)] text-[var(--steel)]",
  };
  const verdictCls = verdictColor[chain.chain_verdict] ?? "bg-[var(--surface)] text-[var(--steel)]";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${verdictCls}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          链路判定：{chain.chain_verdict}
        </span>
        {inference.llm_model && inference.llm_model !== "none" && (
          <span className="text-[10px] text-[var(--stone)] font-mono">模型: {inference.llm_model}</span>
        )}
        {inference.step_count !== undefined && (
          <span className="text-[10px] text-[var(--stone)] font-mono">步骤: {inference.step_count}</span>
        )}
      </div>

      <div className="text-sm text-[var(--ink)] bg-[var(--primary-soft)] rounded-lg p-3 border border-[var(--hairline-soft)] leading-relaxed">
        {chain.chain_summary}
      </div>

      {chain.decision_points.length > 0 && (
        <div className="space-y-2">
          <div className="label-mono">逐步抉择点</div>
          {chain.decision_points.map((dp, i) => (
            <div key={i} className="text-xs bg-[var(--canvas)] rounded-lg p-3 border border-[var(--hairline-soft)] space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[var(--stone)]">#{dp.step}</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider bg-[var(--accent-100)] text-[var(--accent-600)]">
                  {dp.tool}
                </span>
              </div>
              <div><span className="text-[var(--primary)] font-medium">抉择理由：</span><span className="text-[var(--ink)]">{dp.rationale}</span></div>
              <div><span className="text-[var(--stone)]">期望：</span><span className="text-[var(--steel)]">{dp.expected}</span></div>
              <div><span className="text-[var(--stone)]">实际：</span><span className="text-[var(--steel)]">{dp.actual}</span></div>
              {dp.drove_next && <div><span className="text-[var(--stone)]">驱动下一步：</span><span className="text-[var(--steel)]">{dp.drove_next}</span></div>}
            </div>
          ))}
        </div>
      )}

      {chain.self_correction_analysis && (
        <div className="text-xs text-[var(--highlight)] bg-[var(--warning-soft)] rounded-lg p-3 border border-[var(--hairline-soft)]">
          <span className="font-medium">自修复分析：</span>{chain.self_correction_analysis}
        </div>
      )}

      <div className="text-xs text-[var(--steel)] bg-[var(--surface)] rounded-lg p-3 border border-[var(--hairline-soft)]">
        <span className="font-medium text-[var(--ink)]">判定依据：</span>{chain.verdict_reason}
      </div>

      {chain.improvement_suggestions.length > 0 && (
        <div className="text-xs bg-[var(--canvas)] rounded-lg p-3 border border-[var(--hairline-soft)]">
          <div className="font-medium text-[var(--ink)] mb-1">改进建议</div>
          <ul className="list-disc list-inside space-y-0.5 text-[var(--steel)]">
            {chain.improvement_suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ==================== Analysis Tag ====================

function AnalysisTag({
  active,
  label,
  activeColor,
  inactiveColor,
}: {
  active: boolean;
  label: string;
  activeColor: string;
  inactiveColor?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
      active
        ? activeColor
        : inactiveColor ?? "bg-[var(--surface)] text-[var(--stone)]"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-current" : "bg-[var(--stone)]"}`} />
      {label}
    </span>
  );
}
