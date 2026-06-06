import { useState } from "react";
import { schemasApi } from "../../api/client";

interface SchemaPromptPreviewProps {
  datasourceId: string;
}

export default function SchemaPromptPreview({ datasourceId }: SchemaPromptPreviewProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await schemasApi.schemaPromptPreview(datasourceId);
      setPreview(result.preview);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={loadPreview}
          disabled={loading}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {loading ? "Loading..." : "Load Preview"}
        </button>
        <span className="text-xs text-[var(--steel)]">
          Preview the schema prompt the Agent sees at query time
        </span>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-[var(--error-soft)] text-[var(--error)] text-sm">
          {error}
        </div>
      )}

      {preview !== null && (
        <pre className="rounded-lg p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap
                        bg-[var(--surface-code)] text-[var(--on-dark)] border border-[var(--surface-code)]">
          {preview}
        </pre>
      )}
    </div>
  );
}
