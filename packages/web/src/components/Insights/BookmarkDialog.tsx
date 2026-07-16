import { useState } from "react";
import { bookmarksApi } from "../../api/client";

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

  const handleSave = async () => {
    if (!title.trim() || !sql.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await bookmarksApi.create(dsId, { title: title.trim(), sql: sql.trim() });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[520px] max-w-[90vw] bg-[var(--surface)] rounded-2xl shadow-2xl animate-in">
        <div className="sunset-stripe rounded-t-2xl" />
        <div className="p-6">
          <h2 className="font-display text-lg text-[var(--ink)] mb-1">添加收藏报表</h2>
          <p className="text-xs text-[var(--steel)] mb-5">输入 SQL 查询语句，将其保存为收藏报表</p>

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
            <button onClick={onClose} className="btn-secondary text-xs">取消</button>
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
