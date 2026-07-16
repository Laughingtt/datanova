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
          placeholder="输入你的问题，查询数据库…"
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-[var(--ink)] placeholder-[var(--stone)]
                     focus:outline-none min-h-[24px] max-h-[200px] leading-relaxed font-body"
        />
        {onNewTopic && (
          <button
            onClick={onNewTopic}
            disabled={disabled}
            className="shrink-0 h-8 px-3 flex items-center gap-1.5 rounded-lg
                       bg-[var(--canvas)] border border-[var(--hairline-strong)] text-xs font-medium
                       text-[var(--steel)] hover:text-[var(--ink)] hover:border-[var(--steel)] transition-all duration-200
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            新话题
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
                     bg-[var(--primary)] text-white text-sm font-medium
                     hover:bg-[var(--primary-deep)] hover:shadow-md transition-all duration-200
                     active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <p className="text-[10px] text-[var(--stone)] text-center mt-2">
        Enter 发送 · Shift+Enter 换行
      </p>
    </div>
  );
}
