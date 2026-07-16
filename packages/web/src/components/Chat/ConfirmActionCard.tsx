import { useState } from "react";
import type { ConfirmAction } from "../../hooks/useAgentStream";

interface ConfirmActionCardProps {
  confirmAction: ConfirmAction;
  onConfirm: (action: ConfirmAction) => void;
  onCancel: (action: ConfirmAction) => void;
}

export default function ConfirmActionCard({ confirmAction, onConfirm, onCancel }: ConfirmActionCardProps) {
  const [confirmed, setConfirmed] = useState(confirmAction.confirmed ?? false);
  const [cancelled, setCancelled] = useState(confirmAction.cancelled ?? false);

  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm(confirmAction);
  };

  const handleCancel = () => {
    setCancelled(true);
    onCancel(confirmAction);
  };

  if (cancelled) {
    return (
      <div className="my-3 px-4 py-3 rounded-lg bg-[var(--surface)] border border-[var(--hairline)] opacity-60">
        <div className="flex items-center gap-2">
          <span className="text-sm">❌</span>
          <span className="text-sm font-medium text-[var(--steel)]">已取消</span>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="my-3 px-4 py-3 rounded-lg bg-[var(--surface)] border border-[var(--primary)]/30">
        <div className="flex items-center gap-2">
          <span className="text-sm">✅</span>
          <span className="text-sm font-medium text-[var(--primary)]">已确认，正在执行保存...</span>
        </div>
        {confirmAction.items && confirmAction.items.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {confirmAction.items.map((item, i) => (
              <div key={i} className="text-xs text-[var(--steel)] flex items-center gap-1.5">
                <span className="text-[var(--success)]">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="my-3 px-4 py-3 rounded-lg bg-[var(--surface)] border border-[var(--hairline)] shadow-sm">
      {/* Title */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">📋</span>
        <span className="text-sm font-medium text-[var(--ink)]">{confirmAction.title}</span>
      </div>

      {/* Description */}
      {confirmAction.description && (
        <p className="text-xs text-[var(--steel)] mb-2">{confirmAction.description}</p>
      )}

      {/* Items list */}
      {confirmAction.items && confirmAction.items.length > 0 && (
        <div className="mb-3 space-y-1">
          {confirmAction.items.map((item, i) => (
            <div key={i} className="text-xs text-[var(--ink)] flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--canvas)]">
              <span className="text-[var(--primary)] font-medium">{i + 1}.</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={handleCancel}
          className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors bg-[var(--canvas)] text-[var(--steel)] border border-[var(--hairline)] hover:border-[var(--error)]/40 hover:text-[var(--error)]"
        >
          取消
        </button>
        <button
          onClick={handleConfirm}
          className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors bg-[var(--primary)] text-white hover:opacity-90"
        >
          确认保存
        </button>
      </div>
    </div>
  );
}
