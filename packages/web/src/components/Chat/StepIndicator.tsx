import { useRef } from "react";
import type { AgentStep } from "../../hooks/useAgentStream";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { EASE, DUR, prefersReducedMotion } from "../../utils/gsap-presets";

gsap.registerPlugin(useGSAP);

interface StepIndicatorProps {
  step: AgentStep;
}

function ThinkingDot() {
  const dotRef = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    if (!dotRef.current || prefersReducedMotion()) return;
    gsap.to(dotRef.current, {
      scale: 1.4,
      autoAlpha: 0.4,
      duration: 0.8,
      repeat: -1,
      yoyo: true,
      ease: EASE.smooth,
    });
  }, { scope: dotRef });

  return <span ref={dotRef} className="inline-block text-[var(--primary)]">●</span>;
}

export default function StepIndicator({ step }: StepIndicatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!containerRef.current || prefersReducedMotion()) return;
    gsap.from(containerRef.current, {
      autoAlpha: 0,
      x: -8,
      duration: DUR.fast,
      ease: EASE.entrance,
      clearProps: "autoAlpha,x",
    });
  }, { scope: containerRef });

  switch (step.type) {
    case "thinking":
      return (
        <div ref={containerRef} className="flex items-center gap-2 py-1">
          <ThinkingDot />
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
        <div ref={containerRef} className="flex items-center gap-2 py-1">
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
        <div ref={containerRef} className="flex items-center gap-2 py-1">
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
