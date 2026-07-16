interface DimensionCardProps {
  name: string;
  display_name: string;
  sql_expression: string;
  data_type: string;
  grain?: string | null;
}

export default function DimensionCard({ name, display_name, sql_expression, data_type, grain }: DimensionCardProps) {
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-3 my-1.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-[var(--ink)]">{display_name}</span>
        <span className="text-xs font-mono text-[var(--steel)]">({name})</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--canvas)] text-[var(--steel)] border border-[var(--hairline)]">{data_type}</span>
        {grain && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">粒度:{grain}</span>}
      </div>
      <p className="text-xs font-mono text-[var(--ink)]">{sql_expression}</p>
    </div>
  );
}
