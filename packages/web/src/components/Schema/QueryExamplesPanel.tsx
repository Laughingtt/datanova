import { useState, useCallback } from "react";
import type { TableQueryExample } from "../../api/client";
import { queryExamplesApi } from "../../api/client";
import QueryExampleForm from "./QueryExampleForm";

interface QueryExamplesPanelProps {
  datasourceId: string;
  tables: string[];
}

export default function QueryExamplesPanel({ datasourceId, tables }: QueryExamplesPanelProps) {
  const [selectedTable, setSelectedTable] = useState<string>(tables[0] ?? "");
  const [examples, setExamples] = useState<TableQueryExample[]>([]);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingExample, setEditingExample] = useState<TableQueryExample | undefined>(undefined);

  const loadExamples = useCallback(async (tableName: string) => {
    if (!tableName) return;
    setExamplesLoading(true);
    try {
      const result = await queryExamplesApi.list(datasourceId, tableName);
      setExamples(result);
    } catch (err) {
      console.error("Failed to load query examples:", err);
      setExamples([]);
    } finally {
      setExamplesLoading(false);
    }
  }, [datasourceId]);

  const handleSelectTable = (tableName: string) => {
    setSelectedTable(tableName);
    setShowForm(false);
    setEditingExample(undefined);
    loadExamples(tableName);
  };

  const handleSaveExample = (example: TableQueryExample) => {
    setExamples((prev) => {
      const idx = prev.findIndex((e) => e.id === example.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = example;
        return next;
      }
      return [...prev, example];
    });
    setShowForm(false);
    setEditingExample(undefined);
  };

  const handleDeleteExample = async (id: string) => {
    try {
      await queryExamplesApi.delete(datasourceId, id);
      setExamples((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error("Failed to delete query example:", err);
    }
  };

  const handleVerifyExample = async (example: TableQueryExample) => {
    try {
      const updated = await queryExamplesApi.update(datasourceId, example.id, {
        is_verified: example.is_verified ? 0 : 1,
      });
      setExamples((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e))
      );
    } catch (err) {
      console.error("Failed to toggle verification:", err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Table selector */}
      <div>
        <label className="label-mono">表</label>
        <select
          value={selectedTable}
          onChange={(e) => handleSelectTable(e.target.value)}
          className="input-field text-sm"
        >
          {tables.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Examples list */}
      {examplesLoading ? (
        <p className="text-sm text-[var(--steel)]">加载中...</p>
      ) : examples.length === 0 && !showForm ? (
        <div className="card-cream text-center py-8">
          <p className="text-sm text-[var(--on-cream)]">
            {selectedTable} 暂无查询示例
          </p>
          <button
            onClick={() => { setShowForm(true); setEditingExample(undefined); }}
            className="btn-primary text-xs mt-3"
          >
            添加示例
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--ink)]">
              示例 ({examples.length})
            </h3>
            <button
              onClick={() => { setShowForm(true); setEditingExample(undefined); }}
              className="btn-secondary text-xs"
            >
              + 添加示例
            </button>
          </div>

          <div className="space-y-2">
            {examples.map((ex) => (
              <div key={ex.id} className="card-base">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--ink)] font-medium">
                      {ex.question}
                    </p>
                    <pre className="mt-1 text-xs font-mono text-[var(--slate)] whitespace-pre-wrap bg-[var(--surface)] rounded p-2 border border-[var(--hairline-soft)]">
                      {ex.sql}
                    </pre>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleVerifyExample(ex)}
                      className={`btn-ghost text-xs px-2 py-1 ${
                        ex.is_verified
                          ? "text-[var(--success)]"
                          : "text-[var(--stone)]"
                      }`}
                      title={ex.is_verified ? "已验证 — 点击取消" : "未验证 — 点击确认"}
                    >
                      {ex.is_verified ? "已验证" : "验证"}
                    </button>
                    <button
                      onClick={() => { setEditingExample(ex); setShowForm(true); }}
                      className="btn-ghost text-xs px-2 py-1"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDeleteExample(ex.id)}
                      className="btn-danger text-xs px-2 py-1"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <QueryExampleForm
          datasourceId={datasourceId}
          tableName={selectedTable}
          existing={editingExample}
          onSave={handleSaveExample}
          onCancel={() => { setShowForm(false); setEditingExample(undefined); }}
        />
      )}
    </div>
  );
}
