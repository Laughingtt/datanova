import type { AgentStep } from "../../hooks/useAgentStream";

interface StepIndicatorProps {
  step: AgentStep;
}

export default function StepIndicator({ step }: StepIndicatorProps) {
  switch (step.type) {
    case "thinking":
      return (
        <div className="flex items-center gap-2 text-caption text-muted-slate py-1">
          <span className="animate-pulse">🔍</span>
          <span>Thinking...</span>
          {step.content && (
            <span className="text-micro text-muted-slate/70 truncate max-w-xs">
              {step.content}
            </span>
          )}
        </div>
      );

    case "tool_call":
      return (
        <div className="flex items-center gap-2 py-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-coral/10 border border-coral/30 text-micro text-coral font-mono uppercase tracking-wider">
            {step.toolName ?? "tool"}
          </span>
          {step.args && (
            <span className="text-micro text-muted-slate font-mono truncate max-w-sm">
              {JSON.stringify(step.args).slice(0, 100)}
            </span>
          )}
        </div>
      );

    case "tool_result":
      return (
        <div className="flex items-center gap-2 py-1">
          <span>{step.isError ? "❌" : "✅"}</span>
          <span className="text-micro text-muted-slate">
            {step.toolName ?? "tool"} {step.isError ? "failed" : "completed"}
          </span>
        </div>
      );

    default:
      return null;
  }
}
