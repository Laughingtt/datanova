interface MetricCardProps {
  name: string;
  display_name: string;
  sql: string;
  metric_type: string;
  status: string;
  validation_status?: string;
  business_context?: string;
  test_row_count?: number;
  onViewDetails?: () => void;
}

export default function MetricCard({
  name, display_name, sql, metric_type, status, validation_status, business_context, test_row_count, onViewDetails,
}: MetricCardProps) {
  const typeLabel = metric_type === "atomic" ? "原子" : metric_type === "derived" ? "衍生" : "复合";
  const typeCls = metric_type === "atomic" ? "bg-blue-100 text-blue-700" : metric_type === "derived" ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700";

  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 my-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--ink)]">{display_name}</span>
          <span className="text-xs font-mono text-[var(--steel)]">({name})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeCls}`}>{typeLabel}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">草稿</span>
          {validation_status === "passed" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">✓ 验证通过</span>
          )}
        </div>
      </div>
      <pre className="text-xs font-mono text-[var(--ink)] bg-[var(--canvas)] rounded px-3 py-2 overflow-x-auto mb-2">
        {sql.length > 120 ? sql.substring(0, 120) + "..." : sql}
      </pre>
      {business_context && (
        <p className="text-xs text-[var(--steel)] mb-2">{business_context}</p>
      )}
      <div className="flex items-center gap-3 text-xs text-[var(--steel)]">
        {test_row_count !== undefined && <span>测试: {test_row_count}行数据</span>}
      </div>
      {onViewDetails && (
        <button
          onClick={onViewDetails}
          className="mt-2 text-xs text-[var(--primary)] hover:underline"
        >
          在指标管理中查看
        </button>
      )}
    </div>
  );
}
