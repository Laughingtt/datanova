import { useState } from "react";
import type { SemanticDimension } from "../../api/client";
import { semanticApi } from "../../api/client";

interface DimensionFormProps {
  datasourceId: string;
  dimension?: SemanticDimension | null;
  onSave: () => void;
  onDelete: () => void;
}

export default function DimensionForm({
  datasourceId,
  dimension,
  onSave,
  onDelete,
}: DimensionFormProps) {
  const isEdit = !!dimension;

  const [name, setName] = useState(dimension?.name ?? "");
  const [displayName, setDisplayName] = useState(dimension?.display_name ?? "");
  const [sqlExpression, setSqlExpression] = useState(dimension?.sql_expression ?? "");
  const [dataType, setDataType] = useState<"string" | "number" | "date">(
    dimension?.data_type ?? "string"
  );
  const [hierarchy, setHierarchy] = useState(dimension?.hierarchy ?? "");
  const [values, setValues] = useState(dimension?.values ?? "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        name,
        display_name: displayName,
        sql_expression: sqlExpression,
        data_type: dataType,
        hierarchy: hierarchy || null,
        values: values || null,
      };

      if (isEdit && dimension) {
        await semanticApi.updateDimension(datasourceId, dimension.id, payload);
      } else {
        await semanticApi.createDimension(datasourceId, payload);
      }
      onSave();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!dimension) return;
    if (!confirm("确定要删除此维度吗？")) return;
    setDeleting(true);
    try {
      await semanticApi.deleteDimension(datasourceId, dimension.id);
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
        {isEdit ? "Edit Dimension" : "Add Dimension"}
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
              placeholder="region"
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
              placeholder="Region"
            />
          </div>
        </div>

        {/* SQL Expression */}
        <div>
          <label className="label-mono">SQL Expression</label>
          <textarea
            className="input-field min-h-[80px] resize-y font-mono text-xs"
            value={sqlExpression}
            onChange={(e) => setSqlExpression(e.target.value)}
            required
            placeholder="orders.region_code"
          />
        </div>

        {/* Data Type */}
        <div>
          <label className="label-mono">Data Type</label>
          <div className="flex gap-3">
            {(["string", "number", "date"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDataType(t)}
                className={`px-4 py-2 rounded-md text-sm border transition-colors ${
                  dataType === t
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-text)]"
                    : "border-[var(--hairline)] text-[var(--steel)]"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Hierarchy (JSON) */}
        <div>
          <label className="label-mono">Hierarchy (JSON)</label>
          <textarea
            className="input-field min-h-[60px] resize-y font-mono text-xs"
            value={hierarchy}
            onChange={(e) => setHierarchy(e.target.value)}
            placeholder='{"levels": ["country", "province", "city"]}'
          />
        </div>

        {/* Values (comma-separated) */}
        <div>
          <label className="label-mono">Values (comma-separated)</label>
          <input
            className="input-field"
            value={values}
            onChange={(e) => setValues(e.target.value)}
            placeholder="north, south, east, west"
          />
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
