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
        <div className="card-base-inner">
          <p className="text-sm text-[var(--steel)]">选择条目查看详情</p>
        </div>
      </div>
    );
  }

  const renderMetric = () => (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-[var(--steel)] uppercase tracking-wider">标识名</label>
        <p className="text-sm font-medium text-[var(--ink)] mt-0.5">{entry.name}</p>
      </div>
      {entry.display_name && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">显示名称</label>
          <p className="text-sm text-[var(--ink)] mt-0.5">{entry.display_name}</p>
        </div>
      )}
      {entry.description && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">描述</label>
          <p className="text-sm text-[var(--ink)] mt-0.5">{entry.description}</p>
        </div>
      )}
      {entry.sql && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">SQL</label>
          <pre className="text-xs font-mono text-[var(--ink)] bg-[var(--canvas)] rounded-md p-3 mt-0.5 overflow-x-auto">
            {entry.sql}
          </pre>
        </div>
      )}
      {entry.sql_expression && !entry.sql && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">SQL 表达式</label>
          <pre className="text-xs font-mono text-[var(--ink)] bg-[var(--canvas)] rounded-md p-3 mt-0.5 overflow-x-auto">
            {entry.sql_expression}
          </pre>
        </div>
      )}
      {entry.unit && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">单位</label>
          <p className="text-sm text-[var(--ink)] mt-0.5">{entry.unit}</p>
        </div>
      )}
      {entry.category && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">分类</label>
          <p className="text-sm text-[var(--ink)] mt-0.5">{entry.category}</p>
        </div>
      )}
      {entry.status && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">状态</label>
          <span className={`inline-block text-xs px-2 py-0.5 rounded-md mt-0.5 ${
            entry.status === "published" ? "bg-green-100 text-green-700"
              : entry.status === "deprecated" ? "bg-red-100 text-red-700"
              : "bg-yellow-100 text-yellow-700"
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
        <label className="text-xs text-[var(--steel)] uppercase tracking-wider">标识名</label>
        <p className="text-sm font-medium text-[var(--ink)] mt-0.5">{entry.name}</p>
      </div>
      {entry.display_name && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">显示名称</label>
          <p className="text-sm text-[var(--ink)] mt-0.5">{entry.display_name}</p>
        </div>
      )}
      {entry.data_type && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">数据类型</label>
          <span className="inline-block text-xs font-mono px-2 py-0.5 rounded-md bg-[var(--surface)] text-[var(--ink)] mt-0.5">
            {entry.data_type}
          </span>
        </div>
      )}
      {entry.sql && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">SQL</label>
          <pre className="text-xs font-mono text-[var(--ink)] bg-[var(--canvas)] rounded-md p-3 mt-0.5 overflow-x-auto">
            {entry.sql}
          </pre>
        </div>
      )}
      {entry.sql_expression && !entry.sql && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">SQL 表达式</label>
          <pre className="text-xs font-mono text-[var(--ink)] bg-[var(--canvas)] rounded-md p-3 mt-0.5 overflow-x-auto">
            {entry.sql_expression}
          </pre>
        </div>
      )}
      {entry.hierarchy && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">层级</label>
          <p className="text-sm text-[var(--ink)] mt-0.5">{entry.hierarchy}</p>
        </div>
      )}
    </div>
  );

  const renderTable = () => (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-[var(--steel)] uppercase tracking-wider">表名</label>
        <p className="text-sm font-medium font-mono text-[var(--ink)] mt-0.5">{entry.name || entry.table_name}</p>
      </div>
      {entry.comment && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">注释</label>
          <p className="text-sm text-[var(--ink)] mt-0.5">{entry.comment}</p>
        </div>
      )}
      {entry.annotations && entry.annotations.length > 0 && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">标注</label>
          <div className="space-y-1.5 mt-0.5">
            {entry.annotations.map((ann: any, i: number) => (
              <div key={i} className="text-xs bg-[var(--canvas)] rounded-md p-2">
                <span className="font-medium text-[var(--ink)]">{ann.field_name || "?"}</span>
                <span className="text-[var(--steel)]">: {ann.annotation}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {entry.relatedMetrics && entry.relatedMetrics.length > 0 && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">相关指标</label>
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {entry.relatedMetrics.map((m: any, i: number) => (
              <button
                key={i}
                onClick={() => onNavigate?.("metric", m.name)}
                className="text-xs px-2 py-0.5 rounded-md border border-[var(--hairline)] text-[var(--primary-text)] hover:bg-[var(--primary-soft,rgba(59,130,246,0.08))]"
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
        <label className="text-xs text-[var(--steel)] uppercase tracking-wider">字段名</label>
        <p className="text-sm font-medium font-mono text-[var(--ink)] mt-0.5">{entry.name || entry.column_name}</p>
      </div>
      {entry.table_name && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">表</label>
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
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">类型</label>
          <span className="inline-block text-xs font-mono px-2 py-0.5 rounded-md bg-[var(--surface)] text-[var(--ink)] mt-0.5">
            {entry.type}
          </span>
        </div>
      )}
      {entry.comment && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">注释</label>
          <p className="text-sm text-[var(--ink)] mt-0.5">{entry.comment}</p>
        </div>
      )}
      {entry.isPrimaryKey && (
        <div>
          <label className="text-xs text-[var(--steel)] uppercase tracking-wider">主键</label>
          <span className="inline-block text-xs px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-700 mt-0.5">
            PK
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="card-cream">
      <div className="card-cream-inner">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--surface)] text-[var(--steel)]">
          {entryType}
        </span>
      </div>
      {entryType === "metric" && renderMetric()}
      {entryType === "dimension" && renderDimension()}
      {entryType === "table" && renderTable()}
      {entryType === "column" && renderColumn()}
      </div>
    </div>
  );
}
