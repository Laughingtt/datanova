import { useState, useEffect, useCallback } from "react";
import AnnotationEditor from "./AnnotationEditor";
import type { SchemaResponse, TableSchema, SchemaAnnotation } from "../../api/client";
import { schemasApi } from "../../api/client";
import { useAppStore } from "../../stores/app";

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

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  const getAnnotation = (tableName: string, fieldName?: string): string | null => {
    if (!data) return null;
    return data.annotations.find(
      (a) =>
        a.table_name === tableName &&
        (fieldName ? a.field_name === fieldName : a.field_name === null)
    )?.annotation ?? null;
  };

  const handleSaveAnnotation = async (tableName: string, fieldName: string | undefined, value: string) => {
    if (!selectedDatasourceId) return;
    try {
      await schemasApi.upsertAnnotation(selectedDatasourceId, {
        table_name: tableName,
        field_name: fieldName,
        annotation: value,
      });
      // Reload to get updated annotations
      loadSchema();
    } catch (err) {
      console.error("Failed to save annotation:", err);
    }
  };

  if (!selectedDatasourceId) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-slate text-body-large">Select a datasource to view schema</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-slate">Loading schema...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="p-3 bg-error-red/10 border border-error-red/20 rounded-xs text-error-red text-caption">
          {error}
        </div>
      </div>
    );
  }

  if (!data || data.schema.tables.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-slate text-body-large">No tables found.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-hairline">
      {data.schema.tables.map((tableSchema: TableSchema) => {
        const isExpanded = expandedTables.has(tableSchema.table.name);
        const tableAnnotation = getAnnotation(tableSchema.table.name);

        return (
          <div key={tableSchema.table.name} className="px-8">
            {/* Table header */}
            <button
              onClick={() => toggleTable(tableSchema.table.name)}
              className="w-full flex items-center gap-3 py-4 text-left"
            >
              <span className={`text-muted-slate transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                ▶
              </span>
              <span className="font-display text-feature-heading text-ink">
                {tableSchema.table.name}
              </span>
              {tableSchema.table.comment && (
                <span className="text-caption text-muted-slate">({tableSchema.table.comment})</span>
              )}
              <span className="text-micro text-muted-slate ml-2">
                {tableSchema.columns.length} columns
              </span>
            </button>

            {/* Table annotation */}
            <div className="ml-8 mb-2">
              <span className="mono-label mr-2">Table:</span>
              <AnnotationEditor
                value={tableAnnotation}
                onSave={(val) => handleSaveAnnotation(tableSchema.table.name, undefined, val)}
              />
            </div>

            {/* Columns */}
            {isExpanded && (
              <div className="ml-8 mb-4">
                <table className="w-full text-caption">
                  <thead>
                    <tr className="border-b border-hairline">
                      <th className="text-left py-2 pr-4 mono-label">Column</th>
                      <th className="text-left py-2 pr-4 mono-label">Type</th>
                      <th className="text-left py-2 pr-4 mono-label">Nullable</th>
                      <th className="text-left py-2 pr-4 mono-label">Key</th>
                      <th className="text-left py-2 mono-label">Annotation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableSchema.columns.map((col) => {
                      const colAnnotation = getAnnotation(tableSchema.table.name, col.name);
                      return (
                        <tr key={col.name} className="border-b border-card-border">
                          <td className="py-2 pr-4 font-mono text-ink">{col.name}</td>
                          <td className="py-2 pr-4 font-mono text-muted-slate">{col.type}</td>
                          <td className="py-2 pr-4 text-muted-slate">
                            {col.nullable ? "YES" : "NO"}
                          </td>
                          <td className="py-2 pr-4">
                            {col.isPrimaryKey && (
                              <span className="text-action-blue font-mono text-micro">PK</span>
                            )}
                          </td>
                          <td className="py-2">
                            <AnnotationEditor
                              value={colAnnotation}
                              onSave={(val) => handleSaveAnnotation(tableSchema.table.name, col.name, val)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Foreign Keys */}
                {tableSchema.foreignKeys.length > 0 && (
                  <div className="mt-3">
                    <p className="mono-label mb-1">Foreign Keys</p>
                    {tableSchema.foreignKeys.map((fk) => (
                      <p key={fk.name} className="text-caption text-muted-slate font-mono">
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
