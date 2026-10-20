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
      <div className="my-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xs)] opacity-60">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-sm">❌</span>
          <span className="text-[var(--muted-foreground)]">已取消</span>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="my-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xs)]">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-sm">✅</span>
          <span className="text-[var(--primary-text)]">已确认，正在执行保存...</span>
        </div>
        {confirmAction.items && confirmAction.items.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {confirmAction.items.map((item, i) => (
              <div key={i} className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5">
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
    <div className="my-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xs)]">
      {/* Title */}
      <div className="flex items-center gap-2 mb-2 text-sm font-medium">
        <span className="size-8 rounded-lg bg-[var(--muted)] flex items-center justify-center text-sm">📋</span>
        <span className="text-[var(--foreground)]">{confirmAction.title}</span>
      </div>

      {/* Description */}
      {confirmAction.description && (
        <p className="text-xs text-[var(--muted-foreground)] mb-2">{confirmAction.description}</p>
      )}

      {/* Items list */}
      {confirmAction.items && confirmAction.items.length > 0 && (
        <div className="mb-3 space-y-1">
          {confirmAction.items.map((item, i) => (
            <div key={i} className="text-xs text-[var(--foreground)] flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--muted)]">
              <span className="text-[var(--primary-text)] font-medium">{i + 1}.</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={handleCancel}
          className="btn-secondary text-xs"
        >
          取消
        </button>
        <button
          onClick={handleConfirm}
          className="btn-primary text-xs"
        >
          确认保存
        </button>
      </div>
    </div>
  );
}
