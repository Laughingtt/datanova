import { useRef } from "react";
import type { AgentInfo } from "../../agents/types";
import { useEmptyStateEntrance, useStaggerEntrance } from "../../hooks/useGsapAnimations";

interface AgentWelcomeProps {
  agent: AgentInfo;
  onQuickAction?: (prompt: string) => void;
}

// 按 agent.id 渲染 SVG 图标，避免 emoji 跨平台渲染不一致
const AGENT_ICONS: Record<string, React.ReactNode> = {
  query: (
    <svg className="w-10 h-10 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  ),
  metric_dev: (
    <svg className="w-10 h-10 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
};

export default function AgentWelcome({ agent, onQuickAction }: AgentWelcomeProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useEmptyStateEntrance(wrapRef, ".welcome-icon", [agent.id]);
  useStaggerEntrance(wrapRef, ".welcome-quick", [agent.id]);

  return (
    <div ref={wrapRef} className="flex-1 flex flex-col items-center justify-center px-8">
      <div className="welcome-icon w-16 h-16 mb-4 rounded-2xl bg-[var(--primary-soft)] flex items-center justify-center">
        {AGENT_ICONS[agent.id] ?? AGENT_ICONS.query}
      </div>
      <h3 className="text-lg font-medium text-[var(--ink)] mb-2">{agent.name}</h3>
      <p className="text-sm text-[var(--steel)] mb-6 text-center max-w-md whitespace-pre-line">
        {agent.welcomeMessage}
      </p>
      {agent.id === "metric_dev" && (
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => onQuickAction?.("帮我开发一个月度营收指标")}
            className="welcome-quick px-4 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--ink)] hover:border-[var(--primary-soft)] transition-colors"
          >
            开发月度营收指标
          </button>
          <button
            onClick={() => onQuickAction?.("帮我分析数据源，推荐一批常用指标")}
            className="welcome-quick px-4 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--ink)] hover:border-[var(--primary-soft)] transition-colors"
          >
            推荐常用指标
          </button>
          <button
            onClick={() => onQuickAction?.("检查现有指标是否有冲突或重复")}
            className="welcome-quick px-4 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--ink)] hover:border-[var(--primary-soft)] transition-colors"
          >
            检查指标冲突
          </button>
        </div>
      )}
    </div>
  );
}
