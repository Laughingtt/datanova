import { useState } from "react";

interface EntryDetailProps {
  entry: any;
  entryType: "metric" | "dimension" | "table" | "column";
  onNavigate?: (type: string, name: string) => void;
}

export default function EntryDetail({ entry, entryType, onNavigate }: EntryDetailProps) {
  if (!entry) {
    return (
      <div className="card-base text-center py-16">
        <p className="text-sm text-[var(--muted-foreground)]">选择条目查看详情</p>
      </div>
    );
  }

  const renderMetric = () => (
    <div className="space-y-4">
      <div>
        <label className="label-mono">标识名</label>
        <p className="text-sm font-medium text-[var(--foreground)] mt-0.5">{entry.name}</p>
      </div>
      {entry.display_name && (
        <div>
          <label className="label-mono">显示名称</label>
          <p className="text-sm text-[var(--foreground)] mt-0.5">{entry.display_name}</p>
        </div>
      )}
      {entry.description && (
        <div>
          <label className="label-mono">描述</label>
          <p className="text-sm text-[var(--foreground)] mt-0.5">{entry.description}</p>
        </div>
      )}
      {entry.sql && (
        <div>
          <label className="label-mono">SQL</label>
          <pre className="text-xs font-mono text-[var(--foreground)] bg-[var(--muted)] rounded-md p-3 mt-0.5 overflow-x-auto">
            {entry.sql}
          </pre>
        </div>
      )}
      {entry.sql_expression && !entry.sql && (
        <div>
          <label className="label-mono">SQL 表达式</label>
          <pre className="text-xs font-mono text-[var(--foreground)] bg-[var(--muted)] rounded-md p-3 mt-0.5 overflow-x-auto">
            {entry.sql_expression}
          </pre>
        </div>
      )}
      {entry.unit && (
        <div>
          <label className="label-mono">单位</label>
          <p className="text-sm text-[var(--foreground)] mt-0.5">{entry.unit}</p>
        </div>
      )}
      {entry.category && (
        <div>
          <label className="label-mono">分类</label>
          <p className="text-sm text-[var(--foreground)] mt-0.5">{entry.category}</p>
        </div>
      )}
      {entry.status && (
        <div>
          <label className="label-mono">状态</label>
          <span className={`badge-soft ${
            entry.status === "published" ? "bg-[var(--success-soft)] text-[var(--success)]"
              : entry.status === "deprecated" ? "bg-[var(--error-soft)] text-[var(--error)]"
              : "bg-[var(--warning-soft)] text-[var(--warning)]"
          }`}>
            {entry.status}
          </span>
        </div>
      )}
    </div>
  );

  const renderDimension = () => (
    <div className="space-y-4">
      <div>
        <label className="label-mono">标识名</label>
        <p className="text-sm font-medium text-[var(--foreground)] mt-0.5">{entry.name}</p>
      </div>
      {entry.display_name && (
        <div>
          <label className="label-mono">显示名称</label>
          <p className="text-sm text-[var(--foreground)] mt-0.5">{entry.display_name}</p>
        </div>
      )}
      {entry.data_type && (
        <div>
          <label className="label-mono">数据类型</label>
          <span className="inline-block text-xs font-mono px-2 py-0.5 rounded-md bg-[var(--muted)] text-[var(--foreground)] mt-0.5">
            {entry.data_type}
          </span>
        </div>
      )}
      {entry.sql && (
        <div>
          <label className="label-mono">SQL</label>
          <pre className="text-xs font-mono text-[var(--foreground)] bg-[var(--muted)] rounded-md p-3 mt-0.5 overflow-x-auto">
            {entry.sql}
          </pre>
        </div>
      )}
      {entry.sql_expression && !entry.sql && (
        <div>
          <label className="label-mono">SQL 表达式</label>
          <pre className="text-xs font-mono text-[var(--foreground)] bg-[var(--muted)] rounded-md p-3 mt-0.5 overflow-x-auto">
            {entry.sql_expression}
          </pre>
        </div>
      )}
      {entry.hierarchy && (
        <div>
          <label className="label-mono">层级</label>
          <p className="text-sm text-[var(--foreground)] mt-0.5">{entry.hierarchy}</p>
        </div>
      )}
    </div>
  );

  const renderTable = () => (
    <div className="space-y-4">
      <div>
        <label className="label-mono">表名</label>
        <p className="text-sm font-medium font-mono text-[var(--foreground)] mt-0.5">{entry.name || entry.table_name}</p>
      </div>
      {entry.comment && (
        <div>
          <label className="label-mono">注释</label>
          <p className="text-sm text-[var(--foreground)] mt-0.5">{entry.comment}</p>
        </div>
      )}
      {entry.annotations && entry.annotations.length > 0 && (
        <div>
          <label className="label-mono">标注</label>
          <div className="space-y-1.5 mt-0.5">
            {entry.annotations.map((ann: any, i: number) => (
              <div key={i} className="text-xs bg-[var(--muted)] rounded-md p-2">
                <span className="font-medium text-[var(--foreground)]">{ann.field_name || "?"}</span>
                <span className="text-[var(--muted-foreground)]">: {ann.annotation}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {entry.relatedMetrics && entry.relatedMetrics.length > 0 && (
        <div>
          <label className="label-mono">相关指标</label>
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {entry.relatedMetrics.map((m: any, i: number) => (
              <button
                key={i}
                onClick={() => onNavigate?.("metric", m.name)}
                className="text-xs px-2 py-0.5 rounded-md border border-[var(--border)] text-[var(--primary-text)] hover:bg-[var(--primary-soft)]"
              >
                {m.display_name || m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderColumn = () => (
    <div className="space-y-4">
      <div>
        <label className="label-mono">字段名</label>
        <p className="text-sm font-medium font-mono text-[var(--foreground)] mt-0.5">{entry.name || entry.column_name}</p>
      </div>
      {entry.table_name && (
        <div>
          <label className="label-mono">表</label>
          <button
            onClick={() => onNavigate?.("table", entry.table_name)}
            className="text-sm text-[var(--primary-text)] hover:underline mt-0.5"
          >
            {entry.table_name}
          </button>
        </div>
      )}
      {entry.type && (
        <div>
          <label className="label-mono">类型</label>
          <span className="inline-block text-xs font-mono px-2 py-0.5 rounded-md bg-[var(--muted)] text-[var(--foreground)] mt-0.5">
            {entry.type}
          </span>
        </div>
      )}
      {entry.comment && (
        <div>
          <label className="label-mono">注释</label>
          <p className="text-sm text-[var(--foreground)] mt-0.5">{entry.comment}</p>
        </div>
      )}
      {entry.isPrimaryKey && (
        <div>
          <label className="label-mono">主键</label>
          <span className="badge-soft bg-[var(--warning-soft)] text-[var(--warning)] mt-0.5">
            PK
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="card-base">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
          {entryType}
        </span>
      </div>
      {entryType === "metric" && renderMetric()}
      {entryType === "dimension" && renderDimension()}
      {entryType === "table" && renderTable()}
      {entryType === "column" && renderColumn()}
    </div>
  );
}
