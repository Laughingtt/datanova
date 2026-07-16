import { useState } from "react";
import type { SchemaAnnotation } from "../../api/client";
import { schemasApi } from "../../api/client";

interface AIAnnotationReviewProps {
  annotations: SchemaAnnotation[];
  datasourceId: string;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string, newAnnotation: string) => void;
}

function formatSampleData(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    return null;
  } catch {
    return null;
  }
}

export default function AIAnnotationReview({
  annotations,
  datasourceId,
  onConfirm,
  onReject,
  onEdit,
}: AIAnnotationReviewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const handleStartEdit = (id: string, current: string) => {
    setEditingId(id);
    setEditDraft(current);
  };

  const handleSaveEdit = (id: string) => {
    const trimmed = editDraft.trim();
    if (trimmed) {
      onEdit(id, trimmed);
    }
    setEditingId(null);
    setEditDraft("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const handleConfirm = async (id: string) => {
    setConfirming(id);
    try {
      await schemasApi.confirmAnnotation(datasourceId, id);
      onConfirm(id);
    } catch (err) {
      console.error("Failed to confirm annotation:", err);
    } finally {
      setConfirming(null);
    }
  };

  if (annotations.length === 0) {
    return (
      <div className="card-cream text-center py-12">
        <p className="text-sm text-[var(--on-cream)]">暂无草稿标注</p>
        <p className="text-xs text-[var(--slate)] mt-2">
          使用 AI 自动标注来生成草稿标注
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {annotations.map((ann) => {
        const isEditing = editingId === ann.id;
        const isConfirming = confirming === ann.id;
        const samples = formatSampleData(ann.sample_data);

        return (
          <div
            key={ann.id}
            className="card-base border-l-2 border-l-[var(--sunshine-500)]"
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="label-mono inline">
                {ann.table_name}
              </span>
              {ann.field_name && (
                <>
                  <span className="text-[var(--stone)] text-xs">.</span>
                  <span className="text-xs font-mono text-[var(--slate)]">
                    {ann.field_name}
                  </span>
                </>
              )}
              {ann.column_type && (
                <span className="text-xs font-mono text-[var(--steel)] bg-[var(--surface)] px-1.5 py-0.5 rounded">
                  {ann.column_type}
                </span>
              )}
              <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-xs bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/20">
                draft
              </span>
            </div>

            {/* Annotation content */}
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={3}
                  className="input-field text-sm resize-y min-h-[60px]"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSaveEdit(ann.id)}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    保存
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--ink)] leading-relaxed mb-3">
                {ann.annotation}
              </p>
            )}

            {/* Domain info */}
            {ann.domain_type && (
              <div className="mb-2 flex items-center gap-2 text-xs">
                <span className="inline-flex items-center px-2 py-0.5 rounded font-mono uppercase bg-[var(--info-soft)] text-[var(--info)] border border-[var(--info)]/20">
                  {ann.domain_type === "enum" ? "枚举型" : "范围型"}
                </span>
                {ann.domain_values && (
                  <span className="text-[var(--steel)]">
                    {ann.domain_type === "enum"
                      ? `值域: ${ann.domain_values}`
                      : `范围: ${ann.domain_values}`}
                  </span>
                )}
              </div>
            )}

            {/* Sample data */}
            {samples && samples.length > 0 && (
              <div className="mb-3 text-xs">
                <span className="text-[var(--steel)]">样本值: </span>
                <div className="inline-flex flex-wrap gap-1 mt-0.5">
                  {samples.slice(0, 8).map((v, i) => (
                    <span
                      key={i}
                      className="inline-block px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--slate)] font-mono border border-[var(--hairline)]"
                    >
                      {v.length > 20 ? v.slice(0, 20) + "…" : v}
                    </span>
                  ))}
                  {samples.length > 8 && (
                    <span className="text-[var(--steel)]">+{samples.length - 8}</span>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            {!isEditing && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleConfirm(ann.id)}
                  disabled={isConfirming}
                  className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {isConfirming ? "确认中..." : "确认"}
                </button>
                <button
                  onClick={() => handleStartEdit(ann.id, ann.annotation)}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  编辑
                </button>
                <button
                  onClick={() => onReject(ann.id)}
                  className="btn-danger text-xs px-3 py-1.5"
                >
                  拒绝
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
