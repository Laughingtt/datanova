import { useState, useEffect, useCallback } from "react";
import SchemaTree from "./SchemaTree";
import SchemaEnhancement from "./SchemaEnhancement";
import QueryExamplesPanel from "./QueryExamplesPanel";
import SchemaPromptPreview from "./SchemaPromptPreview";
import { useAppStore } from "../../stores/app";
import { schemasApi, datasourcesApi, type SchemaResponse } from "../../api/client";
import { toast } from "../../stores/toast";

type TabId = "annotate" | "auto-annotate" | "query-examples" | "prompt-preview";

export default function SchemaPage() {
  const { selectedDatasourceId, setSelectedDatasource } = useAppStore();
  const [mode, setMode] = useState<TabId>("annotate");
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [datasourceNotFound, setDatasourceNotFound] = useState(false);

  // Validate that selectedDatasourceId still exists; if not, auto-select the first available
  useEffect(() => {
    if (!selectedDatasourceId) return;
    datasourcesApi.list().then((list) => {
      const exists = list.some((ds) => ds.id === selectedDatasourceId);
      if (!exists && list.length > 0) {
        const first = list[0];
        setSelectedDatasource(first.id, first.name);
        setDatasourceNotFound(false);
      } else if (!exists) {
        setSelectedDatasource(null, null);
        setDatasourceNotFound(true);
      } else {
        setDatasourceNotFound(false);
      }
    }).catch(() => {});
  }, [selectedDatasourceId, setSelectedDatasource]);

  const loadTableNames = useCallback(async () => {
    if (!selectedDatasourceId) return;
    setTablesLoading(true);
    try {
      const result: SchemaResponse = await schemasApi.get(selectedDatasourceId);
      setTableNames(result.schema.tables.map((t) => t.table.name));
    } catch (err) {
      toast.error("加载表列表失败", err instanceof Error ? err.message : undefined);
      setTableNames([]);
    } finally {
      setTablesLoading(false);
    }
  }, [selectedDatasourceId]);

  useEffect(() => {
    if (mode !== "annotate") loadTableNames();
  }, [mode, loadTableNames]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "annotate", label: "手动标注" },
    { id: "auto-annotate", label: "AI 自动标注" },
    { id: "query-examples", label: "查询示例" },
    { id: "prompt-preview", label: "提示词预览" },
  ];

  return (
    <div className="h-full overflow-auto bg-[var(--background)]">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-[var(--foreground)]">Schema 标注</h2>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            为数据库 Schema 添加业务语义，提升 AI 查询准确度
          </p>
        </div>

        {!selectedDatasourceId ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-8 py-16 text-center">
            <p className="text-sm text-[var(--foreground)]">请先选择数据源</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              前往数据源页面选择一个数据源来标注其 Schema
            </p>
          </div>
        ) : datasourceNotFound ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-8 py-16 text-center">
            <p className="text-sm text-[var(--foreground)]">数据源连接已失效</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              之前选择的数据源已被删除，请重新选择数据源
            </p>
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div className="tabs-track mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setMode(tab.id)}
                  data-active={mode === tab.id}
                  className="tab-trigger"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {mode === "annotate" ? (
              <SchemaTree />
            ) : tablesLoading ? (
              <p className="text-sm text-[var(--muted-foreground)]">加载中...</p>
            ) : mode === "auto-annotate" ? (
              <SchemaEnhancement
                datasourceId={selectedDatasourceId}
                tables={tableNames}
              />
            ) : mode === "query-examples" ? (
              <QueryExamplesPanel
                datasourceId={selectedDatasourceId}
                tables={tableNames}
              />
            ) : (
              <SchemaPromptPreview datasourceId={selectedDatasourceId} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
