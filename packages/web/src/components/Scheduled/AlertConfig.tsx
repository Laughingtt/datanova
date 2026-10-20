import { useState } from "react";

interface AlertCondition {
  metric_column: string;
  condition: "above" | "below" | "change_above" | "change_below";
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
        <label className="label-mono">告警条件</label>
        <button
          type="button"
          onClick={addCondition}
          className="btn-ghost text-xs"
        >
          + 添加条件
        </button>
      </div>

      {conditions.length === 0 && (
        <p className="text-xs text-[var(--muted-foreground)]">暂未配置告警条件</p>
      )}

      {conditions.map((cond, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            value={cond.metric_column}
            onChange={(e) => updateCondition(index, "metric_column", e.target.value)}
            placeholder="列名"
            className="input-field flex-1"
          />
          <select
            value={cond.condition}
            onChange={(e) => updateCondition(index, "condition", e.target.value)}
            className="input-field w-auto shrink-0"
          >
            <option value="above">高于</option>
            <option value="below">低于</option>
            <option value="change_above">环比上升 %</option>
            <option value="change_below">环比下降 %</option>
          </select>
          <input
            type="text"
            value={cond.threshold}
            onChange={(e) => updateCondition(index, "threshold", e.target.value)}
            placeholder="阈值"
            className="input-field w-24"
          />
          <button
            type="button"
            onClick={() => removeCondition(index)}
            className="btn-danger text-xs"
          >
            移除
          </button>
        </div>
      ))}
    </div>
  );
}
