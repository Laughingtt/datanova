import { useState } from "react";
import type { SemanticMetric, SemanticDimension } from "../../api/client";
import { semanticApi } from "../../api/client";
import TableColumnPicker from "./TableColumnPicker";
import VisualFilterBuilder from "./VisualFilterBuilder";

interface MetricFormProps {
  datasourceId: string;
  metric?: SemanticMetric | null;
  dimensions: SemanticDimension[];
  onSave: () => void;
  onDelete: () => void;
}

export default function MetricForm({
  datasourceId,
  metric,
  dimensions,
  onSave,
  onDelete,
}: MetricFormProps) {
  const isEdit = !!metric;

  const [name, setName] = useState(metric?.name ?? "");
  const [displayName, setDisplayName] = useState(metric?.display_name ?? "");
  const [description, setDescription] = useState(metric?.description ?? "");
  const [sqlExpression, setSqlExpression] = useState(metric?.sql_expression ?? "");
  const [filters, setFilters] = useState(metric?.filters ?? "");
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>(() => {
    if (!metric?.dimensions) return [];
    try {
      return JSON.parse(metric.dimensions);
    } catch {
      return metric.dimensions.split(",").filter(Boolean);
    }
  });
  const [defaultGranularity, setDefaultGranularity] = useState(metric?.default_granularity ?? "");
  const [unit, setUnit] = useState(metric?.unit ?? "");
  const [category, setCategory] = useState(metric?.category ?? "");
  const [aliases, setAliases] = useState(metric?.aliases ?? "");
  const [status, setStatus] = useState<"draft" | "published" | "deprecated">(
    metric?.status ?? "draft"
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const toggleDimension = (dimName: string) => {
    setSelectedDimensions((prev) =>
      prev.includes(dimName)
        ? prev.filter((d) => d !== dimName)
        : [...prev, dimName]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        name,
        display_name: displayName,
        description,
        sql_expression: sqlExpression,
        filters,
        dimensions: JSON.stringify(selectedDimensions),
        default_granularity: defaultGranularity || null,
        unit: unit || null,
        category: category || null,
        aliases,
        status,
      };

      if (isEdit && metric) {
        await semanticApi.updateMetric(datasourceId, metric.id, payload);
      } else {
        await semanticApi.createMetric(datasourceId, payload);
      }
      onSave();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!metric) return;
    if (!confirm("确定要删除此指标吗？")) return;
    setDeleting(true);
    try {
      await semanticApi.deleteMetric(datasourceId, metric.id);
      onDelete();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async () => {
    if (!metric) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const result = await semanticApi.testMetric(datasourceId, metric.id);
      setTestResult(result);
    } catch (err) {
      setTestError((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="card-base">
      <h3 className="font-display text-heading-4 text-[var(--ink)] mb-5">
        {isEdit ? "Edit Metric" : "Add Metric"}
      </h3>

      {error && (
        <div className="p-3 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Row: name + display_name */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-mono">Name</label>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="revenue"
              disabled={isEdit}
            />
          </div>
          <div>
            <label className="label-mono">Display Name</label>
            <input
              className="input-field"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              placeholder="Revenue"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="label-mono">Description</label>
          <textarea
            className="input-field min-h-[80px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this metric measures..."
          />
        </div>

        {/* SQL Expression */}
        <div>
          <label className="label-mono">SQL Expression</label>
          <TableColumnPicker
            datasourceId={datasourceId}
            value={sqlExpression}
            onChange={setSqlExpression}
            mode="aggregate"
            placeholder="SUM(table.column)"
          />
        </div>

        {/* Filters */}
        <VisualFilterBuilder
          datasourceId={datasourceId}
          filters={filters}
          onChange={setFilters}
        />

        {/* Dimensions multi-select */}
        <div>
          <label className="label-mono">Dimensions</label>
          <div className="flex flex-wrap gap-2 p-3 rounded-md border border-[var(--hairline-strong)] bg-[var(--canvas)] min-h-[44px]">
            {dimensions.length === 0 ? (
              <span className="text-xs text-[var(--stone)]">No dimensions available</span>
            ) : (
              dimensions.map((d) => {
                const isSelected = selectedDimensions.includes(d.name);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDimension(d.name)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-[var(--primary)] text-[var(--on-dark)]"
                        : "bg-[var(--surface)] text-[var(--slate)] border border-[var(--hairline)]"
                    }`}
                  >
                    {d.display_name || d.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Row: granularity + unit + category */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label-mono">Default Granularity</label>
            <select
              className="input-field"
              value={defaultGranularity}
              onChange={(e) => setDefaultGranularity(e.target.value)}
            >
              <option value="">None</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
              <option value="year">Year</option>
            </select>
          </div>
          <div>
            <label className="label-mono">Unit</label>
            <input
              className="input-field"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="CNY, %, count"
            />
          </div>
          <div>
            <label className="label-mono">Category</label>
            <input
              className="input-field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Finance, Operations"
            />
          </div>
        </div>

        {/* Aliases */}
        <div>
          <label className="label-mono">Aliases (comma-separated)</label>
          <input
            className="input-field"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="revenue, total_revenue, 营收"
          />
        </div>

        {/* Status */}
        <div>
          <label className="label-mono">Status</label>
          <div className="flex gap-3">
            {(["draft", "published", "deprecated"] as const).map((s) => {
              const badge = {
                draft: { dot: "bg-[var(--warning)]", label: "Draft" },
                published: { dot: "bg-[var(--success)]", label: "Published" },
                deprecated: { dot: "bg-[var(--error)]", label: "Deprecated" },
              }[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border transition-colors ${
                    status === s
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                      : "border-[var(--hairline)] text-[var(--steel)]"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                  {badge.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="btn-dark" disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
          {isEdit && (
            <>
              <button
                type="button"
                className="btn-cream"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? "Testing..." : "Test"}
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </>
          )}
        </div>
      </form>

      {/* Test result preview */}
      {(testResult || testError) && (
        <div className="mt-5 border-t border-[var(--hairline)] pt-4">
          <h4 className="label-mono mb-2">Test Result</h4>
          {testError && (
            <div className="p-3 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-sm">
              {testError}
            </div>
          )}
          {testResult && (
            <div className="p-3 rounded-md bg-[var(--surface)] border border-[var(--hairline)]">
              {testResult.rows && (
                <p className="text-xs text-[var(--steel)] mb-2">
                  {testResult.rows.length} row(s) returned
                  {testResult.execution_time_ms && ` (${testResult.execution_time_ms}ms)`}
                </p>
              )}
              {testResult.rows && testResult.rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--hairline)]">
                        {Object.keys(testResult.rows[0]).map((col: string) => (
                          <th key={col} className="text-left py-1.5 px-2 font-mono text-[var(--steel)]">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {testResult.rows.slice(0, 5).map((row: Record<string, unknown>, i: number) => (
                        <tr key={i} className="border-b border-[var(--hairline-soft)]">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="py-1.5 px-2 text-[var(--ink)]">
                              {String(val ?? "NULL")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {testResult.rows.length > 5 && (
                    <p className="text-xs text-[var(--steel)] mt-1">
                      ... and {testResult.rows.length - 5} more rows
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
