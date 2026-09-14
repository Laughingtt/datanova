import { useState } from "react";
import type { SchemaAnnotation } from "../../api/client";
import { schemasApi } from "../../api/client";
import AIAnnotationReview from "./AIAnnotationReview";
import AIAnnotationProgress from "./AIAnnotationProgress";

interface SchemaEnhancementProps {
  datasourceId: string;
  tables: string[];
}

export default function SchemaEnhancement({ datasourceId, tables }: SchemaEnhancementProps) {
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
        message: `标注完成。请检查 ${tableList.length} 个表的草稿标注。`,
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

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-[var(--ink)] mb-2">
          选择要标注的表
        </h3>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={selectAll} className="btn-ghost text-xs">
            全选
          </button>
          <button onClick={selectNone} className="btn-ghost text-xs">
            全不选
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
        {annotating ? "标注中..." : `标注 ${selectedTables.size} 个表`}
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
              草稿标注 ({draftAnnotations.length})
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={handleAcceptAll} className="btn-primary text-xs">
                ✓ 全部接受
              </button>
              <button onClick={() => setDraftAnnotations([])} className="btn-ghost text-xs">
                ✗ 全部拒绝
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
  );
}
