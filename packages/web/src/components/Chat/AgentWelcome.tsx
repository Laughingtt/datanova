import type { AgentInfo } from "../../agents/types";

interface AgentWelcomeProps {
  agent: AgentInfo;
  onQuickAction?: (prompt: string) => void;
}

export default function AgentWelcome({ agent, onQuickAction }: AgentWelcomeProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <div className="text-4xl mb-4">{agent.icon}</div>
      <h3 className="text-lg font-medium text-[var(--ink)] mb-2">{agent.name}</h3>
      <p className="text-sm text-[var(--steel)] mb-6 text-center max-w-md whitespace-pre-line">
        {agent.welcomeMessage}
      </p>
      {agent.id === "metric_dev" && (
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => onQuickAction?.("帮我开发一个月度营收指标")}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--ink)] hover:border-[var(--primary)]/40 transition-colors"
          >
            开发月度营收指标
          </button>
          <button
            onClick={() => onQuickAction?.("帮我分析数据源，推荐一批常用指标")}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--ink)] hover:border-[var(--primary)]/40 transition-colors"
          >
            推荐常用指标
          </button>
          <button
            onClick={() => onQuickAction?.("检查现有指标是否有冲突或重复")}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--ink)] hover:border-[var(--primary)]/40 transition-colors"
          >
            检查指标冲突
          </button>
        </div>
      )}
    </div>
  );
}
