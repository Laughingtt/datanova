import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

// 统一空状态组件（New API Empty 样式）：虚线圆角容器 + 中性图标块
export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--background)] p-6">
      <div className="w-full max-w-md rounded-xl border border-dashed border-[var(--border)] p-8 text-center animate-in">
        {icon && (
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--foreground)]">
            {icon}
          </div>
        )}
        <h2 className="text-sm font-medium tracking-tight text-[var(--foreground)]">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
        {action && <div className="pt-4">{action}</div>}
      </div>
    </div>
  );
}
