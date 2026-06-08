import { useState, useEffect } from "react";
import type { SemanticModel, SemanticMetric, SemanticDimension } from "../../api/client";
import { semanticApi, schemaBrowseApi } from "../../api/client";

interface JoinEntry {
  table: string;
  on: string;
  type: "INNER" | "LEFT" | "RIGHT";
}

interface ModelFormProps {
  datasourceId: string;
  model?: SemanticModel | null;
  metrics: SemanticMetric[];
  dimensions: SemanticDimension[];
  onSave: () => void;
  onDelete: () => void;
}

export default function ModelForm({
  datasourceId,
  model,
  metrics,
  dimensions,
  onSave,
  onDelete,
}: ModelFormProps) {
  const isEdit = !!model;

  const [name, setName] = useState(model?.name ?? "");
  const [description, setDescription] = useState(model?.description ?? "");
  const [baseTable, setBaseTable] = useState(model?.base_table ?? "");

  // Joins: dynamic list
  const [joins, setJoins] = useState<JoinEntry[]>(() => {
    if (!model?.joins) return [];
    try {
      return JSON.parse(model.joins);
    } catch {
      return [];
    }
  });

  // Selected metrics/dimensions
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(() => {
    if (!model?.metrics) return [];
    try {
      return JSON.parse(model.metrics);
    } catch {
      return model.metrics.split(",").filter(Boolean);
    }
  });

  const [selectedDimensions, setSelectedDimensions] = useState<string[]>(() => {
    if (!model?.dimensions) return [];
    try {
      return JSON.parse(model.dimensions);
    } catch {
      return model.dimensions.split(",").filter(Boolean);
    }
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [schemaTables, setSchemaTables] = useState<string[]>([]);
  const [schemaColumns, setSchemaColumns] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!datasourceId) return;
    schemaBrowseApi.tables(datasourceId).then(res => {
      setSchemaTables(res.tables.map(t => t.name));
      const colMap: Record<string, string[]> = {};
      res.tables.forEach(t => { colMap[t.name] = t.columns.map(c => c.name); });
      setSchemaColumns(colMap);
    }).catch(() => {});
  }, [datasourceId]);

  // Join management
  const addJoin = () => {
    setJoins([...joins, { table: "", on: "", type: "LEFT" }]);
  };

  const updateJoin = (index: number, field: keyof JoinEntry, value: string) => {
    const updated = [...joins];
    updated[index] = { ...updated[index], [field]: value };
    setJoins(updated);
  };

  const removeJoin = (index: number) => {
    setJoins(joins.filter((_, i) => i !== index));
  };

  // Toggle helpers
  const toggleMetric = (metricName: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metricName)
        ? prev.filter((m) => m !== metricName)
        : [...prev, metricName]
    );
  };

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
        description: description || null,
        base_table: baseTable,
        joins: JSON.stringify(joins.filter((j) => j.table && j.on)),
        metrics: JSON.stringify(selectedMetrics),
        dimensions: JSON.stringify(selectedDimensions),
      };

      if (isEdit && model) {
        await semanticApi.updateModel(datasourceId, model.id, payload);
      } else {
        await semanticApi.createModel(datasourceId, payload);
      }
      onSave();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!model) return;
    if (!confirm("确定要删除此模型吗？")) return;
    setDeleting(true);
    try {
      await semanticApi.deleteModel(datasourceId, model.id);
      onDelete();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="card-base">
      <h3 className="font-display text-heading-4 text-[var(--ink)] mb-5">
        {isEdit ? "Edit Model" : "Add Model"}
      </h3>

      {error && (
        <div className="p-3 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Row: name + base_table */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-mono">Name</label>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="order_model"
              disabled={isEdit}
            />
          </div>
          <div>
            <label className="label-mono">Base Table</label>
            {schemaTables.length > 0 ? (
              <select
                className="input-field font-mono text-xs"
                value={baseTable}
                onChange={(e) => setBaseTable(e.target.value)}
                required
              >
                <option value="">Select table...</option>
                {schemaTables.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            ) : (
              <input
                className="input-field font-mono text-xs"
                value={baseTable}
                onChange={(e) => setBaseTable(e.target.value)}
                required
                placeholder="orders"
              />
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="label-mono">Description</label>
          <textarea
            className="input-field min-h-[60px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe this semantic model..."
          />
        </div>

        {/* Joins */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label-mono mb-0">Joins</label>
            <button
              type="button"
              onClick={addJoin}
              className="btn-ghost text-xs"
            >
              + Add Join
            </button>
          </div>
          {joins.length === 0 ? (
            <div className="p-3 rounded-md border border-dashed border-[var(--hairline-strong)] text-xs text-[var(--stone)]">
              No joins defined. Click "+ Add Join" to add one.
            </div>
          ) : (
            <div className="space-y-2">
              {joins.map((join, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-md border border-[var(--hairline)] bg-[var(--surface)]"
                >
                  <select
                    className="input-field w-24 py-1.5 text-xs"
                    value={join.type}
                    onChange={(e) => updateJoin(i, "type", e.target.value)}
                  >
                    <option value="INNER">INNER</option>
                    <option value="LEFT">LEFT</option>
                    <option value="RIGHT">RIGHT</option>
                  </select>
                  {schemaTables.length > 0 ? (
                    <select
                      className="input-field flex-1 py-1.5 text-xs font-mono"
                      value={join.table}
                      onChange={(e) => updateJoin(i, "table", e.target.value)}
                    >
                      <option value="">table</option>
                      {schemaTables.filter(t => t !== baseTable).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input-field flex-1 py-1.5 text-xs font-mono"
                      value={join.table}
                      onChange={(e) => updateJoin(i, "table", e.target.value)}
                      placeholder="table_name"
                    />
                  )}
                  <span className="text-xs text-[var(--steel)]">ON</span>
                  <input
                    className="input-field flex-1 py-1.5 text-xs font-mono"
                    value={join.on}
                    onChange={(e) => updateJoin(i, "on", e.target.value)}
                    placeholder="a.id = b.a_id"
                  />
                  <button
                    type="button"
                    onClick={() => removeJoin(i)}
                    className="btn-danger text-xs px-2 py-1"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Metrics multi-select */}
        <div>
          <label className="label-mono">Metrics</label>
          <div className="flex flex-wrap gap-2 p-3 rounded-md border border-[var(--hairline-strong)] bg-[var(--canvas)] min-h-[44px]">
            {metrics.length === 0 ? (
              <span className="text-xs text-[var(--stone)]">No metrics available</span>
            ) : (
              metrics.map((m) => {
                const isSelected = selectedMetrics.includes(m.name);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMetric(m.name)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-[var(--primary)] text-[var(--on-dark)]"
                        : "bg-[var(--surface)] text-[var(--slate)] border border-[var(--hairline)]"
                    }`}
                  >
                    {m.display_name || m.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

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

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="btn-dark" disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
          {isEdit && (
            <button
              type="button"
              className="btn-danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
