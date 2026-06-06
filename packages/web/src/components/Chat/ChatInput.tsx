import { useState, useRef, type KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
  onNewTopic?: () => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, onNewTopic, disabled }: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="border-t border-[var(--hairline)] bg-[var(--canvas)] p-4">
      <div className="max-w-3xl mx-auto input-well flex items-end gap-2 px-4 py-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask about your data…"
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-[var(--ink)] placeholder-[var(--stone)]
                     focus:outline-none min-h-[24px] max-h-[200px] leading-relaxed"
        />
        {onNewTopic && (
          <button
            onClick={onNewTopic}
            disabled={disabled}
            className="shrink-0 h-8 px-3 flex items-center justify-center rounded-md
                       bg-[var(--surface)] border border-[var(--hairline-strong)] text-xs font-medium
                       text-[var(--steel)] hover:text-[var(--ink)] hover:border-[var(--steel)] transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🔄 新话题
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md
                     bg-[var(--primary)] text-white text-sm font-medium
                     hover:bg-[var(--primary-deep)] transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↑
        </button>
      </div>
      <p className="text-xs text-[var(--stone)] text-center mt-2">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
