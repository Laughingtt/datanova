import { useRef, useState } from "react";
import { AGENT_REGISTRY } from "../../agents/registry";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { EASE, DUR, prefersReducedMotion } from "../../utils/gsap-presets";

gsap.registerPlugin(useGSAP);

interface ChannelTabsProps {
  activeChannel: string;
  onChannelChange: (channelId: string) => void;
}

export default function ChannelTabs({ activeChannel, onChannelChange }: ChannelTabsProps) {
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [activeEl, setActiveEl] = useState<HTMLElement | null>(null);

  useGSAP(() => {
    if (!indicatorRef.current || !activeEl || prefersReducedMotion()) return;
    const containerRect = tabContainerRef.current?.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    if (!containerRect) return;
    gsap.to(indicatorRef.current, {
      x: elRect.left - containerRect.left,
      width: elRect.width,
      duration: DUR.normal,
      ease: EASE.smooth,
    });
  }, { scope: tabContainerRef, dependencies: [activeEl] });

  return (
    <div ref={tabContainerRef} className="flex items-center gap-1 border-b border-[var(--hairline)] px-6 relative">
      {/* Sliding underline indicator */}
      <div
        ref={indicatorRef}
        className="absolute bottom-0 h-[2px] bg-[var(--primary)] rounded-full"
        style={{ left: 0, width: 0 }}
      />
      {AGENT_REGISTRY.map(agent => (
        <button
          key={agent.id}
          ref={(el) => { if (activeChannel === agent.id && el) setActiveEl(el); }}
          onClick={() => onChannelChange(agent.id)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeChannel === agent.id
              ? "border-transparent text-[var(--primary)]"
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
