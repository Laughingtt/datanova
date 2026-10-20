import { useState, useRef } from "react";
import { useDrawSvgConnectors, useStaggerEntrance } from "../../hooks/useGsapAnimations";

interface ToolDetail {
  turn: number;
  thinking: string;
  tool: string;
  args_summary: string;
  result_summary: string;
  is_error: boolean;
}

interface ToolChainTimelineProps {
  toolDetails: ToolDetail[];
  thinkingSummary?: string;
}

// Tool name → display label (neutral chip styling)
const TOOL_META: Record<string, { label: string; color: string; bg: string }> = {
  lookup_semantic_layer: { label: "语义层", color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" },
  discover_schema: { label: "Schema发现", color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" },
  execute_sql: { label: "SQL执行", color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" },
  lookup_examples: { label: "示例查询", color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" },
  read_skill: { label: "查询技能", color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" },
  ai_annotate_schema: { label: "AI标注", color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" },
  validate_and_test_metric: { label: "验证指标", color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" },
  check_metric_conflict: { label: "冲突检查", color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" },
  create_metric_draft: { label: "创建指标", color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" },
  create_dimension_draft: { label: "创建维度", color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" },
  request_user_confirm: { label: "用户确认", color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" },
};

function getToolMeta(tool: string) {
  return TOOL_META[tool] ?? { label: tool, color: "text-[var(--muted-foreground)]", bg: "bg-[var(--muted)]" };
}

export default function ToolChainTimeline({ toolDetails, thinkingSummary }: ToolChainTimelineProps) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  // Expanded step index — each tool node is collapsible to reveal its decision rationale.
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Stagger the tool nodes in; DrawSVG "draws" the vertical connector path.
  useStaggerEntrance(timelineRef, ".tool-node", [toolDetails]);
  useDrawSvgConnectors(timelineRef, ".chain-connector", [toolDetails]);

  return (
    <div className="space-y-0">
      {/* Conversation-level thinking overview */}
      {thinkingSummary && thinkingSummary.trim().length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
            className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors w-full text-left"
          >
            <svg className={`w-3 h-3 transition-transform ${thinkingExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-medium">Agent 思考（整体）</span>
            <span className="text-[var(--stone)]">({thinkingSummary.length} 字)</span>
          </button>
          {thinkingExpanded && (
            <div className="mt-2 ml-5 text-xs text-[var(--muted-foreground)] bg-[color-mix(in_srgb,var(--muted)_40%,transparent)] rounded-lg p-3 whitespace-pre-wrap border border-[var(--border)] max-h-[240px] overflow-y-auto custom-scrollbar">
              {thinkingSummary}
            </div>
          )}
        </div>
      )}

      {/* Decision chain timeline — each node shows the tool, its per-tool
          rationale (why it was chosen), args, and outcome. Expandable. */}
      <div ref={timelineRef} className="relative ml-2">
        {toolDetails.length > 1 && (
          <svg
            className="absolute left-[7px] top-3 bottom-3 w-[2px] overflow-visible pointer-events-none"
            viewBox="0 0 1 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line
              className="chain-connector"
              x1="0.5"
              y1="0"
              x2="0.5"
              y2="100"
              stroke="var(--border)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {toolDetails.map((step, i) => {
          const meta = getToolMeta(step.tool);
          const isOpen = expandedStep === i;
          const hasRationale = step.thinking && step.thinking.trim().length > 0;
          return (
            <div key={i} className="relative tool-node">
              <button
                onClick={() => setExpandedStep(isOpen ? null : i)}
                className="relative flex items-start gap-3 py-1.5 w-full text-left"
              >
                {/* Dot on the line */}
                <div className={`relative z-10 w-[15px] h-[15px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  step.is_error ? "bg-[var(--error-soft)]" : meta.bg
                }`}>
                  <div className={`w-[7px] h-[7px] rounded-full ${
                    step.is_error ? "bg-[var(--error)]" : "bg-current"
                  } ${step.is_error ? "" : meta.color}`} />
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--stone)] font-mono">T{step.turn}·#{i + 1}</span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider ${meta.bg} ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className={`text-xs ${step.is_error ? "text-[var(--error)]" : "text-[var(--success)]"}`}>
                      {step.is_error ? "✗ 失败" : step.result_summary === "pending" ? "…" : "✓"}
                    </span>
                    {hasRationale && (
                      <span className="text-[10px] text-[var(--muted-foreground)] inline-flex items-center gap-0.5">
                        <svg className={`w-2.5 h-2.5 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        抉择
                      </span>
                    )}
                  </div>
                  {step.args_summary && step.args_summary.length > 2 && (
                    <div className="mt-1 text-[10px] font-mono text-[var(--stone)] truncate max-w-[420px]">
                      {step.args_summary}
                    </div>
                  )}
                  {!isOpen && (
                    <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)] truncate max-w-[420px]">
                      → {step.result_summary}
                    </div>
                  )}
                </div>
              </button>
              {isOpen && (
                <div className="ml-8 mb-2 space-y-2">
                  {hasRationale && (
                    <div className="text-xs text-[var(--foreground)] bg-[color-mix(in_srgb,var(--muted)_40%,transparent)] rounded-lg p-2.5 border border-[var(--border)]">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] mb-1">抉择理由 · 为什么调用此工具</div>
                      <div className="whitespace-pre-wrap leading-relaxed">{step.thinking}</div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-1.5">
                    <div className="text-[11px] bg-[color-mix(in_srgb,var(--muted)_40%,transparent)] rounded p-2 border border-[var(--border)]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--stone)]">输入参数　</span>
                      <span className="font-mono text-[var(--muted-foreground)] break-all">{step.args_summary || "—"}</span>
                    </div>
                    <div className={`text-[11px] rounded p-2 border ${step.is_error ? "bg-[var(--error-soft)] border-[color-mix(in_srgb,var(--error)_30%,transparent)]" : "bg-[color-mix(in_srgb,var(--muted)_40%,transparent)] border-[var(--border)]"}`}>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--stone)]">执行结果　</span>
                      <span className={step.is_error ? "text-[var(--error)]" : "text-[var(--muted-foreground)]"}>{step.result_summary}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact inline version for the list view
export function ToolChainCompact({ toolSequence }: { toolSequence: string[] }) {
  if (toolSequence.length === 0) {
    return <span className="text-xs text-[var(--stone)]">无工具调用</span>;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {toolSequence.map((tool, i) => {
        const meta = getToolMeta(tool);
        return (
          <span key={i} className="flex items-center gap-0.5">
            {i > 0 && (
              <svg className="w-2.5 h-2.5 text-[var(--stone)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
            <span className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-mono font-medium ${meta.bg} ${meta.color}`}>
              {meta.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}
