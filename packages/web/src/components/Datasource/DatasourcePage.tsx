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
      <div className="sunset-stripe" />

      <div className="max-w-[960px] mx-auto px-8 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-display text-2xl text-[var(--ink)]">数据源管理</h2>
            <p className="text-sm text-[var(--steel)] mt-1">
              连接 MySQL 数据库，开启 AI 驱动的数据查询
            </p>
          </div>
          <button onClick={handleCreate} className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            添加数据源
          </button>
        </div>

        {showForm && (
          <div className="card-base mb-8 border-[var(--accent-100)] bg-[var(--primary-soft)]">
            <DatasourceForm
              datasource={editingDs}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingDs(null); }}
            />
          </div>
        )}

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
