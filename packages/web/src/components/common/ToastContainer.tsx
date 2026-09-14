import type { ReactNode } from "react";
import { useRef } from "react";
import { useToastStore, type ToastType } from "../../stores/toast";
import { useToastStagger } from "../../hooks/useGsapAnimations";

const ICON: Record<ToastType, ReactNode> = {
  success: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const ACCENT: Record<ToastType, { bar: string; icon: string; title: string }> = {
  success: { bar: "bg-[var(--success)]", icon: "text-[var(--success)]", title: "text-[var(--ink)]" },
  error:   { bar: "bg-[var(--error)]",   icon: "text-[var(--error)]",   title: "text-[var(--ink)]" },
  warning: { bar: "bg-[var(--warning)]", icon: "text-[var(--warning)]", title: "text-[var(--ink)]" },
  info:    { bar: "bg-[var(--info)]",    icon: "text-[var(--info)]",    title: "text-[var(--ink)]" },
};

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore();
  const containerRef = useRef<HTMLDivElement>(null);
  useToastStagger(containerRef, ".toast-enter", toasts.length);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="通知"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => {
        const a = ACCENT[t.type];
        return (
          <div
            key={t.id}
            role="status"
            className="toast-enter pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-[420px] pl-3 pr-4 py-3 rounded-lg bg-[var(--surface)] border border-[var(--hairline)] shadow-[0_12px_24px_-4px_rgba(15,23,42,0.18)]"
          >
            <span className={`mt-0.5 w-1 self-stretch rounded-full ${a.bar}`} aria-hidden="true" />
            <span className={`mt-0.5 ${a.icon}`} aria-hidden="true">{ICON[t.type]}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${a.title}`}>{t.title}</p>
              {t.description && <p className="text-xs text-[var(--steel)] mt-0.5 break-words">{t.description}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="关闭通知"
              className="text-[var(--stone)] hover:text-[var(--ink)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
