import { useState, useCallback } from "react";
import type { SchemaAnnotation, TableQueryExample } from "../../api/client";
import { schemasApi, queryExamplesApi } from "../../api/client";
import AIAnnotationReview from "./AIAnnotationReview";
import QueryExampleForm from "./QueryExampleForm";
import SchemaPromptPreview from "./SchemaPromptPreview";
import AIAnnotationProgress from "./AIAnnotationProgress";

interface SchemaEnhancementProps {
  datasourceId: string;
  tables: string[];
}

type TabId = "ai-annotate" | "query-examples" | "prompt-preview";

export default function SchemaEnhancement({ datasourceId, tables }: SchemaEnhancementProps) {
  const [activeTab, setActiveTab] = useState<TabId>("ai-annotate");

  // AI Annotate state
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [annotating, setAnnotating] = useState(false);
  const [draftAnnotations, setDraftAnnotations] = useState<SchemaAnnotation[]>([]);
  const [annotateError, setAnnotateError] = useState<string | null>(null);
  const [annotateProgress, setAnnotateProgress] = useState<{
    status: "discovering" | "analyzing" | "generating" | "done" | "error";
    message: string;
    tableCount: number;
    completedCount: number;
  } | null>(null);
  const [tableSearch, setTableSearch] = useState("");

  // Query Examples state
  const [selectedTable, setSelectedTable] = useState<string>(tables[0] ?? "");
  const [examples, setExamples] = useState<TableQueryExample[]>([]);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingExample, setEditingExample] = useState<TableQueryExample | undefined>(undefined);

  const toggleTable = (name: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelectedTables(new Set(tables));
  const selectNone = () => setSelectedTables(new Set());

  const handleAiAnnotate = async () => {
    if (selectedTables.size === 0) return;
    setAnnotating(true);
    setAnnotateError(null);
    setDraftAnnotations([]);

    const tableList = Array.from(selectedTables);

    try {
      setAnnotateProgress({
        status: "discovering",
        message: "正在发现所选表的结构和样本数据...",
        tableCount: tableList.length,
        completedCount: 0,
      });

      setAnnotateProgress({
        status: "generating",
        message: "AI 正在分析表结构并生成业务标注...",
        tableCount: tableList.length,
        completedCount: 0,
      });

      await schemasApi.aiAnnotate(datasourceId, tableList);

      setAnnotateProgress({
        status: "done",
        message: `标注完成。请检查 ${tableList.length} table(s) below.`,
        tableCount: tableList.length,
        completedCount: tableList.length,
      });

      const schemaResp = await schemasApi.get(datasourceId);
      const drafts = schemaResp.annotations.filter((a) => a.status === "draft");
      setDraftAnnotations(drafts);
    } catch (err) {
      setAnnotateError((err as Error).message);
      setAnnotateProgress({
        status: "error",
        message: (err as Error).message,
        tableCount: tableList.length,
        completedCount: 0,
      });
    } finally {
      setAnnotating(false);
    }
  };

  const handleAcceptAll = async () => {
    for (const a of draftAnnotations) {
      await schemasApi.confirmAnnotation(datasourceId, a.id);
    }
    setDraftAnnotations([]);
  };

  const handleConfirmAnnotation = (id: string) => {
    setDraftAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const handleRejectAnnotation = (id: string) => {
    setDraftAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const handleEditAnnotation = (id: string, newAnnotation: string) => {
    setDraftAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, annotation: newAnnotation } : a))
    );
  };

  // Query Examples handlers
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

  const tabs: { id: TabId; label: string }[] = [
    { id: "ai-annotate", label: "AI 标注" },
    { id: "query-examples", label: "查询示例" },
    { id: "prompt-preview", label: "提示词预览" },
  ];

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--hairline)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-[var(--primary)] text-[var(--primary-text)]"
                : "border-transparent text-[var(--steel)] hover:text-[var(--ink)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* AI Annotate tab */}
      {activeTab === "ai-annotate" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-[var(--ink)] mb-2">
              Select tables to annotate
            </h3>
            <div className="flex items-center gap-2 mb-3">
              <button onClick={selectAll} className="btn-ghost text-xs">
                Select All
              </button>
              <button onClick={selectNone} className="btn-ghost text-xs">
                Select None
              </button>
            </div>
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="搜索表名..."
              className="w-full px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--hairline)] rounded-md text-[var(--ink)] placeholder-[var(--steel)] focus:outline-none focus:border-[var(--primary)] mb-3"
            />
            <div className="flex flex-wrap gap-2">
              {tables
                .filter(t => !tableSearch || t.toLowerCase().includes(tableSearch.toLowerCase()))
                .map((name) => (
                <button
                  key={name}
                  onClick={() => toggleTable(name)}
                  className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    selectedTables.has(name)
                      ? "bg-[var(--primary-soft)] border border-[var(--primary)]/30 text-[var(--primary-text)]"
                      : "bg-[var(--surface)] border border-[var(--hairline)] text-[var(--steel)] hover:border-[var(--hairline-strong)]"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {annotateProgress && (
            <AIAnnotationProgress
              status={annotateProgress.status}
              message={annotateProgress.message}
              tableCount={annotateProgress.tableCount}
              completedCount={annotateProgress.completedCount}
            />
          )}

          <button
            onClick={handleAiAnnotate}
            disabled={annotating || selectedTables.size === 0}
            className="btn-primary text-sm disabled:opacity-40"
          >
            {annotating ? "Annotating..." : `标注 ${selectedTables.size} 个表`}
          </button>

          {annotateError && (
            <div className="p-3 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-sm">
              {annotateError}
            </div>
          )}

          {draftAnnotations.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-[var(--ink)]">
                  Draft Annotations ({draftAnnotations.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button onClick={handleAcceptAll} className="btn-primary text-xs">
                    ✓ Accept All
                  </button>
                  <button onClick={() => setDraftAnnotations([])} className="btn-ghost text-xs">
                    ✗ Reject All
                  </button>
                </div>
              </div>
              <AIAnnotationReview
                annotations={draftAnnotations}
                datasourceId={datasourceId}
                onConfirm={handleConfirmAnnotation}
                onReject={handleRejectAnnotation}
                onEdit={handleEditAnnotation}
              />
            </div>
          )}
        </div>
      )}

      {/* Query Examples tab */}
      {activeTab === "query-examples" && (
        <div className="space-y-4">
          {/* Table selector */}
          <div>
            <label className="label-mono">Table</label>
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
            <p className="text-sm text-[var(--steel)]">Loading examples...</p>
          ) : examples.length === 0 && !showForm ? (
            <div className="card-cream text-center py-8">
              <p className="text-sm text-[var(--on-cream)]">
                No query examples for {selectedTable}
              </p>
              <button
                onClick={() => { setShowForm(true); setEditingExample(undefined); }}
                className="btn-primary text-xs mt-3"
              >
                Add Example
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-[var(--ink)]">
                  Examples ({examples.length})
                </h3>
                <button
                  onClick={() => { setShowForm(true); setEditingExample(undefined); }}
                  className="btn-cream text-xs"
                >
                  + Add Example
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
                          {ex.is_verified ? "Verified" : "Verify"}
                        </button>
                        <button
                          onClick={() => { setEditingExample(ex); setShowForm(true); }}
                          className="btn-ghost text-xs px-2 py-1"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteExample(ex.id)}
                          className="btn-danger text-xs px-2 py-1"
                        >
                          Delete
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
      )}

      {/* Prompt Preview tab */}
      {activeTab === "prompt-preview" && (
        <SchemaPromptPreview datasourceId={datasourceId} />
      )}
    </div>
  );
}
