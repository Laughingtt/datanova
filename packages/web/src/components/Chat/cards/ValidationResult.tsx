interface ValidationResultProps {
  valid: boolean;
  errors?: Array<{ step: string; message: string; suggestion?: string }>;
  warnings?: string[];
  test_row_count?: number;
}

export default function ValidationResult({ valid, errors, warnings, test_row_count }: ValidationResultProps) {
  return (
    <div className={`rounded-xl border p-4 my-2 text-xs text-[var(--foreground)] ${
      valid
        ? "bg-[var(--success-soft)] border-[var(--success)]"
        : "bg-[var(--error-soft)] border-[var(--error)]"
    }`}>
      <div className="flex items-center gap-2 font-medium mb-1">
        <span className={valid ? "text-[var(--success)]" : "text-[var(--error)]"}>
          {valid ? "✅ 验证通过" : "❌ 验证失败"}
        </span>
        {test_row_count !== undefined && <span className="text-[var(--muted-foreground)]">({test_row_count}行)</span>}
      </div>
      {errors && errors.length > 0 && (
        <ul className="space-y-1">
          {errors.map((e, i) => (
            <li key={i}>
              <span className="font-medium">[{e.step}]</span> {e.message}
              {e.suggestion && <span className="text-[var(--muted-foreground)]"> — {e.suggestion}</span>}
            </li>
          ))}
        </ul>
      )}
      {warnings && warnings.length > 0 && (
        <div className="mt-1 text-[var(--warning)]">
          {warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
        </div>
      )}
    </div>
  );
}
