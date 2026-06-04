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
                   bg-[var(--primary-soft)] border border-[var(--primary)]/30
                   text-xs text-[var(--primary-text)] cursor-pointer
                   hover:bg-[var(--primary)]/20 transition-colors"
      >
        {value}
      </span>
    );
  }

  return (
    <span
      onClick={() => { setDraft(""); setEditing(true); }}
      className="inline-block px-2 py-0.5 rounded-md
                 border border-dashed border-[var(--hairline-strong)]
                 text-xs text-[var(--stone)] cursor-pointer
                 hover:border-[var(--steel)] hover:text-[var(--steel)] transition-colors"
    >
      {placeholder}
    </span>
  );
}