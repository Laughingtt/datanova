import { useState, useEffect } from "react";
import { schemaBrowseApi } from "../../api/client";

interface RelationshipDiagramProps {
  datasourceId: string;
}

interface Relationship {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export default function RelationshipDiagram({ datasourceId }: RelationshipDiagramProps) {
  const [tables, setTables] = useState<string[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasourceId) return;
    schemaBrowseApi.tables(datasourceId)
      .then(res => {
        setTables(res.tables.map(t => t.name));
        setRelationships(res.relationships);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [datasourceId]);

  if (loading) return <p className="text-xs text-[var(--steel)]">Loading relationships...</p>;
  if (error) return <p className="text-xs text-[var(--error)]">{error}</p>;

  return (
    <div className="card-base">
      <h4 className="text-sm font-medium text-[var(--ink)] mb-3">Table Relationships</h4>
      {relationships.length === 0 ? (
        <p className="text-xs text-[var(--steel)]">No foreign key relationships discovered</p>
      ) : (
        <div className="space-y-1.5 mb-4">
          {relationships.map((rel, i) => (
            <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-[var(--surface)] border border-[var(--hairline)]">
              <span className="font-mono text-[var(--ink)]">{rel.fromTable}</span>
              <span className="font-mono text-[var(--stone)]">.{rel.fromColumn}</span>
              <span className="text-[var(--primary-text)]">→</span>
              <span className="font-mono text-[var(--ink)]">{rel.toTable}</span>
              <span className="font-mono text-[var(--stone)]">.{rel.toColumn}</span>
            </div>
          ))}
        </div>
      )}

      <h4 className="text-sm font-medium text-[var(--ink)] mb-2">Table Graph</h4>
      <div className="flex flex-wrap gap-2">
        {tables.map(name => {
          const hasRelation = relationships.some(r => r.fromTable === name || r.toTable === name);
          return (
            <div
              key={name}
              className={`px-3 py-1.5 rounded-md text-xs font-mono border ${
                hasRelation
                  ? "border-[var(--primary)]/30 bg-[var(--primary-soft)] text-[var(--primary-text)]"
                  : "border-[var(--hairline)] bg-[var(--canvas)] text-[var(--steel)]"
              }`}
            >
              {name}
            </div>
          );
        })}
      </div>
    </div>
  );
}
