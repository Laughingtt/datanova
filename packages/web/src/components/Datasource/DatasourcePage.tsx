import { useState, useEffect } from "react";
import { datasourcesApi, type Datasource } from "../../api/client";
import DatasourceList from "./DatasourceList";
import DatasourceForm from "./DatasourceForm";

export default function DatasourcePage() {
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingDs, setEditingDs] = useState<Datasource | null>(null);

  const loadDatasources = async () => {
    try {
      const list = await datasourcesApi.list();
      setDatasources(list);
    } catch (err) {
      console.error("Failed to load datasources:", err);
    }
  };

  useEffect(() => { loadDatasources(); }, []);

  const handleCreate = () => {
    setEditingDs(null);
    setShowForm(true);
  };

  const handleEdit = (ds: Datasource) => {
    setEditingDs(ds);
    setShowForm(true);
  };

  const handleSave = async () => {
    setShowForm(false);
    setEditingDs(null);
    await loadDatasources();
  };

  const handleDelete = async (id: string) => {
    await datasourcesApi.delete(id);
    await loadDatasources();
  };

  const handleTest = async (id: string) => {
    return datasourcesApi.test(id);
  };

  return (
    <div className="h-full overflow-auto bg-[var(--canvas)]">
      {/* Sunset stripe top accent */}
      <div className="sunset-stripe" />

      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-display text-heading-2 text-[var(--ink)]">Datasources</h2>
            <p className="text-body-sm text-[var(--slate)] mt-1">
              Connect MySQL databases for AI-powered querying
            </p>
          </div>
          <button onClick={handleCreate} className="btn-primary">
            + Add Datasource
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="card-cream mb-8">
            <DatasourceForm
              datasource={editingDs}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingDs(null); }}
            />
          </div>
        )}

        {/* List */}
        <DatasourceList
          datasources={datasources}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onTest={handleTest}
        />
      </div>
    </div>
  );
}