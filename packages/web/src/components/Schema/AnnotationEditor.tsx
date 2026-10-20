import { useState, useRef, useEffect } from "react";

interface AnnotationEditorProps {
  value: string | null;
  onSave: (value: string) => void;
  placeholder?: string;
}

export default function AnnotationEditor({ value, onSave, placeholder = "添加标注" }: AnnotationEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed) onSave(trimmed);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleSave(); }
    else if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="input-field text-xs py-1 px-2"
      />
    );
  }

  if (value) {
    return (
      <span
        onClick={() => { setDraft(value); setEditing(true); }}
        className="inline-block px-2 py-0.5 rounded-md
                   bg-[var(--accent)] border border-[color-mix(in_srgb,var(--primary)_30%,transparent)]
                   text-xs text-[var(--accent-foreground)] cursor-pointer
                   hover:bg-[var(--primary-soft)] transition-colors"
      >
        {value}
      </span>
    );
  }

  return (
    <span
      onClick={() => { setDraft(""); setEditing(true); }}
      className="inline-block px-2 py-0.5 rounded-md
                 border border-dashed border-[var(--border)]
                 text-xs text-[var(--muted-foreground)] cursor-pointer
                 hover:border-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
    >
      {placeholder}
    </span>
  );
}