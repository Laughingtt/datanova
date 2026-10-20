interface DimensionCardProps {
  name: string;
  display_name: string;
  sql_expression: string;
  data_type: string;
  grain?: string | null;
}

export default function DimensionCard({ name, display_name, sql_expression, data_type, grain }: DimensionCardProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xs)] p-4 my-1.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-[var(--foreground)]">{display_name}</span>
        <span className="text-xs font-mono text-[var(--muted-foreground)]">({name})</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]">{data_type}</span>
        {grain && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--accent)] text-[var(--primary-text)]">粒度:{grain}</span>}
      </div>
      <p className="text-xs font-mono text-[var(--foreground)]">{sql_expression}</p>
    </div>
  );
}
