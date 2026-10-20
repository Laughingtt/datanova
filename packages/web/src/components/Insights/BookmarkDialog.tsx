import { useState, useRef, useEffect } from "react";
import { bookmarksApi } from "../../api/client";
import { useModalAnimation } from "../../hooks/useGsapAnimations";

interface BookmarkDialogProps {
  dsId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function BookmarkDialog({ dsId, onClose, onCreated }: BookmarkDialogProps) {
  const [title, setTitle] = useState("");
  const [sql, setSql] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { open, close } = useModalAnimation(overlayRef, contentRef, onClose);

  useEffect(() => { open(); }, [open]);

  const handleSave = async () => {
    if (!title.trim() || !sql.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await bookmarksApi.create(dsId, { title: title.trim(), sql: sql.trim() });
      onCreated();
      close();
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div ref={overlayRef} className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={close} />
      <div ref={contentRef} className="relative w-[520px] max-w-[90vw] bg-[var(--popover)] rounded-xl ring-1 ring-[color-mix(in_srgb,var(--foreground)_10%,transparent)] shadow-[var(--shadow-3)]">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">添加收藏报表</h2>
          <p className="text-xs text-[var(--muted-foreground)] mb-5">输入 SQL 查询语句，将其保存为收藏报表</p>

          <div className="space-y-4">
            <div>
              <label className="label-mono">报表标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：周度营收总览"
                className="input-field"
                autoFocus
              />
            </div>
            <div>
              <label className="label-mono">SQL 查询</label>
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                placeholder={"SELECT date, SUM(amount)\nFROM orders\nGROUP BY date\nORDER BY date DESC\nLIMIT 30"}
                rows={6}
                className="input-field font-mono text-xs resize-y"
                spellCheck={false}
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 text-xs text-[var(--error)] bg-[var(--error-soft)] rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 mt-5">
            <button onClick={close} className="btn-secondary text-xs">取消</button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim() || !sql.trim()}
              className="btn-primary text-xs disabled:opacity-40"
            >
              {saving ? "保存中..." : "保存并执行"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
