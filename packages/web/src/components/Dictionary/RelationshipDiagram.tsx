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

  if (loading) return <p className="text-xs text-[var(--muted-foreground)]">正在加载表关系…</p>;
  if (error) return <p className="text-xs text-[var(--error)]">{error}</p>;

  return (
    <div className="card-base">
      <h4 className="text-sm font-medium text-[var(--foreground)] mb-3">表关系</h4>
      {relationships.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]">未发现外键关系</p>
      ) : (
        <div className="space-y-1.5 mb-4">
          {relationships.map((rel, i) => (
            <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-md bg-[var(--muted)]">
              <span className="font-mono text-[var(--foreground)]">{rel.fromTable}</span>
              <span className="font-mono text-[var(--muted-foreground)]">.{rel.fromColumn}</span>
              <span className="text-[var(--primary-text)]">→</span>
              <span className="font-mono text-[var(--foreground)]">{rel.toTable}</span>
              <span className="font-mono text-[var(--muted-foreground)]">.{rel.toColumn}</span>
            </div>
          ))}
        </div>
      )}

      <h4 className="text-sm font-medium text-[var(--foreground)] mb-2">表关系图</h4>
      <div className="flex flex-wrap gap-2">
        {tables.map(name => {
          const hasRelation = relationships.some(r => r.fromTable === name || r.toTable === name);
          return (
            <div
              key={name}
              className={`px-3 py-1.5 rounded-md text-xs font-mono border ${
                hasRelation
                  ? "border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-[var(--primary-soft)] text-[var(--primary-text)]"
                  : "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"
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
