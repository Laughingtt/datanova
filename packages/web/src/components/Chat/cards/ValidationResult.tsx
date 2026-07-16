interface ValidationResultProps {
  valid: boolean;
  errors?: Array<{ step: string; message: string; suggestion?: string }>;
  warnings?: string[];
  test_row_count?: number;
}

export default function ValidationResult({ valid, errors, warnings, test_row_count }: ValidationResultProps) {
  return (
    <div className={`rounded-lg p-3 my-1.5 text-xs ${
      valid ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
    }`}>
      <div className="flex items-center gap-2 font-medium mb-1">
        <span>{valid ? "✅ 验证通过" : "❌ 验证失败"}</span>
        {test_row_count !== undefined && <span className="text-[var(--steel)]">({test_row_count}行)</span>}
      </div>
      {errors && errors.length > 0 && (
        <ul className="space-y-1">
          {errors.map((e, i) => (
            <li key={i}>
              <span className="font-medium">[{e.step}]</span> {e.message}
              {e.suggestion && <span className="text-[var(--steel)]"> — {e.suggestion}</span>}
            </li>
          ))}
        </ul>
      )}
      {warnings && warnings.length > 0 && (
        <div className="mt-1 text-amber-600">
          {warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
        </div>
      )}
    </div>
  );
}
