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
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
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
        className="w-full px-2 py-1 text-caption border border-form-focus-violet rounded-xs
                   focus:outline-none focus:ring-1 focus:ring-form-focus-violet bg-canvas-white"
      />
    );
  }

  if (value) {
    return (
      <span
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="inline-block px-2 py-0.5 bg-coral/10 border border-soft-coral/40 rounded-xs
                   text-caption text-coral cursor-pointer hover:bg-coral/20 transition-colors"
      >
        {value}
      </span>
    );
  }

  return (
    <span
      onClick={() => {
        setDraft("");
        setEditing(true);
      }}
      className="inline-block px-2 py-0.5 border border-dashed border-hairline rounded-xs
                 text-caption text-muted-slate cursor-pointer hover:border-muted-slate transition-colors"
    >
      {placeholder}
    </span>
  );
}
