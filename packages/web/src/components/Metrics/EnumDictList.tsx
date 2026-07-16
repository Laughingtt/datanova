import { useState, useEffect, useCallback } from "react";
import { enumDictApi, type EnumDictEntry } from "../../api/client";

interface EnumDictListProps {
  datasourceId: string;
}

export default function EnumDictList({ datasourceId }: EnumDictListProps) {
  const [entries, setEntries] = useState<EnumDictEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSource, setEditSource] = useState<"dimension" | "annotation">("dimension");
  const [editValues, setEditValues] = useState<Array<{ key: string; value: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "dimension" | "annotation">("all");

  const loadEntries = useCallback(async () => {
    if (!datasourceId) return;
    setLoading(true);
    try {
      const data = await enumDictApi.list(datasourceId);
      setEntries(data);
    } catch (err) {
      console.error("Failed to load enum dict:", err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [datasourceId]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const startEdit = (entry: EnumDictEntry) => {
    setEditingId(entry.id);
    setEditSource(entry.source);
    setEditValues([...entry.values]);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues([]);
    setError(null);
  };

  const addPair = () => {
    setEditValues(prev => [...prev, { key: "", value: "" }]);
  };

  const removePair = (idx: number) => {
    setEditValues(prev => prev.filter((_, i) => i !== idx));
  };

  const updatePair = (idx: number, field: "key" | "value", val: string) => {
    setEditValues(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));
  };

  const saveEdit = async () => {
    if (!datasourceId || !editingId) return;
    setSaving(true);
    setError(null);
    try {
      await enumDictApi.update(datasourceId, editSource, editingId, editValues);
      await loadEntries();
      setEditingId(null);
      setEditValues([]);
    } catch (err) {
      setError((err as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const filtered = filter === "all" ? entries : entries.filter(e => e.source === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-[var(--accent-300)] border-t-[var(--primary)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-[var(--ink)] mb-1">
          枚举值字典
        </h3>
        <p className="text-xs text-[var(--steel)]">
          管理字段的枚举值映射，如 sex: 1→男, 0→女
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {(["all", "dimension", "annotation"] as const).map((f) => {
          const labels: Record<string, string> = { all: "全部", dimension: "维度", annotation: "Schema 标注" };
          const count = f === "all" ? entries.length : entries.filter(e => e.source === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--canvas)] text-[var(--steel)] border border-[var(--hairline)] hover:border-[var(--primary)]/40"
              }`}
            >
              {labels[f]} ({count})
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="card-base text-center py-12">
          <svg className="w-10 h-10 mx-auto text-[var(--stone)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="text-sm text-[var(--steel)]">
            {entries.length === 0
              ? "暂无枚举值字典，请先在维度中设置可选值"
              : "当前筛选条件下无匹配项"}
          </p>
        </div>
      )}

      {/* Entry list */}
      <div className="space-y-3">
        {filtered.map((entry) => {
          const isEditing = editingId === entry.id;
          return (
            <div
              key={`${entry.source}-${entry.id}`}
              className="card-base"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                    entry.source === "dimension"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {entry.source === "dimension" ? "维度" : "标注"}
                  </span>
                  <span className="text-sm font-medium text-[var(--ink)]">
                    {entry.display_name}
                  </span>
                  <span className="text-xs font-mono text-[var(--stone)]">
                    ({entry.name})
                  </span>
                  {entry.table_name && entry.field_name && (
                    <span className="text-xs text-[var(--steel)]">
                      {entry.table_name}.{entry.field_name}
                    </span>
                  )}
                  {entry.data_type && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--steel)]">
                      {entry.data_type}
                    </span>
                  )}
                </div>
                {!isEditing && (
                  <button
                    onClick={() => startEdit(entry)}
                    className="text-xs text-[var(--primary)] hover:underline"
                  >
                    编辑
                  </button>
                )}
              </div>

              {/* Values display */}
              {!isEditing && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--hairline)]">
                        <th className="text-left py-1.5 px-2 font-mono text-[var(--steel)] w-1/3">存储值</th>
                        <th className="text-left py-1.5 px-2 font-mono text-[var(--steel)] w-1/3">显示值</th>
                        <th className="text-left py-1.5 px-2 font-mono text-[var(--steel)]">预览</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.values.map((v, i) => (
                        <tr key={i} className="border-b border-[var(--hairline-soft)] last:border-0">
                          <td className="py-1.5 px-2 font-mono text-[var(--ink)]">{v.key}</td>
                          <td className="py-1.5 px-2 text-[var(--ink)]">{v.value}</td>
                          <td className="py-1.5 px-2 text-[var(--steel)]">
                            <span className="inline-flex items-center gap-1">
                              <span className="font-mono bg-[var(--surface)] px-1.5 py-0.5 rounded text-[var(--primary-text)]">{v.key}</span>
                              <span>→</span>
                              <span>{v.value}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Edit mode */}
              {isEditing && (
                <div className="space-y-3">
                  {error && (
                    <div className="p-2 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-xs">
                      {error}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {editValues.map((v, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          className="input-field flex-1 text-xs"
                          value={v.key}
                          onChange={(e) => updatePair(i, "key", e.target.value)}
                          placeholder="存储值 (如 1)"
                        />
                        <span className="text-[var(--steel)]">→</span>
                        <input
                          className="input-field flex-1 text-xs"
                          value={v.value}
                          onChange={(e) => updatePair(i, "value", e.target.value)}
                          placeholder="显示值 (如 男)"
                        />
                        <button
                          onClick={() => removePair(i)}
                          className="text-[var(--error)] hover:bg-[var(--error-soft)] p-1 rounded transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addPair}
                    className="text-xs text-[var(--primary)] hover:underline inline-flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    添加映射
                  </button>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={saveEdit} disabled={saving} className="btn-dark text-xs">
                      {saving ? "保存中..." : "保存"}
                    </button>
                    <button onClick={cancelEdit} className="btn-ghost text-xs">
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
