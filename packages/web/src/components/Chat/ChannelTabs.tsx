import { AGENT_REGISTRY } from "../../agents/registry";

interface ChannelTabsProps {
  activeChannel: string;
  onChannelChange: (channelId: string) => void;
}

/**
 * Agent 频道切换 — New API tabs 样式：
 * muted 轨道 + 白色 active 胶囊 + 轻微阴影
 */
export default function ChannelTabs({ activeChannel, onChannelChange }: ChannelTabsProps) {
  return (
    <div className="border-b border-[var(--border)] px-4 py-2">
      <div className="tabs-track" role="tablist" aria-label="Agent 频道">
        {AGENT_REGISTRY.map(agent => {
          const isActive = activeChannel === agent.id;
          return (
            <button
              key={agent.id}
              role="tab"
              aria-selected={isActive}
              data-active={isActive}
              onClick={() => onChannelChange(agent.id)}
              className="tab-trigger h-7 px-3"
            >
              <span className="text-[13px] leading-none">{agent.icon}</span>
              {agent.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
