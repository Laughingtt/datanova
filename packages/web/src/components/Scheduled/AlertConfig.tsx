import { useState } from "react";

interface AlertCondition {
  metric_column: string;
  condition: "above" | "below";
  threshold: string;
}

interface AlertConfigProps {
  conditions: AlertCondition[];
  onChange: (conditions: AlertCondition[]) => void;
}

export default function AlertConfig({ conditions, onChange }: AlertConfigProps) {
  const addCondition = () => {
    onChange([...conditions, { metric_column: "", condition: "above", threshold: "" }]);
  };

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: keyof AlertCondition, value: string) => {
    const updated = conditions.map((c, i) =>
      i === index ? { ...c, [field]: value } : c
    );
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--ink)]">Alert Conditions</label>
        <button
          type="button"
          onClick={addCondition}
          className="btn-ghost text-xs"
        >
          + Add Condition
        </button>
      </div>

      {conditions.length === 0 && (
        <p className="text-xs text-[var(--steel)]">No alert conditions configured</p>
      )}

      {conditions.map((cond, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            value={cond.metric_column}
            onChange={(e) => updateCondition(index, "metric_column", e.target.value)}
            placeholder="Column name"
            className="flex-1 px-3 py-1.5 text-sm bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] placeholder-[var(--steel)] focus:outline-none focus:border-[var(--primary)]"
          />
          <select
            value={cond.condition}
            onChange={(e) => updateCondition(index, "condition", e.target.value)}
            className="px-3 py-1.5 text-sm bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] focus:outline-none focus:border-[var(--primary)]"
          >
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
          <input
            type="text"
            value={cond.threshold}
            onChange={(e) => updateCondition(index, "threshold", e.target.value)}
            placeholder="Threshold"
            className="w-24 px-3 py-1.5 text-sm bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] placeholder-[var(--steel)] focus:outline-none focus:border-[var(--primary)]"
          />
          <button
            type="button"
            onClick={() => removeCondition(index)}
            className="text-[var(--error)] hover:opacity-80 text-xs px-2 py-1"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
