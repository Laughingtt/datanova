import { useState, useEffect } from "react";
import { schemaBrowseApi } from "../../api/client";

export interface FilterCondition {
  column: string;
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "IN" | "LIKE" | "IS NULL";
  value: string;
}

interface VisualFilterBuilderProps {
  datasourceId: string;
  filters: string;
  onChange: (filtersJson: string) => void;
}

const OPERATORS: { value: FilterCondition["operator"]; label: string }[] = [
  { value: "=", label: "=" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
  { value: "IN", label: "IN" },
  { value: "LIKE", label: "LIKE" },
  { value: "IS NULL", label: "IS NULL" },
];

export default function VisualFilterBuilder({
  datasourceId,
  filters,
  onChange,
}: VisualFilterBuilderProps) {
  const [conditions, setConditions] = useState<FilterCondition[]>(() => {
    try { return JSON.parse(filters); } catch { return []; }
  });
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!datasourceId) return;
    schemaBrowseApi.tables(datasourceId)
      .then(res => {
        const cols = res.tables.flatMap(t =>
          t.columns.map(c => `${t.name}.${c.name}`)
        );
        setColumns(cols);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [datasourceId]);

  const emit = (updated: FilterCondition[]) => {
    setConditions(updated);
    onChange(JSON.stringify(updated.filter(c => c.column)));
  };

  const addCondition = () => {
    emit([...conditions, { column: "", operator: "=", value: "" }]);
  };

  const removeCondition = (index: number) => {
    emit(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: keyof FilterCondition, val: string) => {
    const updated = conditions.map((c, i) =>
      i === index ? { ...c, [field]: val } : c
    );
    emit(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="label-mono mb-0">Filters</label>
        <button type="button" onClick={addCondition} className="btn-ghost text-xs">
          + Add Filter
        </button>
      </div>

      <div className="p-3 rounded-md border border-[var(--hairline-strong)] bg-[var(--canvas)] min-h-[44px]">
        {conditions.length === 0 ? (
          <p className="text-xs text-[var(--stone)]">No filters. Click "+ Add Filter" to add one.</p>
        ) : (
          <div className="space-y-2">
            {conditions.map((cond, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  className="input-field py-1.5 text-xs font-mono flex-1 min-w-0"
                  value={cond.column}
                  onChange={(e) => updateCondition(index, "column", e.target.value)}
                >
                  <option value="">Select column...</option>
                  {columns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>

                <select
                  className="input-field py-1.5 text-xs w-24"
                  value={cond.operator}
                  onChange={(e) => updateCondition(index, "operator", e.target.value)}
                >
                  {OPERATORS.map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>

                {cond.operator !== "IS NULL" && (
                  <input
                    type="text"
                    className="input-field py-1.5 text-xs font-mono flex-1 min-w-0"
                    value={cond.value}
                    onChange={(e) => updateCondition(index, "value", e.target.value)}
                    placeholder="value"
                  />
                )}

                <button
                  type="button"
                  onClick={() => removeCondition(index)}
                  className="text-[var(--error)] hover:opacity-80 text-xs px-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
