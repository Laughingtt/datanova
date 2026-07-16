import { AGENT_REGISTRY } from "../../agents/registry";

interface ChannelTabsProps {
  activeChannel: string;
  onChannelChange: (channelId: string) => void;
}

export default function ChannelTabs({ activeChannel, onChannelChange }: ChannelTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--hairline)] px-6">
      {AGENT_REGISTRY.map(agent => (
        <button
          key={agent.id}
          onClick={() => onChannelChange(agent.id)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeChannel === agent.id
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-[var(--steel)] hover:text-[var(--ink)]"
          }`}
        >
          <span className="mr-1.5">{agent.icon}</span>
          {agent.name}
        </button>
      ))}
    </div>
  );
}
