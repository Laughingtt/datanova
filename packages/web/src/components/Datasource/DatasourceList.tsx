import { useState, useEffect } from "react";
import type { Datasource } from "../../api/client";
import { datasourcesApi } from "../../api/client";
import { useAppStore } from "../../stores/app";

export default function DatasourceList() {
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setSelectedDatasourceId, setView } = useAppStore();

  const loadDatasources = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await datasourcesApi.list();
      setDatasources(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatasources();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this datasource?")) return;
    try {
      await datasourcesApi.delete(id);
      loadDatasources();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedDatasourceId(id);
    setView("schemas");
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-slate">Loading datasources...</p>
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

  if (datasources.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-slate text-body-large">No datasources configured.</p>
        <p className="text-muted-slate text-caption mt-2">Add a datasource to get started.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-hairline">
      {datasources.map((ds) => (
        <div
          key={ds.id}
          className="flex items-center justify-between px-8 py-4 hover:bg-soft-stone/30 transition-colors cursor-pointer"
          onClick={() => handleSelect(ds.id)}
        >
          <div className="flex-1">
            <h3 className="font-display text-feature-heading text-ink">{ds.name}</h3>
            <p className="font-mono text-mono-label text-muted-slate mt-1">
              {ds.host}:{ds.port}/{ds.database}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-micro font-medium ${
                ds.enabled
                  ? "bg-pale-green-wash text-deep-green"
                  : "bg-soft-stone text-muted-slate"
              }`}
            >
              {ds.enabled ? "Enabled" : "Disabled"}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(ds.id);
              }}
              className="text-muted-slate hover:text-error-red transition-colors text-caption"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
