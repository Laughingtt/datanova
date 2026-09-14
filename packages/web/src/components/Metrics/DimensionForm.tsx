import { useState, useEffect } from "react";
import type { SemanticDimension } from "../../api/client";
import { semanticApi } from "../../api/client";
import TableColumnPicker from "./TableColumnPicker";

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
  const [description, setDescription] = useState(dimension?.description ?? "");
  const [sqlExpression, setSqlExpression] = useState(dimension?.sql_expression ?? "");
  const [dataType, setDataType] = useState<"string" | "number" | "date">(
    dimension?.data_type ?? "string"
  );
  const [grain, setGrain] = useState<string>(dimension?.grain ?? "");
  const [dateColumn, setDateColumn] = useState(dimension?.date_column ?? "");
  const [hierarchy, setHierarchy] = useState(dimension?.hierarchy ?? "");
  const [values, setValues] = useState(dimension?.values ?? "");
  const [valuesMode, setValuesMode] = useState<"simple" | "keyvalue">(() => {
    // Auto-detect mode from existing data
    if (!dimension?.values) return "simple";
    try {
      const parsed = JSON.parse(dimension.values);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0].key !== undefined) {
        return "keyvalue";
      }
    } catch {}
    return "simple";
  });
  const [kvPairs, setKvPairs] = useState<Array<{ key: string; value: string }>>(() => {
    if (!dimension?.values) return [];
    try {
      const parsed = JSON.parse(dimension.values);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0].key !== undefined) {
        return parsed.map((item: any) => ({ key: String(item.key), value: String(item.value ?? item.key) }));
      }
    } catch {}
    return [];
  });
  const [status, setStatus] = useState<"draft" | "published" | "deprecated">(
    dimension?.status ?? "draft"
  );
  const [isEnumDict, setIsEnumDict] = useState(dimension?.is_enum_dict ?? false);

  // Re-initialize form when dimension prop changes
  useEffect(() => {
    setName(dimension?.name ?? "");
    setDisplayName(dimension?.display_name ?? "");
    setDescription(dimension?.description ?? "");
    setSqlExpression(dimension?.sql_expression ?? "");
    setDataType(dimension?.data_type ?? "string");
    setGrain(dimension?.grain ?? "");
    setDateColumn(dimension?.date_column ?? "");
    setHierarchy(dimension?.hierarchy ?? "");
    setValues(dimension?.values ?? "");
    // Re-detect values mode
    const detectedMode: "simple" | "keyvalue" = (() => {
      if (!dimension?.values) return "simple";
      try {
        const parsed = JSON.parse(dimension.values);
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0].key !== undefined) {
          return "keyvalue";
        }
      } catch {}
      return "simple";
    })();
    setValuesMode(detectedMode);
    if (detectedMode === "keyvalue" && dimension?.values) {
      try {
        const parsed = JSON.parse(dimension.values);
        setKvPairs(parsed.map((item: any) => ({ key: String(item.key), value: String(item.value ?? item.key) })));
      } catch { setKvPairs([]); }
    } else {
      setKvPairs([]);
    }
    setStatus(dimension?.status ?? "draft");
    setIsEnumDict(dimension?.is_enum_dict ?? false);
    setError(null);
  }, [dimension]);

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
        description,
        sql_expression: sqlExpression,
        data_type: dataType,
        grain: grain || null,
        date_column: dateColumn || null,
        hierarchy: hierarchy || null,
        values: (() => {
          if (valuesMode === "keyvalue") {
            const pairs = kvPairs.filter(p => p.key.trim());
            return pairs.length > 0 ? JSON.stringify(pairs) : null;
          }
          // Simple mode: parse comma-separated string into [{key,value}] format
          if (!values.trim()) return null;
          const items = values.split(",").map(v => v.trim()).filter(Boolean);
          return items.length > 0 ? JSON.stringify(items.map(v => ({ key: v, value: v }))) : null;
        })(),
        status,
        is_enum_dict: isEnumDict,
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
        {isEdit ? "编辑维度" : "新增维度"}
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
            <label className="label-mono">标识名</label>
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
            <label className="label-mono">显示名称</label>
            <input
              className="input-field"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              placeholder="地区"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="label-mono">描述</label>
          <textarea
            className="input-field min-h-[60px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述这个维度的用途..."
          />
        </div>

        {/* SQL Expression */}
        <div>
          <label className="label-mono">SQL 表达式</label>
          <TableColumnPicker
            datasourceId={datasourceId}
            value={sqlExpression}
            onChange={setSqlExpression}
            mode="column"
            placeholder="orders.region_code"
          />
        </div>

        {/* Data Type */}
        <div>
          <label className="label-mono">数据类型</label>
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
                {{ string: "字符串", number: "数字", date: "日期" }[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Time granularity fields (only for date type) */}
        {dataType === 'date' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-mono">时间粒度</label>
              <select
                className="input-field"
                value={grain}
                onChange={(e) => setGrain(e.target.value)}
              >
                <option value="">无</option>
                <option value="day">日</option>
                <option value="week">周</option>
                <option value="month">月</option>
                <option value="quarter">季</option>
                <option value="year">年</option>
              </select>
            </div>
            <div>
              <label className="label-mono">时间列</label>
              <input
                type="text"
                className="input-field"
                value={dateColumn}
                onChange={(e) => setDateColumn(e.target.value)}
                placeholder="如 orders.created_at"
              />
            </div>
          </div>
        )}

        {/* Hierarchy (JSON) */}
        <div>
          <label className="label-mono">层级（JSON）</label>
          <textarea
            className="input-field min-h-[60px] resize-y font-mono text-xs"
            value={hierarchy}
            onChange={(e) => setHierarchy(e.target.value)}
            placeholder='{"levels": ["country", "province", "city"]}'
          />
        </div>

        {/* Values: Enum / Key-Value Mapping */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label-mono">可选值</label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setValuesMode("simple")}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  valuesMode === "simple"
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--canvas)] text-[var(--steel)] border border-[var(--hairline)]"
                }`}
              >
                简单枚举
              </button>
              <button
                type="button"
                onClick={() => setValuesMode("keyvalue")}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  valuesMode === "keyvalue"
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--canvas)] text-[var(--steel)] border border-[var(--hairline)]"
                }`}
              >
                键值映射
              </button>
            </div>
          </div>

          {valuesMode === "simple" ? (
            <div>
              <input
                className="input-field"
                value={values}
                onChange={(e) => setValues(e.target.value)}
                placeholder="north, south, east, west"
              />
              <p className="text-[11px] text-[var(--stone)] mt-1">逗号分隔，如：north, south, east, west</p>
            </div>
          ) : (
            <div className="space-y-2">
              {kvPairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input-field flex-1 text-xs"
                    value={pair.key}
                    onChange={(e) => setKvPairs(prev => prev.map((p, idx) => idx === i ? { ...p, key: e.target.value } : p))}
                    placeholder="存储值 (如 1)"
                  />
                  <span className="text-[var(--steel)]">→</span>
                  <input
                    className="input-field flex-1 text-xs"
                    value={pair.value}
                    onChange={(e) => setKvPairs(prev => prev.map((p, idx) => idx === i ? { ...p, value: e.target.value } : p))}
                    placeholder="显示值 (如 男)"
                  />
                  <button
                    type="button"
                    onClick={() => setKvPairs(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-[var(--error)] hover:bg-[var(--error-soft)] p-1 rounded transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setKvPairs(prev => [...prev, { key: "", value: "" }])}
                className="text-xs text-[var(--primary)] hover:underline inline-flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                添加映射
              </button>
              <p className="text-[11px] text-[var(--stone)]">如：1→男, 0→女（数字型维度推荐使用键值映射）</p>
            </div>
          )}
        </div>

        {/* Is Enum Dictionary */}
        <div className="flex items-center gap-3">
          <label className="label-mono shrink-0">纳入枚举值字典</label>
          <label className="text-xs text-[var(--steel)] flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isEnumDict}
              onChange={(e) => setIsEnumDict(e.target.checked)}
              className="rounded border-[var(--hairline-strong)] text-[var(--primary)] focus:ring-[var(--primary)]"
            />
            {isEnumDict ? "将在「枚举值字典」中展示此维度的可选值映射" : "不纳入枚举值字典"}
          </label>
        </div>

        {/* Status */}
        <div>
          <label className="label-mono">状态</label>
          <div className="flex gap-3">
            {(["draft", "published", "deprecated"] as const).map((s) => {
              const badge = {
                draft: { dot: "bg-[var(--warning)]", label: "草稿" },
                published: { dot: "bg-[var(--success)]", label: "已发布" },
                deprecated: { dot: "bg-[var(--error)]", label: "已弃用" },
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
            {saving ? "保存中..." : isEdit ? "更新" : "创建"}
          </button>
          {isEdit && (
            <button
              type="button"
              className="btn-danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "删除中..." : "删除"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
