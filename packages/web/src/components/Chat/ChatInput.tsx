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

  const canSend = !disabled && text.trim().length > 0;

  return (
    <div className="border-t border-[var(--border)] bg-[var(--background)] p-3">
      <div className="max-w-3xl mx-auto input-well flex items-end gap-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          data-chat-input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="输入你的问题，查询数据库…"
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]
                     focus:outline-none min-h-[24px] max-h-[200px] py-1 leading-relaxed"
        />
        {onNewTopic && (
          <button
            onClick={onNewTopic}
            disabled={disabled}
            className="shrink-0 inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)]
                       bg-[var(--background)] px-2 text-xs font-medium text-[var(--muted-foreground)]
                       transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]
                       disabled:opacity-40 disabled:pointer-events-none"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            新话题
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!canSend}
          aria-label="发送"
          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--primary)] text-white
                     transition-all duration-150 hover:bg-[var(--primary-deep)] active:translate-y-px
                     focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--ring)_40%,transparent)]
                     disabled:opacity-40 disabled:pointer-events-none"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <p className="text-[11px] text-[var(--muted-foreground)] text-center mt-1.5">
        Enter 发送 · Shift+Enter 换行
      </p>
    </div>
  );
}
