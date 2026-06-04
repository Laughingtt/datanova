import type { AgentStep } from "../../hooks/useAgentStream";

interface StepIndicatorProps {
  step: AgentStep;
}

export default function StepIndicator({ step }: StepIndicatorProps) {
  switch (step.type) {
    case "thinking":
      return (
        <div className="flex items-center gap-2 py-1">
          <span className="animate-pulse text-[var(--primary)]">●</span>
          <span className="text-xs text-[var(--steel)]">Thinking…</span>
          {step.content && (
            <span className="text-xs text-[var(--stone)] truncate max-w-xs">
              {step.content}
            </span>
          )}
        </div>
      );

    case "tool_call":
      return (
        <div className="flex items-center gap-2 py-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md
                           bg-[var(--primary-soft)] text-[var(--primary-text)]
                           text-xs font-mono uppercase tracking-wider font-medium">
            {step.toolName ?? "tool"}
          </span>
          {step.args && (
            <span className="text-xs text-[var(--stone)] font-mono truncate max-w-sm">
              {JSON.stringify(step.args).slice(0, 100)}
            </span>
          )}
        </div>
      );

    case "tool_result":
      return (
        <div className="flex items-center gap-2 py-1">
          <span className={`text-xs ${step.isError ? "text-[var(--error)]" : "text-[var(--success)]"}`}>
            {step.isError ? "✗" : "✓"}
          </span>
          <span className="text-xs text-[var(--steel)]">
            {step.toolName ?? "tool"} {step.isError ? "failed" : "completed"}
          </span>
        </div>
      );

    default:
      return null;
  }
}
