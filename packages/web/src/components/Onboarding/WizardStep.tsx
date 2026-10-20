import type { ReactNode } from "react";

interface WizardStepProps {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  isActive: boolean;
  isCompleted: boolean;
  children: ReactNode;
  onNext?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}

export default function WizardStep({
  step, totalSteps, title, description,
  isActive, isCompleted, children,
  onNext, onSkip, nextLabel = "Next →", nextDisabled = false,
}: WizardStepProps) {
  if (!isActive) return null;

  return (
    <div className="card-base max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full ${
              i + 1 <= step ? "bg-[var(--primary)]" : "bg-[var(--muted)]"
            }`}
          />
        ))}
        <span className="text-xs text-[var(--muted-foreground)] ml-2">{step}/{totalSteps}</span>
      </div>

      <div className="mb-6">
        {isCompleted && <span className="text-[var(--success)] text-sm mr-2">✓</span>}
        <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">{description}</p>
      </div>

      <div className="mb-6">{children}</div>

      {!isCompleted && (
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
          {onSkip ? (
            <button onClick={onSkip} className="btn-ghost text-xs">跳过</button>
          ) : (
            <div />
          )}
          <button
            onClick={onNext}
            disabled={nextDisabled}
            className="btn-primary disabled:opacity-40"
          >
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}
