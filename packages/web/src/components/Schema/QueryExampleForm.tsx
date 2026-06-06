import { useState } from "react";
import type { TableQueryExample } from "../../api/client";
import { queryExamplesApi } from "../../api/client";

interface QueryExampleFormProps {
  datasourceId: string;
  tableName: string;
  existing?: TableQueryExample;
  onSave: (example: TableQueryExample) => void;
  onCancel: () => void;
}

export default function QueryExampleForm({
  datasourceId,
  tableName,
  existing,
  onSave,
  onCancel,
}: QueryExampleFormProps) {
  const [question, setQuestion] = useState(existing?.question ?? "");
  const [sql, setSql] = useState(existing?.sql ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!existing;

  const handleSave = async () => {
    const trimmedQ = question.trim();
    const trimmedSql = sql.trim();
    if (!trimmedQ || !trimmedSql) return;

    setSaving(true);
    setError(null);
    try {
      let result: TableQueryExample;
      if (isEdit && existing) {
        result = await queryExamplesApi.update(datasourceId, existing.id, {
          question: trimmedQ,
          sql: trimmedSql,
          table_name: tableName,
        });
      } else {
        result = await queryExamplesApi.create(datasourceId, {
          table_name: tableName,
          question: trimmedQ,
          sql: trimmedSql,
        });
      }
      onSave(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="card-base space-y-4">
      <h4 className="text-sm font-medium text-[var(--ink)]">
        {isEdit ? "Edit Query Example" : "Add Query Example"}
        <span className="ml-2 text-xs font-mono text-[var(--steel)]">
          {tableName}
        </span>
      </h4>

      {error && (
        <div className="p-2 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-xs">
          {error}
        </div>
      )}

      <div>
        <label className="label-mono">Question</label>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. How many orders were placed last month?"
          className="input-field text-sm"
        />
      </div>

      <div>
        <label className="label-mono">SQL</label>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SELECT COUNT(*) FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)"
          rows={4}
          className="input-field text-sm font-mono resize-y min-h-[80px]"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !question.trim() || !sql.trim()}
          className="btn-primary text-xs px-4 py-2 disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="btn-secondary text-xs px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
