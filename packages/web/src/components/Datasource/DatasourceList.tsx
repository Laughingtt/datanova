import { useState } from "react";
import type { Datasource } from "../../api/client";

interface DatasourceListProps {
  datasources: Datasource[];
  onEdit: (ds: Datasource) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => Promise<{ success: boolean; message?: string }>;
}

export default function DatasourceList({ datasources, onEdit, onDelete, onTest }: DatasourceListProps) {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message?: string }>>({});

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await onTest(id);
      setTestResult((prev) => ({ ...prev, [id]: result }));
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: { success: false, message: "Connection failed" } }));
    }
    setTestingId(null);
  };

  if (datasources.length === 0) {
    return (
      <div className="card-base text-center py-16">
        <p className="text-[var(--steel)] text-sm">No datasources configured yet</p>
        <p className="text-[var(--stone)] text-xs mt-1">Click "+ Add Datasource" to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {datasources.map((ds) => {
        const result = testResult[ds.id];
        return (
          <div key={ds.id} className="card-base flex items-center justify-between group hover:shadow-2 transition-shadow">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-[var(--ink)] truncate">{ds.name}</h3>
                <span className="text-xs font-mono text-[var(--steel)] bg-[var(--surface)] px-2 py-0.5 rounded-md">
                  mysql
                </span>
              </div>
              <p className="text-xs text-[var(--slate)] mt-1 font-mono">
                {ds.host}:{ds.port}/{ds.database}
              </p>
              {result && (
                <p className={`text-xs mt-1 ${result.success ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                  {result.success ? "✓ Connected" : `✗ ${result.message ?? "Failed"}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleTest(ds.id)} disabled={testingId === ds.id} className="btn-ghost text-xs">
                {testingId === ds.id ? "Testing…" : "Test"}
              </button>
              <button onClick={() => onEdit(ds)} className="btn-ghost text-xs">Edit</button>
              <button onClick={() => onDelete(ds.id)} className="btn-danger text-xs">Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}