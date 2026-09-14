import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

// 统一空状态组件：用于无数据、未选择数据源、首次进入等场景
// 视觉锚点：primary-soft 圆角容器 + SVG 图标，与 AgentWelcome / StatCard 风格一致
export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[var(--canvas)]">
      <div className="text-center space-y-4 max-w-md px-8">
        {icon && (
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--primary-soft)] border border-[var(--hairline)] flex items-center justify-center">
            {icon}
          </div>
        )}
        <h2 className="text-heading-4 font-display text-[var(--ink)]">{title}</h2>
        {description && <p className="text-body-sm text-[var(--slate)]">{description}</p>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}
