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
        <p className="text-sm text-[var(--on-cream)]">No draft annotations to review</p>
        <p className="text-xs text-[var(--slate)] mt-2">
          Use AI Annotate to generate draft annotations first
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {annotations.map((ann) => {
        const isEditing = editingId === ann.id;
        const isConfirming = confirming === ann.id;

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
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--ink)] leading-relaxed mb-3">
                {ann.annotation}
              </p>
            )}

            {/* Actions */}
            {!isEditing && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleConfirm(ann.id)}
                  disabled={isConfirming}
                  className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {isConfirming ? "Confirming..." : "Confirm"}
                </button>
                <button
                  onClick={() => handleStartEdit(ann.id, ann.annotation)}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  Edit
                </button>
                <button
                  onClick={() => onReject(ann.id)}
                  className="btn-danger text-xs px-3 py-1.5"
                >
                  Reject
                </button>
              </div>
            )}

            {/* Domain info */}
            {ann.domain_type && (
              <div className="mt-2 text-xs text-[var(--steel)]">
                <span className="font-mono uppercase">{ann.domain_type}</span>
                {ann.domain_values && (
                  <span className="ml-1">: {ann.domain_values}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
