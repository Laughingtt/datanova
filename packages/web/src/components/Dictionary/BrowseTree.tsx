import { useState, useEffect } from "react";
import { schemaBrowseApi, type BrowseTable } from "../../api/client";
import { semanticApi, type SemanticMetric, type SemanticDimension } from "../../api/client";

interface BrowseTreeProps {
  datasourceId: string;
  onSelectTable: (tableName: string) => void;
  onSelectMetric: (metric: SemanticMetric) => void;
  onSelectDimension: (dimension: SemanticDimension) => void;
}

export default function BrowseTree({
  datasourceId,
  onSelectTable,
  onSelectMetric,
  onSelectDimension,
}: BrowseTreeProps) {
  const [tables, setTables] = useState<BrowseTable[]>([]);
  const [metrics, setMetrics] = useState<SemanticMetric[]>([]);
  const [dimensions, setDimensions] = useState<SemanticDimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["tables", "metrics", "dimensions"])
  );
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!datasourceId) return;
    setLoading(true);
    Promise.all([
      schemaBrowseApi.tables(datasourceId),
      semanticApi.listMetrics(datasourceId).catch(() => [] as SemanticMetric[]),
      semanticApi.listDimensions(datasourceId).catch(() => [] as SemanticDimension[]),
    ]).then(([schema, m, d]) => {
      setTables(schema.tables);
      setMetrics(m);
      setDimensions(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [datasourceId]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleTable = (name: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  if (loading) return <p className="text-xs text-[var(--steel)] py-4">Loading...</p>;

  return (
    <div className="space-y-1">
      {/* Tables Section */}
      <div>
        <button
          onClick={() => toggleSection("tables")}
          className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface)] rounded"
        >
          <span className="text-xs">{expandedSections.has("tables") ? "▼" : "▶"}</span>
          <span>📄</span> Tables ({tables.length})
        </button>
        {expandedSections.has("tables") && (
          <div className="ml-6 space-y-0.5">
            {tables.map(table => (
              <div key={table.name}>
                <button
                  onClick={() => { toggleTable(table.name); onSelectTable(table.name); }}
                  className="w-full flex items-center gap-1 px-2 py-1.5 text-left text-xs hover:bg-[var(--surface)] rounded"
                >
                  <span className="text-[10px]">{expandedTables.has(table.name) ? "▼" : "▶"}</span>
                  <span className="font-mono text-[var(--ink)]">{table.name}</span>
                  <span className="text-[var(--stone)] ml-auto">{table.columns.length} cols</span>
                </button>
                {expandedTables.has(table.name) && (
                  <div className="ml-6 space-y-0.5">
                    {table.columns.map(col => (
                      <div key={`${table.name}.${col.name}`} className="flex items-center gap-2 px-2 py-1 text-xs">
                        <span className="font-mono text-[var(--ink)]">{col.name}</span>
                        <span className="font-mono text-[var(--stone)]">{col.type}</span>
                        {col.isPrimaryKey && <span className="text-[var(--primary-text)] text-[10px]">PK</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metrics Section */}
      <div>
        <button
          onClick={() => toggleSection("metrics")}
          className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface)] rounded"
        >
          <span className="text-xs">{expandedSections.has("metrics") ? "▼" : "▶"}</span>
          <span>📊</span> Metrics ({metrics.length})
        </button>
        {expandedSections.has("metrics") && (
          <div className="ml-6 space-y-0.5">
            {metrics.length === 0 ? (
              <p className="text-xs text-[var(--stone)] px-2 py-1">No metrics defined</p>
            ) : (
              metrics.map(m => (
                <button
                  key={m.id}
                  onClick={() => onSelectMetric(m)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--surface)] rounded"
                >
                  <span className="text-[var(--ink)]">{m.display_name || m.name}</span>
                  <span className="text-[var(--stone)] ml-2 font-mono">{m.sql_expression}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Dimensions Section */}
      <div>
        <button
          onClick={() => toggleSection("dimensions")}
          className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface)] rounded"
        >
          <span className="text-xs">{expandedSections.has("dimensions") ? "▼" : "▶"}</span>
          <span>📐</span> Dimensions ({dimensions.length})
        </button>
        {expandedSections.has("dimensions") && (
          <div className="ml-6 space-y-0.5">
            {dimensions.length === 0 ? (
              <p className="text-xs text-[var(--stone)] px-2 py-1">No dimensions defined</p>
            ) : (
              dimensions.map(d => (
                <button
                  key={d.id}
                  onClick={() => onSelectDimension(d)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--surface)] rounded"
                >
                  <span className="text-[var(--ink)]">{d.display_name || d.name}</span>
                  <span className="text-[var(--stone)] ml-2 font-mono">{d.data_type}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
