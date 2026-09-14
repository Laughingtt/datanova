import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 初始焦点选择器；默认聚焦首个可聚焦元素 */
  initialFocusSelector?: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** 是否在按 Esc 时关闭，默认 true */
  closeOnEsc?: boolean;
  /** 是否点击遮罩关闭，默认 true */
  closeOnBackdrop?: boolean;
}

const SIZE_CLASS: Record<NonNullable<DialogProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "textarea", "input", "select",
  "[tabindex]:not([tabindex=\"-1\"])",
];

/**
 * 无障碍对话框：
 * - role="dialog" aria-modal="true" aria-labelledby/describedby
 * - Esc 关闭、焦点陷阱、初始焦点、关闭后归还焦点到触发元素
 * - 锁定背景滚动
 */
export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocusSelector,
  size = "md",
  closeOnEsc = true,
  closeOnBackdrop = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // 打开时锁定滚动 + 记录触发元素 + 设置初始焦点
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = initialFocusSelector
        ? panel.querySelector<HTMLElement>(initialFocusSelector)
        : panel.querySelector<HTMLElement>(FOCUSABLE.join(","));
      (target ?? panel).focus();
    }, 0);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      // 归还焦点
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [open, initialFocusSelector]);

  // Esc 关闭 + 焦点陷阱
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE.join(","))
        ).filter((el) => !el.hasAttribute("disabled"));
        if (focusables.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, closeOnEsc, onClose]);

  if (!open) return null;

  const titleId = title ? "dlg-title" : undefined;
  const descId = description ? "dlg-desc" : undefined;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-[var(--ink)]/40 backdrop-blur-[1px] dialog-backdrop-enter"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className={`relative w-full ${SIZE_CLASS[size]} max-h-[90vh] flex flex-col rounded-xl bg-[var(--surface)] border border-[var(--hairline)] shadow-[0_24px_48px_-8px_rgba(15,23,42,0.24)] outline-none dialog-panel-enter`}
      >
        {(title || description) && (
          <div className="px-6 pt-5 pb-4 border-b border-[var(--hairline-soft)]">
            {title && (
              <h2 id={titleId} className="text-base font-semibold text-[var(--ink)] font-display">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="text-sm text-[var(--steel)] mt-1">{description}</p>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-[var(--hairline-soft)] flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
