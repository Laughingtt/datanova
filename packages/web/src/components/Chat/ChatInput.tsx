import { useState, useRef } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-hairline px-6 py-4">
      <div className="max-w-3xl mx-auto flex items-end gap-3">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask a question about your database..."
          rows={1}
          className="flex-1 resize-none input-field min-h-[42px] max-h-[120px]"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="btn-primary shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  );
}
