import { useState, useEffect } from "react";
import { datasourcesApi, type Datasource } from "../../api/client";
import DatasourceList from "./DatasourceList";
import DatasourceForm from "./DatasourceForm";
import { toast } from "../../stores/toast";

export default function DatasourcePage() {
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDs, setEditingDs] = useState<Datasource | null>(null);

  const loadDatasources = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await datasourcesApi.list();
      setDatasources(list);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
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
    toast.success(editingDs ? "数据源已更新" : "数据源已创建");
    await loadDatasources();
  };

  const handleDelete = async (id: string) => {
    try {
      await datasourcesApi.delete(id);
      toast.success("数据源已删除");
      await loadDatasources();
    } catch (err) {
      toast.error("删除失败", err instanceof Error ? err.message : undefined);
    }
  };

  const handleTest = async (id: string) => {
    return datasourcesApi.test(id);
  };

  return (
    <div className="h-full overflow-auto bg-[var(--canvas)]">

      <div className="max-w-[960px] mx-auto px-4 md:px-8 py-8 md:py-10">
        <div className="flex items-end justify-between mb-8 gap-4">
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
          <div className="card-base mb-8">
            <DatasourceForm
              datasource={editingDs}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingDs(null); }}
            />
          </div>
        )}

        {loading ? (
          <div className="grid gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card-base p-4 flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-32 rounded shimmer-bg" />
                  <div className="h-3 w-48 rounded shimmer-bg" />
                </div>
                <div className="h-7 w-20 rounded shimmer-bg" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center">
            <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-[var(--error-soft)]">
              <svg className="h-5 w-5 text-[var(--error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
            </div>
            <p className="mb-1 text-sm font-medium text-[var(--foreground)]">加载失败</p>
            <p className="mb-4 text-sm text-[var(--muted-foreground)]">{loadError}</p>
            <button onClick={loadDatasources} className="btn-primary">重试</button>
          </div>
        ) : (
          <DatasourceList
            datasources={datasources}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onTest={handleTest}
          />
        )}
      </div>
    </div>
  );
}
