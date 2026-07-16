import { useState, useEffect, useCallback } from "react";
import AnnotationEditor from "./AnnotationEditor";
import type { SchemaResponse, TableSchema, SchemaAnnotation } from "../../api/client";
import { schemasApi } from "../../api/client";
import { useAppStore } from "../../stores/app";

function formatSampleData(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    return null;
  } catch {
    return null;
  }
}

export default function SchemaTree() {
  const { selectedDatasourceId } = useAppStore();
  const [data, setData] = useState<SchemaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const loadSchema = useCallback(async () => {
    if (!selectedDatasourceId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await schemasApi.get(selectedDatasourceId);
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedDatasourceId]);

  useEffect(() => { loadSchema(); }, [loadSchema]);

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      next.has(tableName) ? next.delete(tableName) : next.add(tableName);
      return next;
    });
  };

  const getAnnotation = (tableName: string, fieldName?: string): SchemaAnnotation | null => {
    if (!data) return null;
    return data.annotations.find(
      (a) => a.table_name === tableName && (fieldName ? a.field_name === fieldName : a.field_name === null)
    ) ?? null;
  };

  const handleSaveAnnotation = async (tableName: string, fieldName: string | undefined, value: string) => {
    if (!selectedDatasourceId) return;
    try {
      await schemasApi.upsertAnnotation(selectedDatasourceId, {
        table_name: tableName,
        field_name: fieldName,
        annotation: value,
      });
      loadSchema();
    } catch (err) {
      console.error("Failed to save annotation:", err);
    }
  };

  if (loading) return <p className="text-[var(--steel)] text-sm">Loading schema…</p>;

  if (error) return (
    <div className="p-3 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-sm">{error}</div>
  );

  if (!data || data.schema.tables.length === 0) return (
    <div className="card-base text-center py-16">
      <p className="text-[var(--steel)] text-sm">No tables found</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {data.schema.tables.map((tableSchema: TableSchema) => {
        const isExpanded = expandedTables.has(tableSchema.table.name);
        const tableAnnotation = getAnnotation(tableSchema.table.name);

        return (
          <div key={tableSchema.table.name} className="card-base">
            {/* Table header */}
            <button
              onClick={() => toggleTable(tableSchema.table.name)}
              className="w-full flex items-center gap-3 text-left"
            >
              <span className={`text-[var(--steel)] transition-transform text-xs ${isExpanded ? "rotate-90" : ""}`}>▶</span>
              <span className="text-sm font-medium text-[var(--ink)]">{tableSchema.table.name}</span>
              {tableSchema.table.comment && (
                <span className="text-xs text-[var(--steel)]">({tableSchema.table.comment})</span>
              )}
              <span className="text-xs text-[var(--stone)] ml-auto">{tableSchema.columns.length} cols</span>
            </button>

            {/* Table annotation */}
            <div className="ml-6 mt-2 flex items-center gap-2">
              <span className="label-mono inline">Table:</span>
              <AnnotationEditor
                value={tableAnnotation?.annotation ?? null}
                onSave={(val) => handleSaveAnnotation(tableSchema.table.name, undefined, val)}
              />
            </div>

            {/* Columns */}
            {isExpanded && (
              <div className="ml-6 mt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--hairline)]">
                      <th className="text-left py-2 pr-4 label-mono">列名</th>
                      <th className="text-left py-2 pr-4 label-mono">类型</th>
                      <th className="text-left py-2 pr-4 label-mono">业务语义</th>
                      <th className="text-left py-2 pr-4 label-mono">值域</th>
                      <th className="text-left py-2 label-mono">样本值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableSchema.columns.map((col) => {
                      const colAnnotation = getAnnotation(tableSchema.table.name, col.name);
                      const samples = formatSampleData(colAnnotation?.sample_data ?? null);
                      const domainType = colAnnotation?.domain_type;
                      const domainValues = colAnnotation?.domain_values;

                      return (
                        <tr key={col.name} className="border-b border-[var(--hairline-soft)]">
                          <td className="py-2 pr-4">
                            <span className="font-mono text-[var(--ink)]">{col.name}</span>
                            {col.isPrimaryKey && (
                              <span className="ml-1 text-[var(--primary)] font-mono text-xs font-medium">PK</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 font-mono text-[var(--slate)] text-xs">{col.type}</td>
                          <td className="py-2 pr-4">
                            <AnnotationEditor
                              value={colAnnotation?.annotation ?? null}
                              onSave={(val) => handleSaveAnnotation(tableSchema.table.name, col.name, val)}
                            />
                          </td>
                          <td className="py-2 pr-4">
                            {domainType ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-[var(--info-soft)] text-[var(--info)] border border-[var(--info)]/20">
                                  {domainType === "enum" ? "枚举" : "范围"}
                                </span>
                                {domainValues && (
                                  <span className="text-xs text-[var(--steel)] truncate max-w-[200px]" title={domainValues}>
                                    {domainType === "enum" ? domainValues : domainValues}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--stone)]">—</span>
                            )}
                          </td>
                          <td className="py-2">
                            {samples && samples.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {samples.slice(0, 5).map((v, i) => (
                                  <span
                                    key={i}
                                    className="inline-block px-1.5 py-0.5 rounded text-xs font-mono bg-[var(--surface)] text-[var(--slate)] border border-[var(--hairline)]"
                                  >
                                    {v.length > 12 ? v.slice(0, 12) + "…" : v}
                                  </span>
                                ))}
                                {samples.length > 5 && (
                                  <span className="text-xs text-[var(--steel)]">+{samples.length - 5}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--stone)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {tableSchema.foreignKeys.length > 0 && (
                  <div className="mt-3">
                    <p className="label-mono mb-1">Foreign Keys</p>
                    {tableSchema.foreignKeys.map((fk) => (
                      <p key={fk.name} className="text-xs text-[var(--slate)] font-mono">
                        {fk.columnName} → {fk.referencedTable}.{fk.referencedColumn}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
