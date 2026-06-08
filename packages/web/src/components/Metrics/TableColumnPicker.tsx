import { useState, useEffect } from "react";
import { schemaBrowseApi, type BrowseTable } from "../../api/client";

interface TableColumnPickerProps {
  datasourceId: string;
  value: string;
  onChange: (sqlExpr: string) => void;
  mode?: "column" | "aggregate";
  placeholder?: string;
}

export default function TableColumnPicker({
  datasourceId,
  value,
  onChange,
  mode = "column",
  placeholder = "Select a table column...",
}: TableColumnPickerProps) {
  const [tables, setTables] = useState<BrowseTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [aggFunc, setAggFunc] = useState<string>("SUM");

  useEffect(() => {
    if (!datasourceId) return;
    setLoading(true);
    schemaBrowseApi.tables(datasourceId)
      .then(res => { setTables(res.tables); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [datasourceId]);

  const handleSelectColumn = (tableName: string, columnName: string) => {
    const expr = mode === "aggregate"
      ? `${aggFunc}(${tableName}.${columnName})`
      : `${tableName}.${columnName}`;
    onChange(expr);
    setShowPicker(false);
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          className="input-field flex-1 font-mono text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="btn-ghost text-xs whitespace-nowrap px-3 py-1.5 border border-[var(--hairline)] rounded-md"
        >
          {showPicker ? "✕ Close" : "📋 Browse"}
        </button>
      </div>

      {showPicker && (
        <div className="absolute z-50 mt-2 w-full max-h-[320px] overflow-y-auto bg-[var(--surface)] border border-[var(--hairline-strong)] rounded-lg shadow-lg p-3">
          {loading && <p className="text-xs text-[var(--steel)] py-2">Loading schema...</p>}
          {error && <p className="text-xs text-[var(--error)] py-2">{error}</p>}

          {!loading && !error && (
            <>
              {mode === "aggregate" && (
                <div className="mb-3 flex items-center gap-2">
                  <label className="text-xs text-[var(--steel)]">Aggregation:</label>
                  {["SUM", "AVG", "COUNT", "MAX", "MIN"].map(fn => (
                    <button
                      key={fn}
                      type="button"
                      onClick={() => setAggFunc(fn)}
                      className={`text-xs px-2 py-0.5 rounded ${
                        aggFunc === fn
                          ? "bg-[var(--primary)] text-white"
                          : "bg-[var(--canvas)] text-[var(--steel)] hover:bg-[var(--hairline-soft)]"
                      }`}
                    >
                      {fn}
                    </button>
                  ))}
                </div>
              )}

              {tables.map(table => (
                <div key={table.name} className="mb-2">
                  <p className="text-xs font-medium text-[var(--ink)] mb-1 flex items-center gap-1">
                    <span className="text-[var(--stone)]">📄</span>
                    {table.name}
                    {table.comment && (
                      <span className="text-[var(--stone)] font-normal">— {table.comment}</span>
                    )}
                  </p>
                  <div className="ml-4 space-y-0.5">
                    {table.columns.map(col => (
                      <button
                        key={`${table.name}.${col.name}`}
                        type="button"
                        onClick={() => handleSelectColumn(table.name, col.name)}
                        className="w-full text-left flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-[var(--primary-soft)] transition-colors"
                      >
                        <span className="font-mono text-[var(--ink)]">{col.name}</span>
                        <span className="font-mono text-[var(--stone)]">{col.type}</span>
                        {col.isPrimaryKey && (
                          <span className="text-[var(--primary-text)] font-mono text-[10px]">PK</span>
                        )}
                        {col.comment && (
                          <span className="text-[var(--steel)] truncate">— {col.comment}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {tables.length === 0 && (
                <p className="text-xs text-[var(--steel)] py-2">No tables discovered. Run schema discovery first.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
